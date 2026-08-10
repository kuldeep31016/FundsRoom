import type { Request, Response } from 'express';
import { requireUser } from '../../middleware/auth.middleware';
import { sendCreated, sendOk, sendPaginated } from '../../utils/http';
import { serializeProduct, serializeStockMovement } from '../../utils/serializers';
import { resolveImageUrl } from '../storage/storage.service';
import * as service from './product.service';
import type {
  AttachProductImageInput,
  CreateProductInput,
  ProductImageUploadUrlInput,
  ProductListQuery,
  UpdateProductInput,
} from './product.schema';
import type { ProductRecord } from '../../types/domain';

/**
 * Attach a browser-usable URL to each product.
 *
 * Done here rather than in the serializer because presigning is asynchronous and
 * the serializer is a pure synchronous mapping.
 */
async function withImageUrl(product: ProductRecord) {
  return { ...serializeProduct(product), imageUrl: await resolveImageUrl(product.image_key) };
}

async function withImageUrls(products: ProductRecord[]) {
  return Promise.all(products.map(withImageUrl));
}

/** GET /products */
export async function listProducts(req: Request, res: Response): Promise<void> {
  const params = req.query as unknown as ProductListQuery;
  const { rows, total } = await service.list(params);
  sendPaginated(res, await withImageUrls(rows), {
    page: params.page,
    limit: params.limit,
    total,
  });
}

/** GET /products/categories — powers the category filter dropdown. */
export async function listCategories(_req: Request, res: Response): Promise<void> {
  sendOk(res, await service.getCategories());
}

/** POST /products */
export async function createProduct(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const product = await service.create(req.body as CreateProductInput, user.id);
  sendCreated(res, await withImageUrl(product));
}

/** GET /products/:id */
export async function getProduct(req: Request, res: Response): Promise<void> {
  const product = await service.getById(req.params.id as string);
  sendOk(res, await withImageUrl(product));
}

/** PATCH /products/:id (also mounted as PUT) */
export async function updateProduct(req: Request, res: Response): Promise<void> {
  const product = await service.update(req.params.id as string, req.body as UpdateProductInput);
  sendOk(res, await withImageUrl(product));
}

/** GET /products/:id/stock-movements */
export async function getStockHistory(req: Request, res: Response): Promise<void> {
  const params = req.query as unknown as { page: number; limit: number };
  const { rows, total } = await service.getStockHistory(req.params.id as string, params);
  sendPaginated(res, rows.map(serializeStockMovement), {
    page: params.page,
    limit: params.limit,
    total,
  });
}

/** POST /products/:id/image/upload-url — step 1 of a direct-to-S3 upload. */
export async function createImageUploadUrl(req: Request, res: Response): Promise<void> {
  const input = req.body as ProductImageUploadUrlInput;
  const upload = await service.createImageUploadUrl(
    req.params.id as string,
    input.contentType,
    input.contentLength,
  );
  sendOk(res, upload);
}

/** POST /products/:id/image — step 2: confirm the upload and attach it. */
export async function attachImage(req: Request, res: Response): Promise<void> {
  const { key } = req.body as AttachProductImageInput;
  const product = await service.attachImage(req.params.id as string, key);
  sendOk(res, await withImageUrl(product));
}

/** DELETE /products/:id/image */
export async function removeImage(req: Request, res: Response): Promise<void> {
  const product = await service.removeImage(req.params.id as string);
  sendOk(res, await withImageUrl(product));
}
