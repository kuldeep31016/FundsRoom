import { withTransaction, type Queryable } from '../../db/pool';
import { ApiError, ERROR_CODES } from '../../utils/api-error';
import type { StockMovementRecord, StockMovementType } from '../../types/domain';
import { lockProductForUpdate } from '../products/product.repository';
import * as repository from './stock.repository';
import type { CreateStockMovementInput, StockMovementListQuery } from './stock.schema';

/** Reference tags recorded on movements so history can be traced to its source. */
export const STOCK_REFERENCE = {
  MANUAL: 'MANUAL',
  CHALLAN: 'CHALLAN',
  PRODUCT_OPENING: 'PRODUCT_OPENING',
} as const;

export interface ApplyMovementInput {
  productId: string;
  movementType: StockMovementType;
  quantity: number;
  reason: string;
  referenceType?: string | null;
  referenceId?: string | null;
}

/**
 * The single choke point through which stock ever changes.
 *
 * MUST be called with a transaction-bound client. It:
 *   1. locks the product row (`FOR UPDATE`) so concurrent writers serialise;
 *   2. refuses an OUT movement that would drive stock below zero (RULE 2/3);
 *   3. writes the new balance;
 *   4. appends an immutable ledger row capturing before/after, reason, actor.
 *
 * Because every step shares the caller's transaction, a later failure rolls the
 * whole thing back — there is no state in which stock moved but the ledger (or
 * the challan) disagrees.
 */
export async function applyStockMovement(
  db: Queryable,
  input: ApplyMovementInput,
  userId: string,
): Promise<StockMovementRecord> {
  const product = await lockProductForUpdate(db, input.productId);
  if (!product) {
    throw ApiError.notFound('Product');
  }

  const stockBefore = product.current_stock;
  const delta = input.movementType === 'IN' ? input.quantity : -input.quantity;
  const stockAfter = stockBefore + delta;

  if (stockAfter < 0) {
    throw ApiError.conflict(
      `Insufficient stock for "${product.name}" (${product.sku}). ` +
        `Available: ${stockBefore}, requested: ${input.quantity}.`,
      ERROR_CODES.INSUFFICIENT_STOCK,
      {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        availableStock: stockBefore,
        requestedQuantity: input.quantity,
        shortfall: input.quantity - stockBefore,
      },
    );
  }

  await repository.updateProductStock(db, product.id, stockAfter);

  return repository.insertStockMovement(db, {
    productId: product.id,
    movementType: input.movementType,
    quantity: input.quantity,
    stockBefore,
    stockAfter,
    reason: input.reason,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
    createdBy: userId,
  });
}

/** POST /stock/movements — a manual warehouse adjustment. */
export async function createManualMovement(
  input: CreateStockMovementInput,
  userId: string,
): Promise<{ movement: StockMovementRecord; newStock: number }> {
  return withTransaction(async (client) => {
    const movement = await applyStockMovement(
      client,
      {
        productId: input.productId,
        movementType: input.movementType,
        quantity: input.quantity,
        reason: input.reason,
        referenceType: STOCK_REFERENCE.MANUAL,
        referenceId: null,
      },
      userId,
    );
    return { movement, newStock: movement.stock_after };
  });
}

export async function listMovements(
  params: StockMovementListQuery,
): Promise<{ rows: StockMovementRecord[]; total: number }> {
  return repository.listStockMovements(params);
}
