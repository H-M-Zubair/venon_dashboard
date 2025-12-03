import { z } from 'zod';

// ----------------------------------------
// ENUMS (extend anytime)
// ----------------------------------------
export const SyncFrequencyEnum = z.enum(['one-time', 'daily', 'weekly', 'monthly']);
export const AttributionModelEnum = z.enum([
  'linear_paid',
  'linear_all',
  'first_click',
  'last_click',
  'position_based',
]);
export const GranularityEnum = z.enum(['daily', 'weekly', 'monthly']);

// ----------------------------------------
// Channel → Metrics Dependency (custom rules)
// ----------------------------------------
const channelMetricMap: Record<string, string[]> = {
  google_ads: ['clicks', 'impressions', 'cost', 'conversions'],
  facebook_ads: ['reach', 'spend', 'clicks'],
  tiktok_ads: ['views', 'clicks'],
  // extend more…
};

const baseExportConfigFields = {
  report_name: z.string().min(3).max(100),
  integration_id: z.string().optional(),
  spreadsheet_id: z.string().optional(),
  sheet_name: z.string().min(1).max(100).optional(),

  sync_frequency: SyncFrequencyEnum,
  attribution_model: AttributionModelEnum,
  granularity: GranularityEnum,

  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),

  selected_channels: z.array(z.string()).min(1),
  selected_metrics: z.array(z.string()).min(1),

  notification_email: z.string().email().optional(),
  notify_on_success: z.boolean().optional(),
  notify_on_failure: z.boolean().optional(),
};

// ----------------------------------------
// CREATE SCHEMA
// ----------------------------------------
export const createExportConfigSchema = z
  .object(baseExportConfigFields)
  .superRefine((data, ctx) => {
    // Rule 1: end_date required for one-time
    if (data.sync_frequency === 'one-time' && !data.end_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: "end_date is required when sync_frequency is 'one-time'",
      });
    }

    // Rule 2: end_date must NOT exist for recurring frequencies
    if (data.sync_frequency !== 'one-time' && data.end_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: "end_date must be omitted when sync_frequency is not 'one-time'",
      });
    }

    // Rule 3: start_date <= end_date
    if (data.end_date && data.start_date > data.end_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'end_date must be greater than or equal to start_date',
      });
    }

    // Rule 4: Channel-specific metrics
    for (const metric of data.selected_metrics) {
      const allowedChannels = Object.keys(channelMetricMap || {}).filter((ch) => {
        return channelMetricMap && channelMetricMap[ch]?.includes(metric);
      });

      // If metric has channel dependency
      if (allowedChannels.length > 0) {
        const hasRequiredChannel = allowedChannels.some((ch) =>
          data.selected_channels.includes(ch)
        );

        if (!hasRequiredChannel) {
          ctx.addIssue({
            code: 'custom',
            path: ['selected_metrics'],
            message: `Metric "${metric}" requires one of these channels: ${allowedChannels.join(
              ', '
            )}`,
          });
        }
      }
    }
  });

// ----------------------------------------
// UPDATE SCHEMA (all fields optional)
// ----------------------------------------
export const updateExportConfigSchema = z
  .object({
    report_name: z.string().min(3).max(100).optional(),
    integration_id: z.string().optional(),
    spreadsheet_id: z.string().optional(),
    sheet_name: z.string().min(1).max(100).optional(),
    sync_frequency: SyncFrequencyEnum.optional(),
    attribution_model: AttributionModelEnum.optional(),
    granularity: GranularityEnum.optional(),

    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),

    selected_channels: z.array(z.string()).min(1).optional(),
    selected_metrics: z.array(z.string()).min(1).optional(),

    notification_email: z.string().email().optional(),
    notify_on_success: z.boolean().optional(),
    notify_on_failure: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    // Same rules applied on update (conditional)
    if (data.sync_frequency === 'one-time' && data.end_date === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: "end_date is required when sync_frequency is 'one-time'",
      });
    }

    if (data.sync_frequency && data.sync_frequency !== 'one-time' && data.end_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: "end_date must be omitted when sync_frequency is not 'one-time'",
      });
    }

    if (data.start_date && data.end_date && data.start_date > data.end_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'end_date must be >= start_date',
      });
    }
  });

// ----------------------------------------
// PARAM SCHEMA (UUID)
// ----------------------------------------
export const exportIdParamSchema = z.object({
  id: z.string().uuid(),
});
