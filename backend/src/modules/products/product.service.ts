import { withTransaction } from '../../db/pool';
import { ApiError, ERROR_CODES } from '../../utils/api-error';
import type { ProductRecord, StockMovementRecord } from '../../types/domain';
import { applyStockMovement, STOCK_REFERENCE } from '../stock/stock.service';
import { listStockMovements } from '../stock/stock.repository';
import * as repository from './product.repository';
import type { CreateProductInput, ProductListQuery, UpdateProductInput } from './product.schema';

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
