import { withTransaction } from '../../db/pool';
import { ApiError, ERROR_CODES } from '../../utils/api-error';
import type { ProductRecord, StockMovementRecord } from '../../types/domain';
import { applyStockMovement, STOCK_REFERENCE } from '../stock/stock.service';
import {
  ALLOWED_IMAGE_TYPES,
  createPresignedUpload,
  deleteObject,
  headObject,
  type AllowedImageType,
  type PresignedUpload,
} from '../storage/storage.service';
import { listStockMovements } from '../stock/stock.repository';
import * as repository from './product.repository';
import type { CreateProductInput, ProductListQuery, UpdateProductInput } from './product.schema';
import { env } from '../../config/env';

export async function list(
  params: ProductListQuery,
): Promise<{ rows: ProductRecord[]; total: number }> {
  return repository.listProducts(params);
}

export async function getById(id: string): Promise<ProductRecord> {
  const product = await repository.findProductById(id);
  if (!product) {
    throw ApiError.notFound('Product');
  }
  return product;
}

export async function getCategories(): Promise<string[]> {
  return repository.listCategories();
}

/**
 * Create a product.
 *
 * Opening stock is inserted as 0 and then posted through the normal stock
 * movement path, so the ledger accounts for every unit the product has ever
 * had — there is no "stock that came from nowhere".
 */
export async function create(
  input: CreateProductInput,
  createdBy: string,
): Promise<ProductRecord> {
  const existing = await repository.findProductBySku(input.sku);
  if (existing) {
    throw ApiError.conflict(
      `A product with SKU "${input.sku}" already exists.`,
      ERROR_CODES.DUPLICATE_SKU,
      { sku: input.sku, existingProductId: existing.id },
    );
  }

  return withTransaction(async (client) => {
    const product = await repository.insertProduct(
      {
        name: input.name,
        sku: input.sku,
        category: input.category,
        unitPrice: input.unitPrice,
        currentStock: 0,
        minStockAlert: input.minStockAlert,
        location: input.location ?? null,
      },
      createdBy,
      client,
    );

    if (input.currentStock > 0) {
      await applyStockMovement(
        client,
        {
          productId: product.id,
          movementType: 'IN',
          quantity: input.currentStock,
          reason: 'Opening stock',
          referenceType: STOCK_REFERENCE.PRODUCT_OPENING,
          referenceId: product.id,
        },
        createdBy,
      );
      const refreshed = await repository.findProductById(product.id, client);
      return refreshed ?? product;
    }

    return product;
  });
}

export async function update(id: string, input: UpdateProductInput): Promise<ProductRecord> {
  await getById(id);

  if (input.sku) {
    const existing = await repository.findProductBySku(input.sku);
    if (existing && existing.id !== id) {
      throw ApiError.conflict(
        `A product with SKU "${input.sku}" already exists.`,
        ERROR_CODES.DUPLICATE_SKU,
        { sku: input.sku, existingProductId: existing.id },
      );
    }
  }

  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) patch[key] = value;
  }

  const updated = await repository.updateProduct(id, patch);
  if (!updated) {
    throw ApiError.notFound('Product');
  }
  return updated;
}

/** GET /products/:id/stock-movements */
export async function getStockHistory(
  productId: string,
  pagination: { page: number; limit: number },
): Promise<{ rows: StockMovementRecord[]; total: number }> {
  await getById(productId);
  return listStockMovements({
    ...pagination,
    productId,
    search: undefined,
    movementType: undefined,
    referenceType: undefined,
    from: undefined,
    to: undefined,
  });
}

/** Step 1 of an image upload: hand the browser a short-lived presigned PUT URL. */
export async function createImageUploadUrl(
  productId: string,
  contentType: AllowedImageType,
  contentLength: number,
): Promise<PresignedUpload> {
  await getById(productId);

  if (contentLength > env.S3_MAX_UPLOAD_BYTES) {
    throw ApiError.badRequest(
      `Image is too large. Maximum size is ${Math.floor(env.S3_MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
      [{ field: 'contentLength', message: 'File exceeds the maximum upload size' }],
    );
  }

  return createPresignedUpload(productId, contentType, contentLength);
}

/**
 * Step 2: attach an uploaded object to the product.
 *
 * The object is verified to exist and to belong to this product's key prefix, so
 * a client cannot point a product at an arbitrary object in the bucket. A
 * replaced image has its predecessor deleted so the bucket does not accumulate
 * orphans.
 */
export async function attachImage(productId: string, key: string): Promise<ProductRecord> {
  await getById(productId);

  if (!key.startsWith(`products/${productId}/`)) {
    throw ApiError.badRequest('That upload key does not belong to this product.', [
      { field: 'key', message: 'Key does not match this product' },
    ]);
  }

  const stored = await headObject(key);
  if (!stored) {
    throw new ApiError(
      404,
      ERROR_CODES.UPLOAD_NOT_FOUND,
      'The uploaded file was not found in storage. Please upload the image again.',
    );
  }

  // Re-validate what was actually stored rather than trusting the request that
  // asked for the upload URL. The offending object is removed so a rejected
  // upload cannot linger in the bucket.
  if (!ALLOWED_IMAGE_TYPES.includes(stored.contentType as AllowedImageType)) {
    await deleteObject(key);
    throw ApiError.badRequest(
      `Uploaded file is a ${stored.contentType}, which is not an allowed image type.`,
      [{ field: 'key', message: `Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}` }],
    );
  }

  if (stored.contentLength > env.S3_MAX_UPLOAD_BYTES) {
    await deleteObject(key);
    throw ApiError.badRequest(
      `Uploaded file is too large. Maximum size is ${Math.floor(env.S3_MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
      [{ field: 'key', message: 'File exceeds the maximum upload size' }],
    );
  }

  const { product, previousKey } = await repository.setProductImage(productId, {
    key,
    mimeType: stored.contentType,
    size: stored.contentLength,
  });
  if (!product) {
    throw ApiError.notFound('Product');
  }

  if (previousKey && previousKey !== key) {
    await deleteObject(previousKey);
  }

  return product;
}

/** Remove the product image and delete the underlying object. */
export async function removeImage(productId: string): Promise<ProductRecord> {
  await getById(productId);

  const { product, previousKey } = await repository.setProductImage(productId, null);
  if (!product) {
    throw ApiError.notFound('Product');
  }
  if (previousKey) {
    await deleteObject(previousKey);
  }
  return product;
}
