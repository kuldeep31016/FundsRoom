import { query, type Queryable } from '../../db/pool';
import type { StockMovementRecord } from '../../types/domain';
import type { StockMovementListQuery } from './stock.schema';

const MOVEMENT_COLUMNS = `
  m.id, m.product_id, m.movement_type, m.quantity, m.quantity_change,
  m.stock_before, m.stock_after, m.reason, m.reference_type, m.reference_id,
  m.created_by, m.created_at
`;

export interface InsertMovementModel {
  productId: string;
  movementType: 'IN' | 'OUT';
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reason: string;
  referenceType: string | null;
  referenceId: string | null;
  createdBy: string;
}

export async function insertStockMovement(
  db: Queryable,
  data: InsertMovementModel,
): Promise<StockMovementRecord> {
  // Product and actor names are joined in so a newly created movement has the
  // same shape as one read back from the history endpoint.
  const { rows } = await db.query<StockMovementRecord>(
    `WITH inserted AS (
       INSERT INTO stock_movements
         (product_id, movement_type, quantity, stock_before, stock_after, reason,
          reference_type, reference_id, created_by)
       VALUES ($1, $2::stock_movement_type, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${MOVEMENT_COLUMNS.replace(/m\./g, '')}
     )
     SELECT inserted.*, p.name AS product_name, p.sku AS product_sku, u.name AS created_by_name
       FROM inserted
       JOIN products p ON p.id = inserted.product_id
       LEFT JOIN users u ON u.id = inserted.created_by`,
    [
      data.productId,
      data.movementType,
      data.quantity,
      data.stockBefore,
      data.stockAfter,
      data.reason,
      data.referenceType,
      data.referenceId,
      data.createdBy,
    ],
  );
  return rows[0] as StockMovementRecord;
}

function buildFilters(params: StockMovementListQuery): { where: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (params.productId) {
    values.push(params.productId);
    clauses.push(`m.product_id = $${values.length}`);
  }
  if (params.movementType) {
    values.push(params.movementType);
    clauses.push(`m.movement_type = $${values.length}::stock_movement_type`);
  }
  if (params.referenceType) {
    values.push(params.referenceType);
    clauses.push(`m.reference_type = $${values.length}`);
  }
  if (params.from) {
    values.push(params.from);
    clauses.push(`m.created_at >= $${values.length}::date`);
  }
  if (params.to) {
    values.push(params.to);
    // Inclusive upper bound on the calendar day.
    clauses.push(`m.created_at < ($${values.length}::date + interval '1 day')`);
  }
  if (params.search) {
    values.push(`%${params.search}%`);
    const i = values.length;
    clauses.push(`(p.name ILIKE $${i} OR p.sku ILIKE $${i} OR m.reason ILIKE $${i})`);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
}

export async function listStockMovements(
  params: StockMovementListQuery,
): Promise<{ rows: StockMovementRecord[]; total: number }> {
  const { where, values } = buildFilters(params);
  const offset = (params.page - 1) * params.limit;
  const listValues = [...values, params.limit, offset];

  const { rows } = await query<StockMovementRecord>(
    `SELECT ${MOVEMENT_COLUMNS},
            p.name AS product_name, p.sku AS product_sku,
            u.name AS created_by_name
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN users u ON u.id = m.created_by
       ${where}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
    listValues,
  );

  const { rows: countRows } = await query<{ count: number }>(
    `SELECT count(*)::bigint AS count
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       ${where}`,
    values,
  );

  return { rows, total: countRows[0]?.count ?? 0 };
}

export async function updateProductStock(
  db: Queryable,
  productId: string,
  newStock: number,
): Promise<void> {
  await db.query('UPDATE products SET current_stock = $1 WHERE id = $2', [newStock, productId]);
}
