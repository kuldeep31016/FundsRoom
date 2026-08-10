import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BASE,
  authHeader,
  createProduct,
  ensureTestUsers,
  loginAs,
  request,
  resetBusinessData,
} from './helpers/test-app';
import { closePool } from '../src/db/pool';
import { env } from '../src/config/env';

/**
 * Exercised against MinIO, which speaks the real S3 API, so the upload, head,
 * read-back and delete calls are genuine network round-trips through the AWS
 * SDK. The only production difference is that `S3_ENDPOINT` is unset and AWS
 * credentials are used instead.
 */

let warehouseToken: string;
let salesToken: string;

// A 1x1 transparent PNG — the smallest valid image to push through the flow.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const storageConfigured = env.isStorageConfigured;

/** Upload straight to storage using the presigned URL, exactly as a browser would. */
async function uploadTo(uploadUrl: string, body: Buffer, contentType: string): Promise<Response> {
  return fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: new Uint8Array(body),
  });
}

describe.skipIf(!storageConfigured)('Product image upload (S3-compatible storage)', () => {
  beforeAll(async () => {
    await ensureTestUsers();
    await resetBusinessData();
    warehouseToken = await loginAs('WAREHOUSE');
    salesToken = await loginAs('SALES');
  });

  afterAll(async () => {
    await closePool();
  });

  describe('Full upload round trip', () => {
    it('presigns, uploads, attaches and serves a product image', async () => {
      const product = await createProduct(warehouseToken);
      expect(product.imageUrl).toBeNull();

      // 1. Ask the API for a presigned upload URL.
      const presign = await request
        .post(`${BASE}/products/${product.id}/image/upload-url`)
        .set(authHeader(warehouseToken))
        .send({ contentType: 'image/png', contentLength: PNG_BYTES.length });

      expect(presign.status).toBe(200);
      expect(presign.body.data.uploadUrl).toContain('X-Amz-Signature');
      expect(presign.body.data.key).toMatch(
        new RegExp(`^products/${product.id}/\\d+-[0-9a-f]+\\.png$`),
      );

      // 2. Upload the bytes directly to storage — the API never sees them.
      const upload = await uploadTo(presign.body.data.uploadUrl, PNG_BYTES, 'image/png');
      expect(upload.status).toBe(200);

      // 3. Confirm the upload and attach it to the product.
      const attach = await request
        .post(`${BASE}/products/${product.id}/image`)
        .set(authHeader(warehouseToken))
        .send({ key: presign.body.data.key });

      expect(attach.status).toBe(200);
      expect(attach.body.data.imageKey).toBe(presign.body.data.key);
      expect(attach.body.data.imageMimeType).toBe('image/png');
      expect(attach.body.data.imageSize).toBe(PNG_BYTES.length);
      expect(attach.body.data.imageUpdatedAt).toBeTruthy();
      expect(attach.body.data.imageUrl).toBeTruthy();

      // 4. The served URL returns the exact bytes that were uploaded.
      const fetched = await fetch(attach.body.data.imageUrl as string);
      expect(fetched.status).toBe(200);
      const downloaded = Buffer.from(await fetched.arrayBuffer());
      expect(downloaded.equals(PNG_BYTES)).toBe(true);
    });

    it('exposes the image URL on the detail and list endpoints', async () => {
      const product = await createProduct(warehouseToken);
      const presign = await request
        .post(`${BASE}/products/${product.id}/image/upload-url`)
        .set(authHeader(warehouseToken))
        .send({ contentType: 'image/png', contentLength: PNG_BYTES.length });
      await uploadTo(presign.body.data.uploadUrl, PNG_BYTES, 'image/png');
      await request
        .post(`${BASE}/products/${product.id}/image`)
        .set(authHeader(warehouseToken))
        .send({ key: presign.body.data.key });

      const detail = await request
        .get(`${BASE}/products/${product.id}`)
        .set(authHeader(salesToken));
      expect(detail.body.data.imageUrl).toBeTruthy();

      const list = await request
        .get(`${BASE}/products?search=${product.sku}`)
        .set(authHeader(salesToken));
      expect(list.body.data[0].imageUrl).toBeTruthy();
    });

    it('replaces an existing image and deletes the superseded object', async () => {
      const product = await createProduct(warehouseToken);

      async function uploadImage() {
        const presign = await request
          .post(`${BASE}/products/${product.id}/image/upload-url`)
          .set(authHeader(warehouseToken))
          .send({ contentType: 'image/png', contentLength: PNG_BYTES.length });
        await uploadTo(presign.body.data.uploadUrl, PNG_BYTES, 'image/png');
        const attach = await request
          .post(`${BASE}/products/${product.id}/image`)
          .set(authHeader(warehouseToken))
          .send({ key: presign.body.data.key });
        return { key: presign.body.data.key as string, url: attach.body.data.imageUrl as string };
      }

      const first = await uploadImage();
      const second = await uploadImage();

      expect(second.key).not.toBe(first.key);

      // The replacement is live...
      expect((await fetch(second.url)).status).toBe(200);
      // ...and the superseded object is gone from the bucket.
      const staleKey = encodeURI(first.key);
      const stale = await fetch(`${env.S3_ENDPOINT}/${env.S3_BUCKET}/${staleKey}`);
      expect(stale.status).toBe(404);
    });

    it('removes the image and clears every image column', async () => {
      const product = await createProduct(warehouseToken);
      const presign = await request
        .post(`${BASE}/products/${product.id}/image/upload-url`)
        .set(authHeader(warehouseToken))
        .send({ contentType: 'image/png', contentLength: PNG_BYTES.length });
      await uploadTo(presign.body.data.uploadUrl, PNG_BYTES, 'image/png');
      await request
        .post(`${BASE}/products/${product.id}/image`)
        .set(authHeader(warehouseToken))
        .send({ key: presign.body.data.key });

      const removed = await request
        .delete(`${BASE}/products/${product.id}/image`)
        .set(authHeader(warehouseToken));

      expect(removed.status).toBe(200);
      expect(removed.body.data.imageKey).toBeNull();
      expect(removed.body.data.imageMimeType).toBeNull();
      expect(removed.body.data.imageSize).toBeNull();
      expect(removed.body.data.imageUpdatedAt).toBeNull();
      expect(removed.body.data.imageUrl).toBeNull();

      const gone = await fetch(`${env.S3_ENDPOINT}/${env.S3_BUCKET}/${encodeURI(presign.body.data.key)}`);
      expect(gone.status).toBe(404);
    });
  });

  describe('Validation and safety', () => {
    it('rejects a disallowed content type', async () => {
      const product = await createProduct(warehouseToken);
      const response = await request
        .post(`${BASE}/products/${product.id}/image/upload-url`)
        .set(authHeader(warehouseToken))
        .send({ contentType: 'application/pdf', contentLength: 1000 });

      expect(response.status).toBe(400);
      expect(response.body.error.details[0].message).toContain('image/png');
    });

    it('rejects a file larger than the configured maximum', async () => {
      const product = await createProduct(warehouseToken);
      const response = await request
        .post(`${BASE}/products/${product.id}/image/upload-url`)
        .set(authHeader(warehouseToken))
        .send({ contentType: 'image/png', contentLength: env.S3_MAX_UPLOAD_BYTES + 1 });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('too large');
    });

    it('rejects zero and negative sizes', async () => {
      const product = await createProduct(warehouseToken);
      for (const contentLength of [0, -1]) {
        const response = await request
          .post(`${BASE}/products/${product.id}/image/upload-url`)
          .set(authHeader(warehouseToken))
          .send({ contentType: 'image/png', contentLength });
        expect(response.status, `contentLength=${contentLength}`).toBe(400);
      }
    });

    it('refuses to attach a key belonging to another product', async () => {
      const productA = await createProduct(warehouseToken);
      const productB = await createProduct(warehouseToken);

      const presign = await request
        .post(`${BASE}/products/${productA.id}/image/upload-url`)
        .set(authHeader(warehouseToken))
        .send({ contentType: 'image/png', contentLength: PNG_BYTES.length });
      await uploadTo(presign.body.data.uploadUrl, PNG_BYTES, 'image/png');

      // Product B tries to claim product A's object.
      const response = await request
        .post(`${BASE}/products/${productB.id}/image`)
        .set(authHeader(warehouseToken))
        .send({ key: presign.body.data.key });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('does not belong to this product');
    });

    it('refuses to attach a key that was never uploaded', async () => {
      const product = await createProduct(warehouseToken);
      const response = await request
        .post(`${BASE}/products/${product.id}/image`)
        .set(authHeader(warehouseToken))
        .send({ key: `products/${product.id}/1700000000000-deadbeefdeadbeef.png` });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('UPLOAD_NOT_FOUND');
    });

    it('returns 404 for image operations on an unknown product', async () => {
      const unknown = '11111111-1111-1111-1111-111111111111';
      const presign = await request
        .post(`${BASE}/products/${unknown}/image/upload-url`)
        .set(authHeader(warehouseToken))
        .send({ contentType: 'image/png', contentLength: 100 });
      expect(presign.status).toBe(404);

      const remove = await request
        .delete(`${BASE}/products/${unknown}/image`)
        .set(authHeader(warehouseToken));
      expect(remove.status).toBe(404);
    });

    it('honours the presigned content type — a mismatched upload is rejected by storage', async () => {
      const product = await createProduct(warehouseToken);
      const presign = await request
        .post(`${BASE}/products/${product.id}/image/upload-url`)
        .set(authHeader(warehouseToken))
        .send({ contentType: 'image/png', contentLength: PNG_BYTES.length });

      // The signature covers Content-Type, so substituting one invalidates it.
      const upload = await uploadTo(presign.body.data.uploadUrl, PNG_BYTES, 'image/webp');
      expect(upload.status).toBe(403);
    });
  });

  describe('Access control', () => {
    it('only roles with products:write may upload, attach or remove', async () => {
      const product = await createProduct(warehouseToken);

      const presign = await request
        .post(`${BASE}/products/${product.id}/image/upload-url`)
        .set(authHeader(salesToken))
        .send({ contentType: 'image/png', contentLength: 100 });
      expect(presign.status).toBe(403);

      const attach = await request
        .post(`${BASE}/products/${product.id}/image`)
        .set(authHeader(salesToken))
        .send({ key: `products/${product.id}/x.png` });
      expect(attach.status).toBe(403);

      const remove = await request
        .delete(`${BASE}/products/${product.id}/image`)
        .set(authHeader(salesToken));
      expect(remove.status).toBe(403);
    });

    it('requires authentication', async () => {
      const product = await createProduct(warehouseToken);
      const response = await request
        .post(`${BASE}/products/${product.id}/image/upload-url`)
        .send({ contentType: 'image/png', contentLength: 100 });
      expect(response.status).toBe(401);
    });
  });
});

/**
 * Image upload is optional: with no bucket configured the rest of the
 * application must keep working and the endpoints must say so clearly.
 */
describe.skipIf(storageConfigured)('Product images without storage configured', () => {
  beforeAll(async () => {
    await ensureTestUsers();
    await resetBusinessData();
    warehouseToken = await loginAs('WAREHOUSE');
  });

  afterAll(async () => {
    await closePool();
  });

  it('returns 503 with an actionable message', async () => {
    const product = await createProduct(warehouseToken);
    const response = await request
      .post(`${BASE}/products/${product.id}/image/upload-url`)
      .set(authHeader(warehouseToken))
      .send({ contentType: 'image/png', contentLength: 100 });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('STORAGE_NOT_CONFIGURED');
    expect(response.body.error.message).toContain('S3_BUCKET');
  });

  it('still serves products with a null image URL', async () => {
    const product = await createProduct(warehouseToken);
    const response = await request.get(`${BASE}/products/${product.id}`).set(authHeader(warehouseToken));
    expect(response.status).toBe(200);
    expect(response.body.data.imageUrl).toBeNull();
  });
});
