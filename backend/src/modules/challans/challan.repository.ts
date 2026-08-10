import { pool, query, type Queryable } from '../../db/pool';
import type { ChallanItemRecord, ChallanRecord, ChallanStatus } from '../../types/domain';
import type { ChallanListQuery } from './challan.schema';

const CHALLAN_COLUMNS = `
  c.id, c.challan_number, c.customer_id, c.status, c.total_quantity, c.total_amount,
  c.notes, c.created_by, c.confirmed_by, c.confirmed_at, c.cancelled_by, c.cancelled_at,
  c.cancellation_reason, c.created_at, c.updated_at
`;

const ITEM_COLUMNS = `
  i.id, i.challan_id, i.product_id, i.product_name, i.product_sku, i.product_category,
  i.product_location, i.unit_price, i.quantity, i.line_total, i.created_at
`;

/**
 * Reserve the next challan number for the given prefix.
 *
 * A single-row upsert makes this atomic: concurrent transactions queue on the
 * row lock, so two challans can never receive the same number, and the unique
 * index on `challans.challan_number` is a second line of defence.
 */
export async function nextChallanNumber(db: Queryable, year: number): Promise<string> {
  const prefix = `CH-${year}`;
  const { rows } = await db.query<{ last_number: number }>(
    `INSERT INTO challan_number_sequences (prefix, last_number)
     VALUES ($1, 1)
     ON CONFLICT (prefix)
     DO UPDATE SET last_number = challan_number_sequences.last_number + 1, updated_at = now()
     RETURNING last_number`,
    [prefix],
  );
  const sequence = rows[0]?.last_number ?? 1;
  return `${prefix}-${String(sequence).padStart(6, '0')}`;
}

export interface InsertChallanModel {
  challanNumber: string;
  customerId: string;
  status: ChallanStatus;
  totalQuantity: number;
  totalAmount: number;
  notes: string | null;
  createdBy: string;
}

export async function insertChallan(
  db: Queryable,
  data: InsertChallanModel,
): Promise<ChallanRecord> {
  const { rows } = await db.query<ChallanRecord>(
    `INSERT INTO challans
       (challan_number, customer_id, status, total_quantity, total_amount, notes, created_by)
     VALUES ($1, $2, $3::challan_status, $4, $5, $6, $7)
     RETURNING ${CHALLAN_COLUMNS.replace(/c\./g, '')}`,
    [
      data.challanNumber,
      data.customerId,
      data.status,
      data.totalQuantity,
      data.totalAmount,
      data.notes,
      data.createdBy,
    ],
  );
  return rows[0] as ChallanRecord;
}

export interface InsertChallanItemModel {
  challanId: string;
  productId: string;
  productName: string;
  productSku: string;
  productCategory: string | null;
  productLocation: string | null;
  unitPrice: number;
  quantity: number;
}

