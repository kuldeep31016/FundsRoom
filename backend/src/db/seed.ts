import { env } from '../config/env';
import type { Role } from '../config/permissions';
import { withTransaction, type Queryable } from './pool';
import { hashPassword } from '../modules/auth/auth.service';
import { logger } from '../utils/logger';

interface SeedUser {
  name: string;
  email: string;
  role: Role;
}

/** Demo accounts — one per role, all sharing SEED_DEFAULT_PASSWORD. */
export const SEED_USERS: SeedUser[] = [
  { name: 'Aarti Deshpande', email: 'admin@erpcrm.test', role: 'ADMIN' },
  { name: 'Rohit Sharma', email: 'sales@erpcrm.test', role: 'SALES' },
  { name: 'Imran Qureshi', email: 'warehouse@erpcrm.test', role: 'WAREHOUSE' },
  { name: 'Neha Bhatt', email: 'accounts@erpcrm.test', role: 'ACCOUNTS' },
];

const CUSTOMERS = [
  {
    name: 'Suresh Patel',
    mobile: '9822011234',
    email: 'suresh@patelstores.test',
    businessName: 'Patel General Stores',
    gstNumber: '27AAPFU0939F1ZV',
    customerType: 'RETAIL',
    address: '14 MG Road, Pune, Maharashtra 411001',
    status: 'ACTIVE',
    followUpDays: 3,
    notes: 'Prefers delivery before noon. Pays by UPI.',
  },
  {
    name: 'Meera Nair',
    mobile: '9845567890',
    email: 'meera@nairtraders.test',
    businessName: 'Nair Traders',
    gstNumber: '29AACCN1234K1Z5',
    customerType: 'WHOLESALE',
    address: '221 Brigade Road, Bengaluru, Karnataka 560001',
    status: 'ACTIVE',
    followUpDays: 10,
    notes: 'Bulk buyer, negotiates on freight. 30-day credit.',
  },
  {
    name: 'Vikram Singh',
    mobile: '9911223344',
    email: 'vikram@singhdistribution.test',
    businessName: 'Singh Distribution Pvt Ltd',
    gstNumber: '07AABCS7890L1ZQ',
    customerType: 'DISTRIBUTOR',
    address: 'Plot 42, Okhla Phase II, New Delhi 110020',
    status: 'ACTIVE',
    followUpDays: 1,
    notes: 'Largest account by volume. Quarterly rate revision due.',
  },
  {
    name: 'Fatima Sheikh',
    mobile: '9765432109',
    email: 'fatima@sheikhmart.test',
    businessName: 'Sheikh Mart',
    gstNumber: null,
    customerType: 'RETAIL',
    address: '8 Station Road, Nagpur, Maharashtra 440001',
    status: 'LEAD',
    followUpDays: 2,
    notes: 'Enquired about detergent range. Awaiting price list.',
  },
  {
    name: 'Anil Kumar',
    mobile: '9990011223',
    email: null,
    businessName: 'Kumar Kirana',
    gstNumber: null,
    customerType: 'RETAIL',
    address: '3 Gandhi Chowk, Indore, Madhya Pradesh 452001',
    status: 'LEAD',
    followUpDays: 5,
    notes: 'Walk-in enquiry at the trade fair.',
  },
  {
    name: 'Priya Raghavan',
    mobile: '9500123456',
    email: 'priya@raghavanagencies.test',
    businessName: 'Raghavan Agencies',
    gstNumber: '33AAGCR4567M1ZX',
    customerType: 'WHOLESALE',
    address: '56 Anna Salai, Chennai, Tamil Nadu 600002',
    status: 'INACTIVE',
    followUpDays: null,
    notes: 'Dormant since last season. Re-engage before Diwali.',
  },
];

