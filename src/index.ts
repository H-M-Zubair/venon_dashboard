import { env } from '@/config/environment.js';
import logger from '@/config/logger.js';
import app from '@/app.js';
import { clickhouseConnection } from '@/database/clickhouse/connection.js';
import { supabaseConnection } from '@/database/supabase/connection.js';

async function startServer() {
  try {
    // Initialize database connections
    logger.info('Initializing database connections...');

    // Connect to ClickHouse
    await clickhouseConnection.connect();
    const connectedServer = clickhouseConnection.getConnectedServer();
    logger.info('✓ ClickHouse connection established', {
      connectedTo: connectedServer,
      database: env.CLICKHOUSE_DATABASE,
    });

    // Verify Supabase connection (optional for development)
    const supabaseConnected = await supabaseConnection.verifyConnection();
    if (!supabaseConnected) {
      logger.warn('Supabase connection failed - continuing anyway for development');
    }

    // Start the server
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await clickhouseConnection.disconnect();
          logger.info('Database connections closed');

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