export async function insertChallanItems(
  db: Queryable,
  items: InsertChallanItemModel[],
): Promise<ChallanItemRecord[]> {
  if (items.length === 0) return [];

  // Build a single multi-row INSERT rather than N round-trips.
  const values: unknown[] = [];
  const tuples = items.map((item, index) => {
    const base = index * 8;
    values.push(
      item.challanId,
      item.productId,
      item.productName,
      item.productSku,
      item.productCategory,
      item.productLocation,
      item.unitPrice,
      item.quantity,
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
  });

  const { rows } = await db.query<ChallanItemRecord>(
    `INSERT INTO challan_items
       (challan_id, product_id, product_name, product_sku, product_category,
        product_location, unit_price, quantity)
     VALUES ${tuples.join(', ')}
     RETURNING ${ITEM_COLUMNS.replace(/i\./g, '')}`,
    values,
  );
  return rows;
}

export async function deleteChallanItems(db: Queryable, challanId: string): Promise<void> {
  await db.query('DELETE FROM challan_items WHERE challan_id = $1', [challanId]);
}

export async function findChallanById(
  id: string,
  db: Queryable = pool,
): Promise<ChallanRecord | null> {
  const { rows } = await db.query<ChallanRecord>(
    `SELECT ${CHALLAN_COLUMNS},
            cu.name AS customer_name,
            cu.business_name AS customer_business_name,
            cu.mobile AS customer_mobile,
            creator.name  AS created_by_name,
            confirmer.name AS confirmed_by_name,
            canceller.name AS cancelled_by_name
       FROM challans c
       JOIN customers cu ON cu.id = c.customer_id
       LEFT JOIN users creator   ON creator.id   = c.created_by
       LEFT JOIN users confirmer ON confirmer.id = c.confirmed_by
       LEFT JOIN users canceller ON canceller.id = c.cancelled_by
      WHERE c.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Lock the challan header so concurrent confirm/cancel calls serialise. */
export async function lockChallanForUpdate(
  db: Queryable,
  id: string,
): Promise<ChallanRecord | null> {
  const { rows } = await db.query<ChallanRecord>(
    `SELECT ${CHALLAN_COLUMNS.replace(/c\./g, '')} FROM challans c WHERE c.id = $1 FOR UPDATE`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Items are always returned ordered by product_id. Locking products in a stable
 * order across all transactions is what keeps concurrent confirmations from
 * deadlocking against each other.
 */
export async function findChallanItems(
  challanId: string,
  db: Queryable = pool,
): Promise<ChallanItemRecord[]> {
  const { rows } = await db.query<ChallanItemRecord>(
    `SELECT ${ITEM_COLUMNS}, p.current_stock
       FROM challan_items i
       LEFT JOIN products p ON p.id = i.product_id
      WHERE i.challan_id = $1
      ORDER BY i.product_id`,
    [challanId],
  );
  return rows;
}

function buildFilters(params: ChallanListQuery): { where: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (params.search) {
    values.push(`%${params.search}%`);
    const i = values.length;
    clauses.push(`(c.challan_number ILIKE $${i} OR cu.name ILIKE $${i} OR cu.business_name ILIKE $${i})`);
  }
  if (params.status) {
    values.push(params.status);
    clauses.push(`c.status = $${values.length}::challan_status`);
  }
  if (params.customerId) {
    values.push(params.customerId);
    clauses.push(`c.customer_id = $${values.length}`);
  }
  if (params.createdBy) {
    values.push(params.createdBy);
    clauses.push(`c.created_by = $${values.length}`);
  }
  if (params.from) {
    values.push(params.from);
    clauses.push(`c.created_at >= $${values.length}::date`);
  }
  if (params.to) {
    values.push(params.to);
    clauses.push(`c.created_at < ($${values.length}::date + interval '1 day')`);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
}

const SORTABLE_COLUMNS: Record<string, string> = {
  createdAt: 'c.created_at',
  challanNumber: 'c.challan_number',
  totalQuantity: 'c.total_quantity',
  totalAmount: 'c.total_amount',
  status: 'c.status',
};

export async function listChallans(
  params: ChallanListQuery,
): Promise<{ rows: ChallanRecord[]; total: number }> {
  const { where, values } = buildFilters(params);
  const sortColumn = SORTABLE_COLUMNS[params.sortBy] ?? 'c.created_at';
  const direction = params.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const offset = (params.page - 1) * params.limit;
  const listValues = [...values, params.limit, offset];

  const { rows } = await query<ChallanRecord>(
    `SELECT ${CHALLAN_COLUMNS},
            cu.name AS customer_name,
            cu.business_name AS customer_business_name,
            cu.mobile AS customer_mobile,
            creator.name AS created_by_name,
            (SELECT count(*) FROM challan_items i WHERE i.challan_id = c.id) AS item_count
       FROM challans c
       JOIN customers cu ON cu.id = c.customer_id
       LEFT JOIN users creator ON creator.id = c.created_by
       ${where}
      ORDER BY ${sortColumn} ${direction}, c.id DESC
      LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
    listValues,
  );

  const { rows: countRows } = await query<{ count: number }>(
    `SELECT count(*)::bigint AS count
       FROM challans c
       JOIN customers cu ON cu.id = c.customer_id
       ${where}`,
    values,
  );

  return { rows, total: countRows[0]?.count ?? 0 };
}

export async function markConfirmed(
  db: Queryable,
  challanId: string,
  userId: string,
): Promise<ChallanRecord> {
  const { rows } = await db.query<ChallanRecord>(
    `UPDATE challans
        SET status = 'CONFIRMED', confirmed_by = $2, confirmed_at = now()
      WHERE id = $1
      RETURNING ${CHALLAN_COLUMNS.replace(/c\./g, '')}`,
    [challanId, userId],
  );
  return rows[0] as ChallanRecord;
}

export async function markCancelled(
  db: Queryable,
  challanId: string,
  userId: string,
  reason: string | null,
): Promise<ChallanRecord> {
  const { rows } = await db.query<ChallanRecord>(
    `UPDATE challans
        SET status = 'CANCELLED', cancelled_by = $2, cancelled_at = now(), cancellation_reason = $3
      WHERE id = $1
      RETURNING ${CHALLAN_COLUMNS.replace(/c\./g, '')}`,
    [challanId, userId, reason],
  );
  return rows[0] as ChallanRecord;
}

export async function updateChallanHeader(
  db: Queryable,
  challanId: string,
  data: { customerId: string; notes: string | null; totalQuantity: number; totalAmount: number },
): Promise<ChallanRecord> {
  const { rows } = await db.query<ChallanRecord>(
    `UPDATE challans
        SET customer_id = $2, notes = $3, total_quantity = $4, total_amount = $5
      WHERE id = $1
      RETURNING ${CHALLAN_COLUMNS.replace(/c\./g, '')}`,
    [challanId, data.customerId, data.notes, data.totalQuantity, data.totalAmount],
  );
  return rows[0] as ChallanRecord;
}
