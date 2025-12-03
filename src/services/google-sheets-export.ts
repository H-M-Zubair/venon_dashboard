import { googleSheetsService } from '@/services/google-sheets.js';
import logger from '@/config/logger.js';
import { AppError } from '@/middleware/error.js';
import { supabaseConnection } from '@/database/supabase/connection';

export interface ExportConfig {
  id: string;
  spreadsheet_id: string;
  spreadsheet_url: string;
  report_name: string;
  account_id: string;
  active: boolean;
  sheet_name: string;
  sync_frequency: 'one-time' | 'daily' | 'weekly' | 'monthly';
  attribution_model: string;
  granularity: string;
  start_date: string;
  end_date: string | null;
  selected_channels: string[];
  selected_metrics: string[];
  last_export_at: string | null;
  updated_at: string | null;
  integration_id: string;
  channel?: string;
}

/**
 * Google Sheets Export Service
 * Orchestrates the export of analytics data to Google Sheets
 */
export class GoogleSheetsExportService {
  private static supabase = supabaseConnection.getServiceClient();

  /**
   * Main export function - orchestrates entire export flow
   */
  static async exportMetricsToSheet(exportConfigId: string): Promise<void> {
    const logId = await this.startExportLog(exportConfigId);

    try {
      // Fetch export configuration
      const config = await this.getExportConfig(exportConfigId);
      logger.info('Starting export', { exportConfigId, config });

      // Initialize Google Sheets client
      await googleSheetsService.initializeClient(config.integration_id);

      // Determine date range for this export
      const { startDate, endDate } = this.getExportDateRange(config);

      // Query analytics data (stubbed for now)
      const analyticsData = await this.getAnalyticsDataForExport(config, startDate, endDate);

      // Transform data to sheet rows
      const { headers, rows } = this.transformDataToRows(analyticsData, config, startDate, endDate);

      await googleSheetsService.ensureHeadersIfNeeded(
        config.spreadsheet_id,
        config.sheet_name,
        headers
      );
      // Append to Google Sheet
      await googleSheetsService.appendRows(config.spreadsheet_id, config.sheet_name, [...rows]);

      // Format sheet (headers, freeze row)
      await googleSheetsService.formatSheet(config.spreadsheet_id, config.sheet_name);

      // Update export metadata
      await this.updateExportMetadata(exportConfigId, rows.length);

      // Log success
      await this.completeExportLog(logId, rows.length, new Date().getTime() - Date.now());

      logger.info('Export completed successfully', {
        exportConfigId,
        rowsExported: rows.length,
      });
    } catch (error) {
      logger.error('Export failed:', error);
      await this.failExportLog(logId, error as Error);
      throw error;
    }
  }

  static async getExportedSheetById(exportConfigId: string) {
    const sheet = await GoogleSheetsExportService.getExportConfig(exportConfigId);
    return sheet;
  }

  static async getExportConfigBySheetId(spreadsheetId: string) {
    const sheet = await GoogleSheetsExportService.getExportConfigBySpreadsheetId(spreadsheetId);
    return sheet;
  }

  /**
   * Get export configuration from database
   */
  private static async getExportConfig(exportConfigId: string): Promise<ExportConfig> {
    const { data, error } = await this.supabase
      .from('google_sheets_exports')
      .select('*')
      .eq('id', exportConfigId)
      .single();

    if (error || !data) {
      logger.error('Failed to fetch export config:', error);
      throw new AppError('Export configuration not found', 404);
    }

    return data as ExportConfig;
  }

  private static async getExportConfigBySpreadsheetId(
    spreadsheetId: string
  ): Promise<ExportConfig> {
    const supabase = supabaseConnection.getServiceClient();

    const { data, error } = await supabase
      .from('google_sheets_exports')
      .select('*')
      .eq('spreadsheet_id', spreadsheetId)
      .single();

    if (error || !data) {
      logger.error('Failed to fetch export config:', error);
      throw new AppError('Export configuration not found', 404);
    }

    return data as ExportConfig;
  }

