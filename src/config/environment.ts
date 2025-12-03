import { z } from 'zod';
import dotenv from 'dotenv';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.string().transform(Number).default('8080'),

  // ClickHouse Configuration
  // Supports comma-separated hosts for cluster: '188.34.189.190,159.69.189.176'
  CLICKHOUSE_HOST: z.string().default('localhost'),
  CLICKHOUSE_PORT: z.string().transform(Number).default('8123'),
  CLICKHOUSE_USERNAME: z.string().default('default'),
  CLICKHOUSE_PASSWORD: z.string().optional(),
  CLICKHOUSE_DATABASE: z.string().default('venon'),

  // Supabase Configuration
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Google Ads Configuration (Required for ad management operations)
  GOOGLE_OAUTH_CLIENT_ID: z.string(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string(),
  GOOGLE_DEVELOPER_ACCOUNT: z.string(),

  // Testing/Development
  SIMULATE_FB_PERMISSION_ERROR: z
    .string()
    .transform((val) => val === 'true')
    .optional()
    .default('false'),
});

export type Environment = z.infer<typeof envSchema>;

function loadEnvironment(): Environment {
  const envFile =
    process.env.NODE_ENV === 'production'
      ? '.env'
      : process.env.NODE_ENV === 'staging'
        ? '.env.staging'
        : '.env.local';

  console.log('Loading environment from:', envFile);
  console.log('Before dotenv - CLICKHOUSE_HOST:', process.env.CLICKHOUSE_HOST);

  // Force override existing environment variables
  dotenv.config({ path: envFile, override: true });

  console.log('After dotenv - CLICKHOUSE_HOST:', process.env.CLICKHOUSE_HOST);
  console.log('Environment variables loaded:', {
    NODE_ENV: process.env.NODE_ENV,
    CLICKHOUSE_HOST: process.env.CLICKHOUSE_HOST,
    CLICKHOUSE_PORT: process.env.CLICKHOUSE_PORT,
    CLICKHOUSE_USERNAME: process.env.CLICKHOUSE_USERNAME,
    CLICKHOUSE_DATABASE: process.env.CLICKHOUSE_DATABASE,
  });

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Environment validation failed:', result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnvironment();
