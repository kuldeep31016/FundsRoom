import crypto from 'node:crypto';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env';
import { ApiError, ERROR_CODES } from '../../utils/api-error';
import { logger } from '../../utils/logger';

/**
 * S3 object storage for product images.
 *
 * Uploads use **presigned PUT URLs**: the browser sends the file straight to S3
 * and the API only ever handles small JSON messages. That keeps large uploads off
 * the API process entirely, which matters on a free hosting tier with a small
 * memory ceiling, and removes the need for a multipart body parser.
 *
 * The client is plain AWS SDK v3. Pointing `S3_ENDPOINT` at MinIO (as the local
 * stack and the test suite do) exercises exactly the same code path that runs
 * against real AWS S3 in production.
 */

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const EXTENSION_BY_TYPE: Record<AllowedImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!env.isStorageConfigured) {
    throw new ApiError(
      503,
      ERROR_CODES.STORAGE_NOT_CONFIGURED,
      'Image storage is not configured on this server. Set S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY to enable product images.',
    );
  }

  if (!client) {
    client = new S3Client({
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID as string,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
      },
      // Both are only set for S3-compatible services such as MinIO.
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }
  return client;
}

/** Test hook: drops the memoised client so configuration changes take effect. */
export function resetStorageClient(): void {
  client?.destroy();
  client = null;
}

export function isStorageEnabled(): boolean {
  return env.isStorageConfigured;
}

/**
 * Build the object key for a product image.
 *
 * A random suffix means a replacement upload never reuses the previous key, so
 * cached CDN copies and browser caches cannot serve a stale image.
 */
export function buildImageKey(productId: string, contentType: AllowedImageType): string {
  const extension = EXTENSION_BY_TYPE[contentType];
  const unique = crypto.randomBytes(8).toString('hex');
  return `products/${productId}/${Date.now()}-${unique}.${extension}`;
}

export interface PresignedUpload {
  uploadUrl: string;
  key: string;
  expiresInSeconds: number;
  maxBytes: number;
  requiredHeaders: Record<string, string>;
}

/**
 * Presign a PUT for the browser to upload directly to S3.
 *
 * `signableHeaders` is required: the SDK signs only `host` by default, which
 * would leave the presigned URL usable to upload *any* content type. Including
 * `content-type` binds the signature to the authorised type, so a client that
 * substitutes another one is rejected by storage with a 403.
 *
 * Size cannot be pinned the same way — browsers set `Content-Length`
 * themselves — so it is re-verified server-side in `attachImage` before the
 * object is ever recorded against a product.
 */
export async function createPresignedUpload(
  productId: string,
  contentType: AllowedImageType,
  contentLength: number,
): Promise<PresignedUpload> {
  const key = buildImageKey(productId, contentType);

  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });

  const uploadUrl = await getSignedUrl(getClient(), command, {
    expiresIn: env.S3_UPLOAD_URL_TTL_SECONDS,
    signableHeaders: new Set(['content-type']),
  });

  return {
    uploadUrl,
    key,
    expiresInSeconds: env.S3_UPLOAD_URL_TTL_SECONDS,
    maxBytes: env.S3_MAX_UPLOAD_BYTES,
    requiredHeaders: {
      'Content-Type': contentType,
    },
  };
}

export interface StoredObject {
  contentType: string;
  contentLength: number;
}

/**
 * Confirm an object really exists before it is recorded against a product.
 *
 * Without this a client could claim any key — including one it never uploaded —
 * and the database would point at nothing.
 */
export async function headObject(key: string): Promise<StoredObject | null> {
  try {
    const response = await getClient().send(
      new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    );
    return {
      contentType: response.ContentType ?? 'application/octet-stream',
      contentLength: Number(response.ContentLength ?? 0),
    };
  } catch (error) {
    const name = (error as { name?: string }).name;
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (name === 'NotFound' || name === 'NoSuchKey' || status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Deleting the object must never block the user's action, so a storage failure
 * is logged and swallowed: a stray object costs pennies, a wedged UI costs more.
 */
export async function deleteObject(key: string): Promise<void> {
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  } catch (error) {
    logger.warn('Failed to delete object from storage; it will be orphaned', {
      key,
      message: error instanceof Error ? error.message : error,
    });
  }
}

/**
 * Public URL for a stored image.
 *
 * With a public bucket or CDN in front (`S3_PUBLIC_BASE_URL`) the URL is stable
 * and cacheable. Otherwise a short-lived presigned GET is issued so a private
 * bucket still works without making objects world-readable.
 */
export async function resolveImageUrl(key: string | null): Promise<string | null> {
  if (!key || !env.isStorageConfigured) return null;

  if (env.S3_PUBLIC_BASE_URL) {
    return `${env.S3_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${key}`;
  }

  try {
    return await getSignedUrl(
      getClient(),
      new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
      { expiresIn: 3600 },
    );
  } catch (error) {
    logger.warn('Failed to presign a read URL for a product image', {
      key,
      message: error instanceof Error ? error.message : error,
    });
    return null;
  }
}
