import type { Request, Response } from 'express';
import { requireUser } from '../../middleware/auth.middleware';
import { sendCreated, sendOk, sendPaginated } from '../../utils/http';
import { serializeProduct, serializeStockMovement } from '../../utils/serializers';
import * as service from './product.service';
import type { CreateProductInput, ProductListQuery, UpdateProductInput } from './product.schema';

/** GET /products */
export async function listProducts(req: Request, res: Response): Promise<void> {
  const params = req.query as unknown as ProductListQuery;
  const { rows, total } = await service.list(params);
  sendPaginated(res, rows.map(serializeProduct), {
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
  sendCreated(res, serializeProduct(product));
}

/** GET /products/:id */
export async function getProduct(req: Request, res: Response): Promise<void> {
  const product = await service.getById(req.params.id as string);
  sendOk(res, serializeProduct(product));
}

/** PATCH /products/:id (also mounted as PUT) */
export async function updateProduct(req: Request, res: Response): Promise<void> {
  const product = await service.update(req.params.id as string, req.body as UpdateProductInput);
  sendOk(res, serializeProduct(product));
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
