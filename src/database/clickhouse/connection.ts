import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { env } from '@/config/environment.js';
import logger from '@/config/logger.js';

class ClickHouseConnection {
  private client: ClickHouseClient | null = null;
  private isConnected = false;
  private currentNodeIndex = 0;
  private connectedHost: string | null = null;

  private getClickHouseNodes(): Array<{ url: string; host: string }> {
    // Support comma or semicolon-separated hosts for cluster configuration
    // Use semicolon in production to avoid issues with gcloud deployment
    const separator = env.CLICKHOUSE_HOST.includes(';') ? ';' : ',';
    const hosts = env.CLICKHOUSE_HOST.split(separator).map((h) => h.trim());
    return hosts.map((host) => {
      const isCloud = host.includes('.clickhouse.cloud');
      const protocol = isCloud ? 'https' : 'http';
      return {
        url: `${protocol}://${host}:${env.CLICKHOUSE_PORT}`,
        host,
      };
    });
  }

  async connect(): Promise<ClickHouseClient> {
    if (this.client && this.isConnected) {
      return this.client;
    }

    const nodes = this.getClickHouseNodes();
    let lastError: Error | null = null;

    // Try each node in order until one succeeds
    for (let i = 0; i < nodes.length; i++) {
      const nodeIndex = (this.currentNodeIndex + i) % nodes.length;
      const node = nodes[nodeIndex];
      if (!node) continue; // Skip if node is undefined

      try {
        this.client = createClient({
          url: node.url,
          username: env.CLICKHOUSE_USERNAME,
          password: env.CLICKHOUSE_PASSWORD,
          database: env.CLICKHOUSE_DATABASE,
          request_timeout: 60000, // 60 seconds
          clickhouse_settings: {
            async_insert: 1,
            wait_for_async_insert: 1,
          },
          compression: {
            response: true,
          },
        });

        logger.info('Attempting ClickHouse connection', {
          server: node.host,
          url: node.url,
          database: env.CLICKHOUSE_DATABASE,
          nodeIndex: nodeIndex + 1,
          totalNodes: nodes.length,
        });

        // Test connection
        await this.client.ping();
        this.isConnected = true;
        this.currentNodeIndex = nodeIndex; // Remember successful node
        this.connectedHost = node.host;

        logger.info('🚀 ClickHouse connection established successfully', {
          connectedServer: node.host,
          serverUrl: node.url,
          database: env.CLICKHOUSE_DATABASE,
          nodeIndex: nodeIndex + 1,
          totalNodes: nodes.length,
        });
        return this.client;
      } catch (error) {
        logger.warn(`Failed to connect to ClickHouse server`, {
          server: node.host,
          url: node.url,
          nodeIndex: nodeIndex + 1,
          totalNodes: nodes.length,
          error: (error as Error).message,
        });
        lastError = error as Error;

        // Clean up failed client
        if (this.client) {
          try {
            await this.client.close();
          } catch {}
          this.client = null;
        }
      }
    }

    // All nodes failed
    logger.error('Failed to connect to any ClickHouse node', {
      nodes,
      lastError,
    });
    throw new Error(`ClickHouse connection failed to all nodes: ${lastError?.message}`);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      const host = this.connectedHost;
      await this.client.close();
      this.client = null;
      this.isConnected = false;
      this.connectedHost = null;
      logger.info('ClickHouse connection closed', {
        server: host,
      });
    }
  }

  getConnectedServer(): string | null {
    return this.connectedHost;
  }

  getClient(): ClickHouseClient {
    if (!this.client || !this.isConnected) {
      throw new Error('ClickHouse client not connected. Call connect() first.');
    }
    return this.client;
  }

  async query<T = unknown>(query: string, params?: Record<string, unknown>): Promise<T[]> {
    const client = this.getClient();

    // Log query details in debug mode
    logger.debug('Executing ClickHouse query', {
      server: this.connectedHost,
      database: env.CLICKHOUSE_DATABASE,
      queryPreview: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
    });

    try {
      const result = await client.query({
        query,
        query_params: params,
        format: 'JSONEachRow',
      });

      return await result.json<T>();
    } catch (error) {
      logger.error('ClickHouse query failed:', { query, params, error });
      throw error;
    }
  }

  async insert<T = unknown>(
    table: string,
    data: T[],
    format: 'JSONEachRow' | 'CSV' = 'JSONEachRow'
  ): Promise<void> {
    const client = this.getClient();

    try {
      await client.insert({
        table,
        values: data,
        format,
      });

      logger.debug(`Inserted ${data.length} rows into ${table}`);
    } catch (error) {
      logger.error('ClickHouse insert failed:', { table, error });
      throw error;
    }
  }
}

export const clickhouseConnection = new ClickHouseConnection();

// Log initial configuration on module load
logger.info('ClickHouse client module loaded', {
  configuredHosts: env.CLICKHOUSE_HOST.split(',').map((h) => h.trim()),
  database: env.CLICKHOUSE_DATABASE,
  port: env.CLICKHOUSE_PORT,
});
