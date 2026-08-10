import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load `.env` from the backend package root regardless of the process CWD.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Every externally configurable value lives here. Nothing else in the codebase
 * reads `process.env` directly, so a missing/invalid variable fails loudly at
 * boot instead of surfacing as a confusing runtime error later.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),

  // Comma-separated list of allowed browser origins.
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

  // Password assigned to every seeded demo user. Never used outside seeding.
  SEED_DEFAULT_PASSWORD: z.string().min(8).default('Password@123'),

  // Object storage for product images (AWS S3, or any S3-compatible service).
  // When S3_BUCKET is absent the feature degrades gracefully: the upload
  // endpoints return 503 and the frontend hides the uploader, so the rest of the
  // application runs unchanged for anyone without an AWS account.
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().default('ap-south-1'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  // Set only for S3-compatible services such as MinIO; leave unset for AWS.
  S3_ENDPOINT: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Public base URL for stored objects (CloudFront, or the bucket's own URL).
  // When unset, images are served through short-lived presigned GET URLs.
  S3_PUBLIC_BASE_URL: z.string().url().optional(),
  S3_UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(300),
  S3_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),

  // Letterhead printed on generated challan PDFs.
  COMPANY_NAME: z.string().default('Shreeji Wholesale Distributors'),
  COMPANY_ADDRESS: z
    .string()
    .default('Unit 14, MIDC Industrial Estate, Pune, Maharashtra 411019'),
  COMPANY_GSTIN: z.string().default('27AAPFU0939F1ZV'),
  COMPANY_PHONE: z.string().default('+91 20 4567 8900'),
  COMPANY_EMAIL: z.string().default('operations@shreejiwholesale.test'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
});

/**
 * Hosting dashboards commonly leave an unused variable present but blank.
 * Treating "" as absent means a blank S3_BUCKET disables image upload cleanly
 * instead of failing schema validation and refusing to boot.
 */
const rawEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== ''),
);

const parsed = envSchema.safeParse(rawEnvironment);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const raw = parsed.data;

export const env = {
  ...raw,
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  isDevelopment: raw.NODE_ENV === 'development',
  // Image upload is only available once a bucket and credentials are configured.
  isStorageConfigured: Boolean(
    raw.S3_BUCKET && raw.S3_ACCESS_KEY_ID && raw.S3_SECRET_ACCESS_KEY,
  ),
} as const;

export type Env = typeof env;