  /**
   * Get analytics data from ClickHouse (STUB)
   * TODO: Replace with real ClickHouse queries
   */
  private static async getAnalyticsDataForExport(
    config: ExportConfig,
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    // STUB: Return mock data for now
    // In production, this will query ClickHouse based on:
    // - config.attribution_model
    // - config.granularity
    // - config.selected_channels
    // - config.selected_metrics
    // - startDate, endDate

    logger.info('Querying analytics data (STUB)', {
      startDate,
      endDate,
      channels: config.selected_channels,
      metrics: config.selected_metrics,
    });

    // Return mock time-series data
    return [
      {
        date: startDate,
        gross_revenue_total: 10000,
        orders: 50,
        ad_spend_total: 2000,
        'meta-ads.spend': 1000,
        'meta-ads.revenue': 4500,
        'meta-ads.roas': 4.5,
        'google-ads.spend': 1000,
        'google-ads.revenue': 3200,
        'google-ads.roas': 3.2,
        'new-header': 12000,
      },
    ];
  }

  /**
   * Determine date range for export
   */
  private static getExportDateRange(config: ExportConfig): { startDate: any; endDate: any } {
    const today = new Date();
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const twoDaysAgoStr = twoDaysAgo.toISOString().split('T')[0];

    if (config.sync_frequency === 'one-time') {
      // One-time: use configured start and end dates
      return {
        startDate: config.start_date,
        endDate: config.end_date!,
      };
    } else {
      // Auto-updating
      if (!config.last_export_at) {
        // First export: from start_date to 2 days ago
        return {
          startDate: config.start_date,
          endDate: twoDaysAgoStr,
        };
      } else {
        // Subsequent exports: from last_export_at + 1 day to 2 days ago
        const lastExportDate: Date = new Date(config.last_export_at);
        lastExportDate.setDate(lastExportDate.getDate() + 1);
        const nextStartDate = lastExportDate.toISOString().split('T')[0];

        return {
          startDate: nextStartDate,
          endDate: twoDaysAgoStr,
        };
      }
    }
  }

  /**
   * Transform analytics data to sheet rows
   */
  private static transformDataToRows(
    analyticsData: any[],
    config: ExportConfig,
    startDate: string,
    endDate: string
  ): { headers: any[]; rows: any[][] } {
    // Build header row
    const headers = ['Date', ...config.selected_metrics];

    // Transform each data row
    const rows = analyticsData.map((data) => [
      data.date,
      ...config.selected_metrics.map((metric) => {
        const value = data[metric];
        // Format based on metric type
        if (metric.includes('roas') || metric.includes('cac') || metric.includes('aov')) {
          return parseFloat(value).toFixed(2);
        }
        return value;
      }),
    ]);

    return { headers, rows };
  }

  /**
   * Update export metadata after successful export
   */
  private static async updateExportMetadata(
    exportConfigId: string,
    rowsExported: number
  ): Promise<void> {
    const { error } = await this.supabase
      .from('google_sheets_exports')
      .update({
        last_export_at: new Date().toISOString(),
      })
      .eq('id', exportConfigId);

    if (error) {
      logger.error('Failed to update export metadata:', error);
      throw error;
    }
  }

  /**
   * Start export attempt log
   */
  private static async startExportLog(exportConfigId: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('google_sheets_export_logs')
      .insert({
        export_config_id: exportConfigId,
        status: 'running',
        started_at: new Date().toISOString(),
        date_range_start: new Date().toISOString().split('T')[0],
        date_range_end: new Date().toISOString().split('T')[0],
        triggered_by: 'api',
      })
      .select('id')
      .single();

    if (error) {
      logger.error('Failed to create export log:', error);
      throw error;
    }

    return data?.id;
  }

  /**
   * Mark export log as successful
   */
  private static async completeExportLog(
    logId: string,
    rowsExported: number,
    durationMs: number
  ): Promise<void> {
    const supabase = supabaseConnection.getServiceClient();

    const { error } = await supabase
      .from('google_sheets_export_logs')
      .update({
        status: 'success',
        completed_at: new Date().toISOString(),
        rows_exported: rowsExported,
        duration_ms: durationMs,
      })
      .eq('id', logId);

    if (error) {
      logger.error('Failed to update export log:', error);
    }
  }

  /**
   * Mark export log as failed
   */
  private static async failExportLog(logId: string, error: Error): Promise<void> {
    const supabase = supabaseConnection.getServiceClient();

    const { error: updateError } = await supabase
      .from('google_sheets_export_logs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message,
        error_stack: error.stack,
      })
      .eq('id', logId);

    if (updateError) {
      logger.error('Failed to update export log error:', updateError);
    }
  }
}
