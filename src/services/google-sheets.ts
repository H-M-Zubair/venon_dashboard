import { google, type sheets_v4, type Auth } from 'googleapis';
import { env } from '@/config/environment.js';
import { supabaseConnection } from '@/database/supabase/connection.js';
import logger from '@/config/logger.js';
import { AppError } from '@/middleware/error.js';
import { GoogleSheetsExportService } from './google-sheets-export';
import { integrations } from 'googleapis/build/src/apis/integrations';
import { ExportConfig } from './google-sheets-export.js';

export interface Integration {
  id: string;
  email: string;
  created_at: string;
  connected: boolean;
  type: string;
  account_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

interface SheetUpdateOptions {
  spreadsheetId: string;
  oldSheetName?: string; // for renaming
  newSheetName?: string;
  selectedMetrics?: string[];
  checkRows?: boolean; // whether to validate appended rows
}
type Spreadsheet = sheets_v4.Schema$Spreadsheet;

/**
 * Wrapper around Google Sheets API that handles OAuth token lifecycle and
 * provides helper utilities for formatting Venon exports.
 */
class GoogleSheetsService {
  private sheetsClient: sheets_v4.Sheets | null = null;
  private authClient: Auth.OAuth2Client | null = null;
  private integrationId: string | null = null;
  private static readonly TOKEN_EXPIRY_BUFFER_MS = 60_000; // 1 minute

  /**
   * Initializes an authenticated Google Sheets client for the given integration.
   * Must be called before using any other method.
   */

  private supabase = supabaseConnection.getServiceClient();
  async initializeClient(integrationId: string): Promise<sheets_v4.Sheets> {
    const integration = await this.getIntegrationById(integrationId);
    const oauthClient = this.createOAuthClient();

    oauthClient.setCredentials({
      access_token: integration.access_token ?? undefined,
      refresh_token: integration.refresh_token ?? undefined,
      expiry_date: integration.expires_at ? new Date(integration.expires_at).getTime() : undefined,
      token_type: 'Bearer',
    });

    if (!integration.access_token || this.isTokenExpired(integration.expires_at)) {
      await this.refreshAccessToken(integrationId, oauthClient);
    }

    this.authClient = oauthClient;
    this.sheetsClient = google.sheets({ version: 'v4', auth: oauthClient });
    this.integrationId = integrationId;

    return this.sheetsClient;
  }

  /**
   * Creates a new spreadsheet with the provided title.
   */
  async createSpreadsheet(title: string): Promise<Spreadsheet> {
    const operation = async (client: sheets_v4.Sheets) => {
      const { data } = await client.spreadsheets.create({
        requestBody: {
          properties: {
            title,
          },
        },
      });
      return data;
    };

    return this.executeWithRetry('createSpreadsheet', operation);
  }

  /**
   * Fetches metadata for an existing spreadsheet.
   */
  async getSpreadsheet(spreadsheetId: string): Promise<Spreadsheet> {
    const operation = async (client: sheets_v4.Sheets) => {
      const { data } = await client.spreadsheets.get({
        spreadsheetId,
        includeGridData: false,
      });
      return data;
    };

    return this.executeWithRetry('getSpreadsheet', operation, spreadsheetId);
  }