const PRODUCTS = [
  { name: 'Sunlight Detergent Powder 1kg', sku: 'DET-SUN-1KG', category: 'Detergents', unitPrice: 145.0, stock: 240, minStock: 50, location: 'Warehouse A - Rack 1' },
  { name: 'Sunlight Detergent Bar 250g', sku: 'DET-SUN-BAR', category: 'Detergents', unitPrice: 32.5, stock: 40, minStock: 60, location: 'Warehouse A - Rack 1' },
  { name: 'Aqua Pure Drinking Water 20L', sku: 'BEV-AQUA-20L', category: 'Beverages', unitPrice: 85.0, stock: 120, minStock: 30, location: 'Warehouse B - Bay 3' },
  { name: 'Golden Harvest Basmati Rice 5kg', sku: 'GRO-RICE-5KG', category: 'Groceries', unitPrice: 620.0, stock: 75, minStock: 20, location: 'Warehouse A - Rack 4' },
  { name: 'Golden Harvest Toor Dal 1kg', sku: 'GRO-DAL-1KG', category: 'Groceries', unitPrice: 168.0, stock: 18, minStock: 25, location: 'Warehouse A - Rack 4' },
  { name: 'Freshline Refined Sunflower Oil 1L', sku: 'GRO-OIL-1L', category: 'Groceries', unitPrice: 152.0, stock: 300, minStock: 80, location: 'Warehouse B - Bay 1' },
  { name: 'CleanMax Floor Cleaner 1L', sku: 'CLN-FLOOR-1L', category: 'Cleaning', unitPrice: 98.0, stock: 160, minStock: 40, location: 'Warehouse A - Rack 2' },
  { name: 'CleanMax Dishwash Gel 500ml', sku: 'CLN-DISH-500', category: 'Cleaning', unitPrice: 76.0, stock: 12, minStock: 30, location: 'Warehouse A - Rack 2' },
  { name: 'Bright Steel Scrubber Pack of 6', sku: 'CLN-SCRUB-6', category: 'Cleaning', unitPrice: 45.0, stock: 210, minStock: 50, location: 'Warehouse A - Rack 3' },
  { name: 'Morning Blend Tea 500g', sku: 'BEV-TEA-500', category: 'Beverages', unitPrice: 240.0, stock: 95, minStock: 25, location: 'Warehouse B - Bay 2' },
  { name: 'Morning Blend Instant Coffee 200g', sku: 'BEV-COF-200', category: 'Beverages', unitPrice: 385.0, stock: 60, minStock: 15, location: 'Warehouse B - Bay 2' },
  { name: 'SoftTouch Facial Tissue 100 pulls', sku: 'PER-TIS-100', category: 'Personal Care', unitPrice: 68.0, stock: 140, minStock: 35, location: 'Warehouse C - Rack 1' },
];

function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function seedUsers(db: Queryable): Promise<Map<Role, string>> {
  const passwordHash = await hashPassword(env.SEED_DEFAULT_PASSWORD);
  const idsByRole = new Map<Role, string>();

  for (const user of SEED_USERS) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4::user_role)
       ON CONFLICT (lower(email)) DO NOTHING
       RETURNING id`,
      [user.name, user.email, passwordHash, user.role],
    );

    let id = rows[0]?.id;
    if (!id) {
      // Row already existed — refresh its password so the documented demo
      // credentials always work, and reuse the existing id.
      const { rows: existing } = await db.query<{ id: string }>(
        `UPDATE users SET password_hash = $2, name = $3, role = $4::user_role, is_active = true
          WHERE lower(email) = lower($1)
          RETURNING id`,
        [user.email, passwordHash, user.name, user.role],
      );
      id = existing[0]?.id;
    }
    if (id) idsByRole.set(user.role, id);
  }

  return idsByRole;
}

async function seedCustomers(db: Queryable, salesUserId: string): Promise<string[]> {
  const ids: string[] = [];

  for (const customer of CUSTOMERS) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO customers
         (name, mobile, email, business_name, gst_number, customer_type, address, status,
          follow_up_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6::customer_type,$7,$8::customer_status,$9,$10,$11)
       RETURNING id`,
      [
        customer.name,
        customer.mobile,
        customer.email,
        customer.businessName,
        customer.gstNumber,
        customer.customerType,
        customer.address,
        customer.status,
        customer.followUpDays === null ? null : daysFromNow(customer.followUpDays),
        customer.notes,
        salesUserId,
      ],
    );
    const id = rows[0]?.id;
    if (id) ids.push(id);
  }

  // A couple of follow-up notes so the CRM activity trail is not empty.
  if (ids[0]) {
    await db.query(
      `INSERT INTO customer_follow_ups (customer_id, note, follow_up_date, created_by)
       VALUES ($1, $2, $3, $4), ($1, $5, NULL, $4)`,
      [
        ids[0],
        'Called to confirm the monthly detergent order. Wants delivery on the 5th.',
        daysFromNow(3),
        salesUserId,
        'Shared the updated price list over WhatsApp.',
      ],
    );
  }
  if (ids[3]) {
    await db.query(
      `INSERT INTO customer_follow_ups (customer_id, note, follow_up_date, created_by)
       VALUES ($1, $2, $3, $4)`,
      [ids[3], 'First contact at the trade fair — send the detergent catalogue.', daysFromNow(2), salesUserId],
    );
  }

  return ids;
}

