import { query, type Queryable } from '../../db/pool';
import { pool } from '../../db/pool';
import type { CustomerRecord, FollowUpRecord } from '../../types/domain';
import type { CustomerListQuery } from './customer.schema';

const CUSTOMER_COLUMNS = `
  c.id, c.name, c.mobile, c.email, c.business_name, c.gst_number, c.customer_type,
  c.address, c.status, c.follow_up_date, c.notes, c.created_by, c.created_at, c.updated_at
`;

const SORTABLE_COLUMNS: Record<string, string> = {
  createdAt: 'c.created_at',
  name: 'c.name',
  followUpDate: 'c.follow_up_date',
  status: 'c.status',
};

interface ListFilters {
  where: string;
  values: unknown[];
}

/**
 * Build the shared WHERE clause for list + count so both always agree.
 * Search spans name, business name, mobile, email and GST number.
 */
function buildFilters(params: CustomerListQuery): ListFilters {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (params.search) {
    values.push(`%${params.search}%`);
    const i = values.length;
    clauses.push(
      `(c.name ILIKE $${i} OR c.business_name ILIKE $${i} OR c.mobile ILIKE $${i} ` +
        `OR c.email ILIKE $${i} OR c.gst_number ILIKE $${i})`,
    );
  }

  if (params.status) {
    values.push(params.status);
    clauses.push(`c.status = $${values.length}`);
  }

  if (params.type) {
    values.push(params.type);
    clauses.push(`c.customer_type = $${values.length}`);
  }

  if (params.followUpBefore) {
    values.push(params.followUpBefore);
    clauses.push(`c.follow_up_date IS NOT NULL AND c.follow_up_date <= $${values.length}`);
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
}

export async function listCustomers(
  params: CustomerListQuery,
): Promise<{ rows: CustomerRecord[]; total: number }> {
  const { where, values } = buildFilters(params);
  const sortColumn = SORTABLE_COLUMNS[params.sortBy] ?? 'c.created_at';
  const direction = params.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const offset = (params.page - 1) * params.limit;

  const listValues = [...values, params.limit, offset];
  const { rows } = await query<CustomerRecord>(
    `SELECT ${CUSTOMER_COLUMNS},
            u.name AS created_by_name,
            (SELECT count(*) FROM customer_follow_ups f WHERE f.customer_id = c.id) AS follow_up_count
       FROM customers c
       LEFT JOIN users u ON u.id = c.created_by
       ${where}
      ORDER BY ${sortColumn} ${direction} NULLS LAST, c.id DESC
      LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
    listValues,
  );

  const { rows: countRows } = await query<{ count: number }>(
    `SELECT count(*)::bigint AS count FROM customers c ${where}`,
    values,
  );

  return { rows, total: countRows[0]?.count ?? 0 };
}

export async function findCustomerById(
  id: string,
  db: Queryable = pool,
): Promise<CustomerRecord | null> {
  const { rows } = await db.query<CustomerRecord>(
    `SELECT ${CUSTOMER_COLUMNS}, u.name AS created_by_name
       FROM customers c
       LEFT JOIN users u ON u.id = c.created_by
      WHERE c.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export interface CustomerWriteModel {
  name: string;
  mobile: string;
  email: string | null;
  businessName: string | null;
  gstNumber: string | null;
  customerType: string;
  address: string | null;
  status: string;
  followUpDate: string | null;
  notes: string | null;
}

export async function insertCustomer(
  data: CustomerWriteModel,
  createdBy: string,
): Promise<CustomerRecord> {
  const { rows } = await query<CustomerRecord>(
    `INSERT INTO customers
       (name, mobile, email, business_name, gst_number, customer_type, address, status,
        follow_up_date, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6::customer_type, $7, $8::customer_status, $9, $10, $11)
     RETURNING id, name, mobile, email, business_name, gst_number, customer_type, address,
               status, follow_up_date, notes, created_by, created_at, updated_at`,
    [
      data.name,
      data.mobile,
      data.email,
      data.businessName,
      data.gstNumber,
      data.customerType,
      data.address,
      data.status,
      data.followUpDate,
      data.notes,
      createdBy,
    ],
  );
  // INSERT ... RETURNING always yields exactly one row here.
  return rows[0] as CustomerRecord;
}

/** Column mapping for PATCH: only keys present in the payload are written. */
const UPDATABLE_COLUMNS: Record<string, { column: string; cast?: string }> = {
  name: { column: 'name' },
  mobile: { column: 'mobile' },
  email: { column: 'email' },
  businessName: { column: 'business_name' },
  gstNumber: { column: 'gst_number' },
  customerType: { column: 'customer_type', cast: '::customer_type' },
  address: { column: 'address' },
  status: { column: 'status', cast: '::customer_status' },
  followUpDate: { column: 'follow_up_date' },
  notes: { column: 'notes' },
};

export async function updateCustomer(
  id: string,
  patch: Record<string, unknown>,
  db: Queryable = pool,
): Promise<CustomerRecord | null> {
  const assignments: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(patch)) {
    const mapping = UPDATABLE_COLUMNS[key];
    if (!mapping) continue;
    values.push(value);
    assignments.push(`${mapping.column} = $${values.length}${mapping.cast ?? ''}`);
  }

  if (assignments.length === 0) {
    return findCustomerById(id, db);
  }

  values.push(id);
  const { rows } = await db.query<CustomerRecord>(
    `UPDATE customers SET ${assignments.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, name, mobile, email, business_name, gst_number, customer_type, address,
                status, follow_up_date, notes, created_by, created_at, updated_at`,
    values,
  );
  return rows[0] ?? null;
}

export async function listFollowUps(
  customerId: string,
  { page, limit }: { page: number; limit: number },
): Promise<{ rows: FollowUpRecord[]; total: number }> {
  const offset = (page - 1) * limit;
  const { rows } = await query<FollowUpRecord>(
    `SELECT f.id, f.customer_id, f.note, f.follow_up_date, f.created_by, f.created_at,
            u.name AS created_by_name
       FROM customer_follow_ups f
       LEFT JOIN users u ON u.id = f.created_by
      WHERE f.customer_id = $1
      ORDER BY f.created_at DESC, f.id DESC
      LIMIT $2 OFFSET $3`,
    [customerId, limit, offset],
  );
  const { rows: countRows } = await query<{ count: number }>(
    'SELECT count(*)::bigint AS count FROM customer_follow_ups WHERE customer_id = $1',
    [customerId],
  );
  return { rows, total: countRows[0]?.count ?? 0 };
}

export async function insertFollowUp(
  customerId: string,
  note: string,
  followUpDate: string | null,
  createdBy: string,
  db: Queryable = pool,
): Promise<FollowUpRecord> {
  // The author's display name is joined in so the created row matches the shape
  // returned by the list endpoint.
  const { rows } = await db.query<FollowUpRecord>(
    `WITH inserted AS (
       INSERT INTO customer_follow_ups (customer_id, note, follow_up_date, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, customer_id, note, follow_up_date, created_by, created_at
     )
     SELECT inserted.*, u.name AS created_by_name
       FROM inserted
       LEFT JOIN users u ON u.id = inserted.created_by`,
    [customerId, note, followUpDate, createdBy],
  );
  return rows[0] as FollowUpRecord;
}
