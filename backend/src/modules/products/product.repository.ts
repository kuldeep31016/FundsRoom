import { pool, query, type Queryable } from '../../db/pool';
import type { ProductRecord } from '../../types/domain';
import type { ProductListQuery } from './product.schema';

const PRODUCT_COLUMNS = `
  p.id, p.name, p.sku, p.category, p.unit_price, p.current_stock, p.min_stock_alert,
  p.location, p.is_active, p.created_by, p.created_at, p.updated_at
`;

const SORTABLE_COLUMNS: Record<string, string> = {
  createdAt: 'p.created_at',
  name: 'p.name',
  sku: 'p.sku',
  unitPrice: 'p.unit_price',
  currentStock: 'p.current_stock',
};

function buildFilters(params: ProductListQuery): { where: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (params.search) {
    values.push(`%${params.search}%`);
    const i = values.length;
    clauses.push(`(p.name ILIKE $${i} OR p.sku ILIKE $${i} OR p.category ILIKE $${i})`);
  }
  if (params.category) {
    values.push(params.category);
    clauses.push(`p.category = $${values.length}`);
  }
  if (params.lowStock === true) {
    clauses.push('p.current_stock <= p.min_stock_alert');
  }
  if (params.isActive !== undefined) {
    values.push(params.isActive);
    clauses.push(`p.is_active = $${values.length}`);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
}

export async function listProducts(
  params: ProductListQuery,
): Promise<{ rows: ProductRecord[]; total: number }> {
  const { where, values } = buildFilters(params);
  const sortColumn = SORTABLE_COLUMNS[params.sortBy] ?? 'p.created_at';
  const direction = params.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const offset = (params.page - 1) * params.limit;
  const listValues = [...values, params.limit, offset];

  const { rows } = await query<ProductRecord>(
    `SELECT ${PRODUCT_COLUMNS}
       FROM products p
       ${where}
      ORDER BY ${sortColumn} ${direction}, p.id DESC
      LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
    listValues,
  );
  const { rows: countRows } = await query<{ count: number }>(
    `SELECT count(*)::bigint AS count FROM products p ${where}`,
    values,
  );
  return { rows, total: countRows[0]?.count ?? 0 };
}

export async function findProductById(
  id: string,
  db: Queryable = pool,
): Promise<ProductRecord | null> {
  const { rows } = await db.query<ProductRecord>(
    `SELECT ${PRODUCT_COLUMNS} FROM products p WHERE p.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findProductBySku(sku: string): Promise<ProductRecord | null> {
  const { rows } = await query<ProductRecord>(
    `SELECT ${PRODUCT_COLUMNS} FROM products p WHERE p.sku = $1`,
    [sku],
  );
  return rows[0] ?? null;
}

export async function listCategories(): Promise<string[]> {
  const { rows } = await query<{ category: string }>(
    'SELECT DISTINCT category FROM products ORDER BY category',
  );
  return rows.map((row) => row.category);
}

export interface ProductWriteModel {
  name: string;
  sku: string;
  category: string;
  unitPrice: number;
  currentStock: number;
  minStockAlert: number;
  location: string | null;
}

export async function insertProduct(
  data: ProductWriteModel,
  createdBy: string,
  db: Queryable = pool,
): Promise<ProductRecord> {
  const { rows } = await db.query<ProductRecord>(
    `INSERT INTO products
       (name, sku, category, unit_price, current_stock, min_stock_alert, location, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, name, sku, category, unit_price, current_stock, min_stock_alert,
               location, is_active, created_by, created_at, updated_at`,
    [
      data.name,
      data.sku,
      data.category,
      data.unitPrice,
      data.currentStock,
      data.minStockAlert,
      data.location,
      createdBy,
    ],
  );
  return rows[0] as ProductRecord;
}

const UPDATABLE_COLUMNS: Record<string, string> = {
  name: 'name',
  sku: 'sku',
  category: 'category',
  unitPrice: 'unit_price',
  minStockAlert: 'min_stock_alert',
  location: 'location',
  isActive: 'is_active',
};

/**
 * Note: `current_stock` is deliberately NOT updatable here. Stock only ever
 * changes through the stock-movement service, so the ledger stays complete.
 */
export async function updateProduct(
  id: string,
  patch: Record<string, unknown>,
  db: Queryable = pool,
): Promise<ProductRecord | null> {
  const assignments: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(patch)) {
    const column = UPDATABLE_COLUMNS[key];
    if (!column) continue;
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  }

  if (assignments.length === 0) {
    return findProductById(id, db);
  }

  values.push(id);
  const { rows } = await db.query<ProductRecord>(
    `UPDATE products SET ${assignments.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, name, sku, category, unit_price, current_stock, min_stock_alert,
                location, is_active, created_by, created_at, updated_at`,
    values,
  );
  return rows[0] ?? null;
}

/**
 * Lock a product row for the duration of the current transaction.
 *
 * `SELECT ... FOR UPDATE` serialises concurrent stock changes for the same
 * product, which is what prevents two simultaneous confirmations from both
 * reading stock=10 and each deducting 8.
 */
export async function lockProductForUpdate(
  db: Queryable,
  productId: string,
): Promise<ProductRecord | null> {
  const { rows } = await db.query<ProductRecord>(
    `SELECT id, name, sku, category, unit_price, current_stock, min_stock_alert,
            location, is_active, created_by, created_at, updated_at
       FROM products
      WHERE id = $1
      FOR UPDATE`,
    [productId],
  );
  return rows[0] ?? null;
}