/**
 * Products are inserted with zero stock and then topped up through a real
 * stock movement, so the seeded data obeys the same invariant as the running
 * application: every unit of stock is explained by the ledger.
 */
async function seedProducts(db: Queryable, warehouseUserId: string): Promise<string[]> {
  const ids: string[] = [];

  for (const product of PRODUCTS) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, sku, category, unit_price, current_stock, min_stock_alert, location, created_by)
       VALUES ($1,$2,$3,$4,0,$5,$6,$7)
       RETURNING id`,
      [
        product.name,
        product.sku,
        product.category,
        product.unitPrice,
        product.minStock,
        product.location,
        warehouseUserId,
      ],
    );
    const id = rows[0]?.id;
    if (!id) continue;
    ids.push(id);

    if (product.stock > 0) {
      await db.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity, stock_before, stock_after, reason, reference_type, reference_id, created_by)
         VALUES ($1, 'IN', $2, 0, $2, 'Opening stock', 'PRODUCT_OPENING', $1, $3)`,
        [id, product.stock, warehouseUserId],
      );
      await db.query('UPDATE products SET current_stock = $1 WHERE id = $2', [product.stock, id]);
    }
  }

  return ids;
}

/**
 * Two demo challans: one DRAFT (no stock impact) and one CONFIRMED (stock
 * deducted with matching OUT movements), so every status is represented.
 */