  /**
   * Appends rows to the specified sheet.
   */
  async appendRows(spreadsheetId: string, sheetName: string, rows: any[]): Promise<void> {
    if (!rows.length) return;
    const range = `${sheetName}!A1`;
    const operation = async (client: sheets_v4.Sheets) => {
      await client.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: rows,
        },
      });
    };

    await this.executeWithRetry('appendRows', operation, spreadsheetId);
  }

  async ensureHeadersIfNeeded(spreadsheetId: string, sheetName: string, headers: any[]) {
    const client = this.ensureClient();
    const headerRange = `${sheetName}!A1:1`;

    const existing = await client.spreadsheets.values
      .get({
        spreadsheetId,
        range: headerRange,
        valueRenderOption: 'UNFORMATTED_VALUE',
      })
      .then((r) => r.data.values?.[0] ?? [])
      .catch(() => []);

    const needsWrite =
      !existing.length ||
      existing.length !== headers.length ||
      existing.some((v, i) => String(v) !== String(headers[i]));

    if (needsWrite) {
      await client.spreadsheets.values.update({
        spreadsheetId,
        range: headerRange,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [headers] },
      });
    }
  }

  /**
   * Applies standard formatting (bold header, freeze row, background color) to a sheet.
   */
  async formatSheet(
    spreadsheetId: string,
    sheetName: string,
    headerRowIndex: number = 0
  ): Promise<void> {
    const operation = async (client: sheets_v4.Sheets) => {
      const sheetId = await this.getSheetId(client, spreadsheetId, sheetName);

      await client.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId,
                  startRowIndex: headerRowIndex,
                  endRowIndex: headerRowIndex + 1,
                },
                cell: {
                  userEnteredFormat: {
                    textFormat: {
                      bold: true,
                    },
                    backgroundColor: {
                      red: 0.93,
                      green: 0.95,
                      blue: 0.98,
                    },
                  },
                },
                fields: 'userEnteredFormat(textFormat,backgroundColor)',
              },
            },
            {
              updateSheetProperties: {
                properties: {
                  sheetId,
                  gridProperties: {
                    frozenRowCount: headerRowIndex + 1,
                  },
                },
                fields: 'gridProperties.frozenRowCount',
              },
            },
          ],
        },
      });
    };

    await this.executeWithRetry('formatSheet', operation, spreadsheetId);
  }

  async disconnectAccount(integrationId: string) {
    const supabase = supabaseConnection.getServiceClient();

    const integration = await this.getGoogleSheetsIntegration(integrationId);
    // Check if any exports are using this integration
    const { count } = await supabase
      .from('google_sheets_exports')
      .select('*', { count: 'exact', head: true })
      .eq('integration_id', integrationId)
      .eq('active', true);

    if ((count || 0) > 0) {
      throw new AppError(
        `Cannot disconnect account. ${count} export configuration(s) are using this account. Delete or reassign exports first.`,
        400
      );
    }

    //create client OAuth
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      process.env.GOOGLE_OAUTH_REDIRECT_URI
    );
    if (!integration.refresh_token) {
      throw new AppError('No refresh token found for this integration', 400);
    }

    // Revoke token
    await oauth2Client.revokeToken(integration.refresh_token).catch((error) => {
      logger.error('Error revoking Google token:', error);
    });

    // Delete integration
    const { error } = await supabase
      .from('integrations')
      .update({ deleted_at: new Date().toISOString(), connected: false })
      .eq('id', integrationId)
      .eq('type', 'google-sheets');
    if (error) throw error;

    logger.info('Google account disconnected', {
      integrationId: integrationId,
      email: integration?.email,
    });
  }

  async exportDataToSheet(input: any, userId: string): Promise<ExportConfig> {
    const integration = await this.getIntegrationByUserId(userId);

    // Create spreadsheet if not provided
    let spreadsheetId = input.spreadsheet_id;
    let spreadsheetUrl = '';
    let last_export_at: string | null = null;
    let next_export_at: string | null = null;
    let existingSpreadsheet;
    let spreadsheetTitle;
    if (!spreadsheetId) {
      try {
        await googleSheetsService.initializeClient(input.integration_id);
        const spreadsheet = await googleSheetsService.createSpreadsheet(input.report_name);
        spreadsheetId = spreadsheet.spreadsheetId!;
        spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
        if (spreadsheet?.sheets && spreadsheet.sheets.length > 0) {
          spreadsheetTitle = spreadsheet.sheets[0]?.properties?.title;
        }
      } catch (error) {
        logger.error('Failed to create spreadsheet:', error);
        throw new AppError('Failed to create Google Sheet. Please try again.', 500);
      }
    } else {
      spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

      existingSpreadsheet = await GoogleSheetsExportService.getExportConfigBySheetId(spreadsheetId);
      if (!existingSpreadsheet) {
        throw new AppError('Spreadsheet not found', 404);
      }
      last_export_at =
        (existingSpreadsheet.last_export_at ?? existingSpreadsheet.updated_at) || null;
    }

    const exportsToInsert = {
      account_id: integration.account_id,
      integration_id: input.integration_id,
      report_name: input.report_name,
      spreadsheet_id: spreadsheetId,
      spreadsheet_url: spreadsheetUrl,
      sheet_name: spreadsheetTitle || 'Sheet1',
      sync_frequency: input.sync_frequency,
      attribution_model: input.attribution_model,
      granularity: input.granularity,
      start_date: input.start_date,
      end_date: input.end_date ?? null,
      last_export_at: last_export_at ?? null,
      next_export_at: next_export_at ?? null,
      selected_channels: input.selected_channels as string[],
      selected_metrics: input.selected_metrics as string[],
      active: true,
    };

    // Insert export configuration

    let newExportConfig;
    if (!existingSpreadsheet || existingSpreadsheet === undefined) {
      const { data: exportConfig, error: insertError } = await this.supabase
        .from('google_sheets_exports')
        .insert(exportsToInsert as any)
        .select('*')
        .single();

      if (insertError) {
        logger.error('Failed to insert export configuration:', insertError);
        throw new AppError('Failed to create export configuration', 500);
      }

      logger.info('Export configuration created');
      newExportConfig = exportConfig;
    }

    //    If one-time export, execute immediately
    if (input.sync_frequency === 'one-time') {
      try {
        await GoogleSheetsExportService.exportMetricsToSheet(
          newExportConfig?.id ?? existingSpreadsheet?.id
        );
        logger.info('One-time export executed successfully', { exportId: newExportConfig?.id });
      } catch (error) {
        logger.error('One-time export execution failed:', error);
        // Don't fail the API - export will be retried manually
      }
    }

    const finalConfig = newExportConfig ?? existingSpreadsheet;

    if (!finalConfig) {
      throw new AppError('Export configuration not found', 404);
    }
    return finalConfig;
  }

  async getExportsSheets(
    active: string,
    sync_frequency: string,
    userId: string,
    page: number,
    pageSize: number
  ) {
    const integration = await this.getIntegrationByUserId(userId);

    let query = this.supabase
      .from('google_sheets_exports')
      .select(
        `
            *,
            integrations:integration_id (email)
      `
      )
      .eq('account_id', integration.account_id);

    if (active === 'TRUE') {
      query = query.eq('active', true);
    } else if (active === 'FALSE') {
      query = query.eq('active', false);
    }

    if (sync_frequency && typeof sync_frequency === 'string') {
      query = query.eq('sync_frequency', sync_frequency);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await query.order('created_at', { ascending: false }).range(from, to);

    if (error) throw error;

    return data;
  }

  async getIntegrationsWithExports(userId: string) {
    const integrationsOfAccounts = await this.getAccountsIntegrations();
    // Get exports count for each integration
    const accountsWithExports = await Promise.all(
      (integrationsOfAccounts || []).map(async (integration: Integration) => {
        const { count } = await this.supabase
          .from('google_sheets_exports')
          .select('*', { count: 'exact', head: true })
          .eq('integration_id', integration.id)
          .eq('active', true);

        return {
          integration_id: integration.id,
          email: integration.email,
          connected_at: integration.created_at,
          exports_count: count || 0,
        };
      })
    );

    return accountsWithExports;
  }

  async updateExportConfig(exportId: string, updates: ExportConfig, userId: string) {
    const integration = await this.getIntegrationByUserId(userId);
    // Fetch current export
    const existingExport = await this.getExportSheetById(exportId, userId);

    // Check immutable fields if export has already run
    if (existingExport.last_export_at) {
      if (updates.sync_frequency && updates.sync_frequency !== existingExport.sync_frequency) {
        throw new AppError('Cannot change sync frequency after export has run', 400);
      }
      if (updates.granularity && updates.granularity !== existingExport.granularity) {
        throw new AppError('Cannot change granularity after export has run', 400);
      }
      if (updates.spreadsheet_id && updates.spreadsheet_id !== existingExport.spreadsheet_id) {
        throw new AppError('Cannot change spreadsheet after export has run', 400);
      }
    }

    // Update export
    const { data: updated, error: updateError } = (await this.supabase
      .from('google_sheets_exports')
      .update(updates)
      .eq('id', exportId)
      .eq('account_id', integration.account_id)
      .select('*')
      .single()) as { data: ExportConfig | null; error: any };

    if (updateError) throw updateError;

    logger.info('Export configuration updated', { exportId: exportId });

    return updated;
  }

  async updateGoogleSheet(integrationId: string, options: SheetUpdateOptions): Promise<void> {
    // 1. Initialize Google Sheets client
    await googleSheetsService.initializeClient(integrationId);

    const sheetName = options.newSheetName || options.oldSheetName || 'Sheet1';
    const client = googleSheetsService.ensureClient();

    // 2. Rename sheet if oldSheetName is provided
    if (
      options.oldSheetName &&
      options.newSheetName &&
      options.oldSheetName !== options.newSheetName
    ) {
      const sheetId = await googleSheetsService.getSheetId(
        client,
        options.spreadsheetId,
        options.oldSheetName
      );
      await client.spreadsheets.batchUpdate({
        spreadsheetId: options.spreadsheetId,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: { sheetId, title: options.newSheetName },
                fields: 'title',
              },
            },
          ],
        },
      });
    }

    // 3. Update headers if selectedMetrics are provided
    if (options.selectedMetrics && options.selectedMetrics.length > 0) {
      const headers = ['Date', ...options.selectedMetrics];

      if (options.checkRows) {
        // Optionally check if rows already exist and prevent overwriting
        const existingRows = await client.spreadsheets.values
          .get({
            spreadsheetId: options.spreadsheetId,
            range: `${sheetName}!A2:A`,
          })
          .then((r) => r.data.values || []);
        if (existingRows.length > 0) {
          console.warn(
            `Warning: Sheet "${sheetName}" has ${existingRows.length} existing rows. Headers will not overwrite data.`
          );
        } else {
          await googleSheetsService.ensureHeadersIfNeeded(
            options.spreadsheetId,
            sheetName,
            headers
          );
        }
      }
      await googleSheetsService.ensureHeadersIfNeeded(options.spreadsheetId, sheetName, headers);

      // Apply formatting to header row
      await googleSheetsService.formatSheet(options.spreadsheetId, sheetName);
    }
  }

  async deleteExportConfig(exportId: string, userId: string) {
    const { error: logsDeleteError } = await this.supabase
      .from('google_sheets_export_logs')
      .delete()
      .eq('export_config_id', exportId);

    if (logsDeleteError) {
      logger.error('Failed to delete export logs', { exportId, error: logsDeleteError });
      throw logsDeleteError;
    }

    const { data, error: deleteError } = await this.supabase
      .from('google_sheets_exports')
      .delete()
      .eq('id', exportId)
      .eq('account_id', userId)
      .select('report_name')
      .single();

    if (deleteError) throw deleteError;

    return data;
  }

  async getExportLogs(exportConfigId: string, userId: string, limit: number, status?: string) {
    const { data: exportConfig, error: configError } = await this.supabase
      .from('google_sheets_exports')
      .select('id')
      .eq('id', exportConfigId)
      .eq('account_id', userId)
      .single();

    if (configError || !exportConfig) {
      throw new AppError('Export configuration not found', 404);
    }

    // Fetch logs
    let query = this.supabase
      .from('google_sheets_export_logs')
      .select('*')
      .eq('export_config_id', exportConfigId)
      .order('created_at', { ascending: false })
      .limit(Math.min(parseInt(limit.toString()) || 30, 100));

    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    const { data: logs, error: logsError } = await query;

    if (logsError) throw logsError;

    return logs;
  }

  async getExportConfigByIntegrationId(integrationId: string) {
    const { data, error } = (await this.supabase
      .from('google_sheets_exports')
      .select('*')
      .eq('integration_id', integrationId)
      .eq('active', true)
      .single()) as { data: ExportConfig | null; error: any };

    if (error || !data) {
      logger.error('Failed to fetch export config:', error);
      throw new AppError('Export configuration not found', 404);
    }

    return data;
  }

  async getExportSheetById(exportId: string, userId: string) {
    const { data, error } = (await this.supabase
      .from('google_sheets_exports')
      .select(
        `
            *,
            integrations:integration_id (email)
          `
      )
      .eq('id', exportId)
      .single()) as { data: any; error: any };
    if (error || !data) {
      throw new AppError('Export configuration not found', 404);
    }

    return data;
  }

  /**
   * Refreshes and persists a new access token for the integration.
   */
  async refreshAccessToken(
    integrationId: string,
    existingClient?: Auth.OAuth2Client
  ): Promise<Auth.Credentials> {
    const integration = await this.getIntegrationById(integrationId);

    if (!integration.refresh_token) {
      throw new AppError(
        'Google integration is missing a refresh token. Please reconnect your Google account.',
        400
      );
    }

    const oauthClient = existingClient ?? this.createOAuthClient();
    oauthClient.setCredentials({
      refresh_token: integration.refresh_token,
    });

    try {
      const { credentials } = await oauthClient.refreshAccessToken();

      if (!credentials.access_token) {
        throw new AppError('Failed to refresh Google access token', 500);
      }

      await this.persistUpdatedTokens(integrationId, credentials);

      if (this.authClient && this.integrationId === integrationId) {
        this.authClient.setCredentials({
          ...this.authClient.credentials,
          access_token: credentials.access_token,
          expiry_date: credentials.expiry_date,
        });
      }

      return credentials;
    } catch (error) {
      this.handleGoogleApiError(error, 'refreshAccessToken', integrationId);
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private createOAuthClient(): Auth.OAuth2Client {
    return new google.auth.OAuth2(env.GOOGLE_OAUTH_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_SECRET);
  }

  private isTokenExpired(expiresAt?: string | null): boolean {
    if (!expiresAt) return true;
    const expiration = new Date(expiresAt).getTime();
    return expiration - Date.now() < GoogleSheetsService.TOKEN_EXPIRY_BUFFER_MS;
  }

  private ensureClient(): sheets_v4.Sheets {
    if (!this.sheetsClient || !this.authClient || !this.integrationId) {
      throw new AppError('Google Sheets client has not been initialized', 500);
    }
    return this.sheetsClient;
  }

  private async executeWithRetry<T>(
    context: string,
    operation: (client: sheets_v4.Sheets) => Promise<T>,
    resourceId?: string
  ): Promise<T> {
    const client = this.ensureClient();
    try {
      return await operation(client);
    } catch (error) {
      logger.error('Error executing Google Sheets operation', { context, resourceId, error });
      const status = this.extractStatusCode(error);

      if (status === 401 && this.integrationId) {
        logger.warn('Google Sheets token expired, attempting refresh', { context, resourceId });
        await this.refreshAccessToken(this.integrationId, this.authClient ?? undefined);
        await this.initializeClient(this.integrationId);
        return operation(this.ensureClient());
      }

      this.handleGoogleApiError(error, context, resourceId);
    }
  }

  private extractStatusCode(error: any): number | undefined {
    return error?.code ?? error?.response?.status ?? error?.status;
  }

  private async getIntegrationById(integrationId: string): Promise<Integration> {
    const { data, error } = await this.supabase
      .from('integrations')
      .select(
        `
        id,
        account_id,
        access_token,
        refresh_token,
        expires_at,
        connected,
        type,
        email
      `
      )
      .eq('id', integrationId)
      .eq('type', 'google-sheets')
      .eq('connected', true)
      .single();

    if (error || !data) {
      logger.error('Google Sheets integration not found', { integrationId, error });
      throw new AppError('Google Sheets integration not found', 404);
    }

    return data as Integration;
  }

  private async getIntegrationByUserId(userId: string): Promise<Integration> {
    const supabase = supabaseConnection.getServiceClient();

    const { data: integrations, error } = await supabase
      .from('integrations')
      .select(
        `
        *,
        accounts!inner (
            user_id
        )
        `
      )
      .eq('type', 'google-sheets')
      .eq('connected', true)
      .eq('accounts.user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching integrations:', error);
      throw error;
    }
    return integrations;
  }

  async getAccountsIntegrations(): Promise<Integration[]> {
    const { data: integrations, error } = await this.supabase
      .from('integrations')
      .select('*')
      .eq('type', 'google-sheets')
      .eq('connected', true);

    if (error) {
      logger.error('Error fetching Google Sheets integrations:', error);
      throw new AppError('Failed to fetch Google Sheets integrations', 500);
    }

    return integrations;
  }

  private async getGoogleSheetsIntegration(integrationId: string): Promise<Integration> {
    const supabase = supabaseConnection.getServiceClient();
    const { data, error } = await supabase
      .from('integrations')
      .select(
        `
        id,
        account_id,
        access_token,
        refresh_token,
        expires_at,
        connected,
        type,
        email
      `
      )
      .eq('id', integrationId)
      .eq('type', 'google-sheets')
      .eq('connected', true)
      .single();

    if (error || !data) {
      logger.error('Google Sheets integration not found', { integrationId, error });
      throw new AppError('Google Sheets integration not found', 404);
    }

    return data as Integration;
  }

  private async persistUpdatedTokens(
    integrationId: string,
    credentials: Auth.Credentials
  ): Promise<void> {
    const expiresAt = credentials.expiry_date
      ? new Date(credentials.expiry_date).toISOString()
      : null;

    const { error } = await this.supabase
      .from('integrations')
      .update({
        access_token: credentials.access_token as string,
        expires_at: expiresAt as string | null,
      })
      .eq('id', integrationId);

    if (error) {
      logger.error('Failed to persist refreshed Google token', { integrationId, error });
      throw new AppError('Unable to store refreshed Google token', 500);
    }
  }

  private async getSheetId(
    client: sheets_v4.Sheets,
    spreadsheetId: string,
    sheetName: string
  ): Promise<number> {
    const { data } = await client.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
    });

    const sheet = data.sheets?.find((s) => s.properties?.title === sheetName);

    if (sheet?.properties?.sheetId === undefined || sheet?.properties?.sheetId === null) {
      throw new AppError(`Sheet "${sheetName}" not found in spreadsheet`, 404);
    }

    return sheet.properties.sheetId;
  }

  private handleGoogleApiError(error: any, context: string, resourceId?: string): never {
    const status = this.extractStatusCode(error);
    const message = error?.message ?? error?.response?.data?.error?.message;

    logger.error('Google Sheets API error', {
      context,
      status,
      resourceId,
      message,
      errors: error?.errors ?? error?.response?.data?.error?.errors,
    });

    if (status === 401) {
      throw new AppError(
        'Google authorization expired. Please reconnect your Google account.',
        401
      );
    }

    if (status === 403) {
      throw new AppError(
        'Google Sheets permission denied. Please ensure the connected account has access to the sheet.',
        403
      );
    }

    if (status === 404) {
      throw new AppError(
        'The requested spreadsheet or sheet could not be found. Please verify the spreadsheet ID and sheet name.',
        404
      );
    }

    if (status === 429) {
      throw new AppError(
        'Google Sheets rate limit exceeded. Please try again in a few minutes.',
        429
      );
    }

    if (status && status >= 400 && status < 500) {
      throw new AppError(message || 'Google Sheets request failed', status);
    }

    throw new AppError('Unexpected Google Sheets error. Please try again later.', 502);
  }
}

export const googleSheetsService = new GoogleSheetsService();
