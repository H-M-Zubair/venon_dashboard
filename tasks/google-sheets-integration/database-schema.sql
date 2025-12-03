-- ============================================================================
-- TABLE 1: google_sheets_exports (new table for export configurations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.google_sheets_exports (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
account_id INTEGER NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  integration_id INTEGER NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  
  -- Report configuration
  report_name TEXT NOT NULL,
  spreadsheet_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  spreadsheet_url TEXT,
  
  -- Export settings
  sync_frequency TEXT NOT NULL CHECK (sync_frequency IN ('one-time', 'daily', 'weekly', 'monthly')),
  attribution_model TEXT NOT NULL CHECK (attribution_model IN ('linear_paid', 'linear_all', 'first_click', 'last_click', 'last_paid_click')),
  granularity TEXT NOT NULL CHECK (granularity IN ('daily', 'weekly', 'monthly')),
  
  -- Date range
  start_date DATE NOT NULL,
  end_date DATE,
  
  -- Channel and metric selection
  selected_channels TEXT[] NOT NULL CHECK (array_length(selected_channels, 1) > 0),
  selected_metrics TEXT[] NOT NULL CHECK (array_length(selected_metrics, 1) > 0),
  
  -- State management
  active BOOLEAN DEFAULT true,
  last_export_at TIMESTAMPTZ,
  next_export_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT one_time_requires_end_date CHECK (
    sync_frequency = 'one-time' AND end_date IS NOT NULL
    OR sync_frequency != 'one-time' AND end_date IS NULL
  )
);

-- Indexes for google_sheets_exports
CREATE INDEX idx_google_sheets_exports_account_id ON public.google_sheets_exports(account_id);

CREATE INDEX idx_google_sheets_exports_integration_id ON public.google_sheets_exports(integration_id);
CREATE INDEX idx_google_sheets_exports_next_export ON public.google_sheets_exports(next_export_at) WHERE active = true;
CREATE INDEX idx_google_sheets_exports_sync_frequency ON public.google_sheets_exports(sync_frequency) WHERE active = true;

-- ============================================================================
-- TABLE 2: google_sheets_export_logs (new table for export attempt logs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.google_sheets_export_logs (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  export_config_id INTEGER NOT NULL REFERENCES public.google_sheets_exports(id) ON DELETE CASCADE,
  
  -- Execution details
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  
  -- Export details
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  rows_exported INTEGER,
  duration_ms INTEGER,
  
  -- Error tracking
  error_message TEXT,
  error_stack TEXT,
  
  -- Metadata
  triggered_by TEXT NOT NULL DEFAULT 'api' CHECK (triggered_by IN ('api', 'cron', 'manual')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_date_range CHECK (date_range_end >= date_range_start),
  CONSTRAINT success_has_rows CHECK (status = 'success' AND rows_exported >= 0 OR status != 'success')
);

-- Indexes for google_sheets_export_logs
CREATE INDEX idx_google_sheets_export_logs_config_id ON public.google_sheets_export_logs(export_config_id);
CREATE INDEX idx_google_sheets_export_logs_created_at ON public.google_sheets_export_logs(created_at DESC);
CREATE INDEX idx_google_sheets_export_logs_status ON public.google_sheets_export_logs(status);
CREATE INDEX idx_google_sheets_export_logs_config_created ON public.google_sheets_export_logs(export_config_id, created_at DESC);

-- ============================================================================
-- FUNCTION 1: Update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for google_sheets_exports
DROP TRIGGER IF EXISTS update_google_sheets_exports_updated_at ON public.google_sheets_exports;
CREATE TRIGGER update_google_sheets_exports_updated_at BEFORE UPDATE ON public.google_sheets_exports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNCTION 2: Calculate next_export_at based on sync_frequency
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_next_export_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sync_frequency = 'one-time' THEN
    -- One-time exports don't have next_export_at
    NEW.next_export_at = NULL;
  ELSE
    -- For auto-updating, schedule next export at 10 AM UTC
    IF NEW.last_export_at IS NOT NULL THEN
      -- Already exported, calculate next based on last
      IF NEW.sync_frequency = 'daily' THEN
        NEW.next_export_at = (NEW.last_export_at + INTERVAL '1 day')::date AT TIME ZONE 'UTC' + INTERVAL '10 hours';
      ELSIF NEW.sync_frequency = 'weekly' THEN
        -- Next Monday at 10 AM UTC
        NEW.next_export_at = (NEW.last_export_at + INTERVAL '7 days')::date AT TIME ZONE 'UTC' + INTERVAL '10 hours';
      ELSIF NEW.sync_frequency = 'monthly' THEN
        -- 1st of next month at 10 AM UTC
        NEW.next_export_at = (date_trunc('month', NEW.last_export_at) + INTERVAL '1 month')::date AT TIME ZONE 'UTC' + INTERVAL '10 hours';
      END IF;
    ELSE
      -- First export, schedule for tomorrow at 10 AM UTC
      IF NEW.sync_frequency = 'daily' THEN
        NEW.next_export_at = (CURRENT_DATE AT TIME ZONE 'UTC' + INTERVAL '1 day' + INTERVAL '10 hours');
      ELSIF NEW.sync_frequency = 'weekly' THEN
        -- Next Monday at 10 AM UTC
        NEW.next_export_at = (CURRENT_DATE AT TIME ZONE 'UTC' + INTERVAL '1 day' + INTERVAL '10 hours');
      ELSIF NEW.sync_frequency = 'monthly' THEN
        -- 1st of next month at 10 AM UTC
        NEW.next_export_at = (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date AT TIME ZONE 'UTC' + INTERVAL '10 hours';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for google_sheets_exports
DROP TRIGGER IF EXISTS calculate_next_export_at_trigger ON public.google_sheets_exports;
CREATE TRIGGER calculate_next_export_at_trigger BEFORE INSERT OR UPDATE ON public.google_sheets_exports
  FOR EACH ROW EXECUTE FUNCTION calculate_next_export_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.google_sheets_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_sheets_export_logs ENABLE ROW LEVEL SECURITY;

-- Policy for google_sheets_exports - Users see only their own exports
DROP POLICY IF EXISTS export_config_select_policy ON public.google_sheets_exports;
CREATE POLICY export_config_select_policy ON public.google_sheets_exports
  FOR SELECT USING (
    account_id IN (
      SELECT id FROM public.accounts 
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS export_config_insert_policy ON public.google_sheets_exports;
CREATE POLICY export_config_insert_policy ON public.google_sheets_exports
  FOR INSERT WITH CHECK (
    account_id IN (
      SELECT id FROM public.accounts 
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS export_config_update_policy ON public.google_sheets_exports;
CREATE POLICY export_config_update_policy ON public.google_sheets_exports
  FOR UPDATE USING (
    account_id IN (
      SELECT id FROM public.accounts 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    account_id IN (
      SELECT id FROM public.accounts 
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS export_config_delete_policy ON public.google_sheets_exports;
CREATE POLICY export_config_delete_policy ON public.google_sheets_exports
  FOR DELETE USING (
    account_id IN (
      SELECT id FROM public.accounts 
      WHERE user_id = auth.uid()
    )
  );

-- Policy for google_sheets_export_logs - Users see only their own logs
DROP POLICY IF EXISTS export_logs_select_policy ON public.google_sheets_export_logs;
CREATE POLICY export_logs_select_policy ON public.google_sheets_export_logs
  FOR SELECT USING (
    export_config_id IN (
      SELECT id FROM public.google_sheets_exports 
      WHERE account_id IN (
        SELECT id FROM public.accounts 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Service role bypass (for cron jobs and background tasks)
ALTER TABLE public.google_sheets_exports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.google_sheets_export_logs FORCE ROW LEVEL SECURITY;