async function seedChallans(
  db: Queryable,
  customerIds: string[],
  productIds: string[],
  salesUserId: string,
): Promise<void> {
  const year = new Date().getFullYear();

  async function nextNumber(): Promise<string> {
    const { rows } = await db.query<{ last_number: number }>(
      `INSERT INTO challan_number_sequences (prefix, last_number) VALUES ($1, 1)
       ON CONFLICT (prefix) DO UPDATE SET last_number = challan_number_sequences.last_number + 1, updated_at = now()
       RETURNING last_number`,
      [`CH-${year}`],
    );
    return `CH-${year}-${String(rows[0]?.last_number ?? 1).padStart(6, '0')}`;
  }

  interface Line {
    productId: string;
    quantity: number;
  }

  async function createChallan(
    customerId: string,
    lines: Line[],
    confirm: boolean,
    notes: string,
  ): Promise<void> {
    const products = new Map<string, { name: string; sku: string; category: string; location: string | null; unitPrice: number; stock: number }>();
    for (const line of lines) {
      const { rows } = await db.query<{
        name: string;
        sku: string;
        category: string;
        location: string | null;
        unit_price: number;
        current_stock: number;
      }>(
        'SELECT name, sku, category, location, unit_price, current_stock FROM products WHERE id = $1',
        [line.productId],
      );
      const row = rows[0];
      if (!row) continue;
      products.set(line.productId, {
        name: row.name,
        sku: row.sku,
        category: row.category,
        location: row.location,
        unitPrice: row.unit_price,
        stock: row.current_stock,
      });
    }

    const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    const totalAmount = lines.reduce(
      (sum, line) => sum + line.quantity * (products.get(line.productId)?.unitPrice ?? 0),
      0,
    );

    const challanNumber = await nextNumber();
    const { rows: challanRows } = await db.query<{ id: string }>(
      `INSERT INTO challans (challan_number, customer_id, status, total_quantity, total_amount, notes, created_by)
       VALUES ($1,$2,'DRAFT',$3,$4,$5,$6)
       RETURNING id`,
      [challanNumber, customerId, totalQuantity, totalAmount.toFixed(2), notes, salesUserId],
    );
    const challanId = challanRows[0]?.id;
    if (!challanId) return;

    for (const line of lines) {
      const product = products.get(line.productId);
      if (!product) continue;
      await db.query(
        `INSERT INTO challan_items
           (challan_id, product_id, product_name, product_sku, product_category, product_location, unit_price, quantity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          challanId,
          line.productId,
          product.name,
          product.sku,
          product.category,
          product.location,
          product.unitPrice,
          line.quantity,
        ],
      );
    }

    if (confirm) {
      for (const line of lines) {
        const { rows } = await db.query<{ current_stock: number }>(
          'SELECT current_stock FROM products WHERE id = $1 FOR UPDATE',
          [line.productId],
        );
        const before = rows[0]?.current_stock ?? 0;
        const after = before - line.quantity;
        await db.query('UPDATE products SET current_stock = $1 WHERE id = $2', [after, line.productId]);
        await db.query(
          `INSERT INTO stock_movements
             (product_id, movement_type, quantity, stock_before, stock_after, reason, reference_type, reference_id, created_by)
           VALUES ($1,'OUT',$2,$3,$4,$5,'CHALLAN',$6,$7)`,
          [line.productId, line.quantity, before, after, `Sales Challan ${challanNumber}`, challanId, salesUserId],
        );
      }
      await db.query(
        `UPDATE challans SET status = 'CONFIRMED', confirmed_by = $2, confirmed_at = now() WHERE id = $1`,
        [challanId, salesUserId],
      );
    }
  }

  if (customerIds[0] && productIds[0] && productIds[5] && productIds[6]) {
    await createChallan(
      customerIds[0],
      [
        { productId: productIds[0], quantity: 20 },
        { productId: productIds[5], quantity: 15 },
        { productId: productIds[6], quantity: 10 },
      ],
      true,
      'Monthly replenishment. Delivered by our own vehicle.',
    );
  }

  if (customerIds[1] && productIds[3] && productIds[9]) {
    await createChallan(
      customerIds[1],
      [
        { productId: productIds[3], quantity: 12 },
        { productId: productIds[9], quantity: 8 },
      ],
      false,
      'Awaiting confirmation of the freight rate before dispatch.',
    );
  }
}

export async function runSeed(): Promise<void> {
  await withTransaction(async (client) => {
    const alreadySeeded = await client.query<{ count: number }>(
      'SELECT count(*)::bigint AS count FROM customers',
    );
    if ((alreadySeeded.rows[0]?.count ?? 0) > 0) {
      logger.warn('Customers already exist — refreshing demo users only, business data left untouched.');
      await seedUsers(client);
      return;
    }

    const userIds = await seedUsers(client);
    const adminId = userIds.get('ADMIN');
    const salesId = userIds.get('SALES') ?? adminId;
    const warehouseId = userIds.get('WAREHOUSE') ?? adminId;

    if (!salesId || !warehouseId) {
      throw new Error('Seeding failed: could not resolve seeded user ids');
    }

    const customerIds = await seedCustomers(client, salesId);
    const productIds = await seedProducts(client, warehouseId);
    await seedChallans(client, customerIds, productIds, salesId);

    logger.info(
      `Seeded ${SEED_USERS.length} users, ${customerIds.length} customers, ${productIds.length} products and 2 challans`,
    );
  });
}
