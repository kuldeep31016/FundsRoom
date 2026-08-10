import supertest from 'supertest';
import { createApp, API_PREFIX } from '../../src/app';
import { pool } from '../../src/db/pool';
import { hashPassword } from '../../src/modules/auth/auth.service';
import type { Role } from '../../src/config/permissions';

export const app = createApp();
export const request = supertest(app);
export const BASE = API_PREFIX;

export const TEST_PASSWORD = 'Password@123';

export const TEST_USERS: Record<Role, { email: string; name: string }> = {
  ADMIN: { email: 'admin@test.local', name: 'Test Admin' },
  SALES: { email: 'sales@test.local', name: 'Test Sales' },
  WAREHOUSE: { email: 'warehouse@test.local', name: 'Test Warehouse' },
  ACCOUNTS: { email: 'accounts@test.local', name: 'Test Accounts' },
};

/** Create the four role accounts (idempotent). */
export async function ensureTestUsers(): Promise<void> {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  for (const [role, user] of Object.entries(TEST_USERS)) {
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4::user_role)
       ON CONFLICT (lower(email)) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = true`,
      [user.name, user.email, passwordHash, role],
    );
  }
}

const tokenCache = new Map<Role, string>();

/** Log in as a role and return the bearer token (cached per suite run). */
export async function loginAs(role: Role): Promise<string> {
  const cached = tokenCache.get(role);
  if (cached) return cached;

  const response = await request
    .post(`${BASE}/auth/login`)
    .send({ email: TEST_USERS[role].email, password: TEST_PASSWORD });

  if (response.status !== 200) {
    throw new Error(`Login failed for ${role}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  const token = response.body.data.token as string;
  tokenCache.set(role, token);
  return token;
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** Wipe business data between test files, leaving the user accounts in place. */
export async function resetBusinessData(): Promise<void> {
  await pool.query(`
    TRUNCATE challan_items, challans, challan_number_sequences,
             stock_movements, customer_follow_ups, customers, products
    RESTART IDENTITY CASCADE
  `);
}

export async function getUserId(role: Role): Promise<string> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
    TEST_USERS[role].email,
  ]);
  if (!rows[0]) throw new Error(`Test user for ${role} not found`);
  return rows[0].id;
}

/** Read a product's live stock straight from the database. */
export async function stockOf(productId: string): Promise<number> {
  const { rows } = await pool.query<{ current_stock: number }>(
    'SELECT current_stock FROM products WHERE id = $1',
    [productId],
  );
  return rows[0]?.current_stock ?? -1;
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

let skuCounter = 0;

export async function createCustomer(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; [key: string]: unknown }> {
  const response = await request
    .post(`${BASE}/customers`)
    .set(authHeader(token))
    .send({
      name: 'Fixture Customer',
      mobile: '9876543210',
      customerType: 'RETAIL',
      status: 'ACTIVE',
      ...overrides,
    });
  if (response.status !== 201) {
    throw new Error(`createCustomer failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.data;
}

export async function createProduct(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; currentStock: number; unitPrice: number; [key: string]: unknown }> {
  skuCounter += 1;
  const response = await request
    .post(`${BASE}/products`)
    .set(authHeader(token))
    .send({
      name: `Fixture Product ${skuCounter}`,
      sku: `FIX-${String(skuCounter).padStart(4, '0')}`,
      category: 'Fixtures',
      unitPrice: 100,
      currentStock: 20,
      minStockAlert: 5,
      location: 'Warehouse T',
      ...overrides,
    });
  if (response.status !== 201) {
    throw new Error(`createProduct failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.data;
}
