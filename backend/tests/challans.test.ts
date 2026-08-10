import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BASE,
  authHeader,
  createCustomer,
  createProduct,
  ensureTestUsers,
  loginAs,
  request,
  resetBusinessData,
  stockOf,
} from './helpers/test-app';
import { closePool, pool } from '../src/db/pool';

let salesToken: string;
let warehouseToken: string;
let customerId: string;

async function createChallan(body: Record<string, unknown>, token = salesToken) {
  return request.post(`${BASE}/challans`).set(authHeader(token)).send(body);
}

describe('Sales Challan module', () => {
  beforeAll(async () => {
    await ensureTestUsers();
    await resetBusinessData();
    salesToken = await loginAs('SALES');
    warehouseToken = await loginAs('WAREHOUSE');
    const customer = await createCustomer(salesToken, { name: 'Challan Customer', mobile: '9800000001' });
    customerId = customer.id as string;
  });

  afterAll(async () => {
    await closePool();
  });

  // -------------------------------------------------------------------------
  describe('Creation', () => {
    it('creates a draft with an auto-generated challan number and correct totals', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 20, unitPrice: 150 });

      const response = await createChallan({
        customerId,
        items: [{ productId: product.id, quantity: 5 }],
        status: 'DRAFT',
        notes: 'Awaiting transport confirmation',
      });

      expect(response.status).toBe(201);
      const data = response.body.data;
      expect(data.challanNumber).toMatch(/^CH-\d{4}-\d{6}$/);
      expect(data.status).toBe('DRAFT');
      expect(data.totalQuantity).toBe(5);
      expect(data.totalAmount).toBe(750);
      expect(data.createdByName).toBe('Test Sales');
      expect(data.customer.name).toBe('Challan Customer');
      expect(data.createdAt).toBeTruthy();
      expect(data.items).toHaveLength(1);
    });

    it('defaults to DRAFT when no status is supplied', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 10 });
      const response = await createChallan({ customerId, items: [{ productId: product.id, quantity: 1 }] });
      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('DRAFT');
    });

    it('issues strictly increasing, unique challan numbers', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 100 });
      const numbers: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const response = await createChallan({
          customerId,
          items: [{ productId: product.id, quantity: 1 }],
        });
        numbers.push(response.body.data.challanNumber);
      }
      expect(new Set(numbers).size).toBe(5);
      expect([...numbers].sort()).toEqual(numbers);
    });

    it('keeps challan numbers unique under concurrent creation', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 100 });
      const responses = await Promise.all(
        Array.from({ length: 8 }, () =>
          createChallan({ customerId, items: [{ productId: product.id, quantity: 1 }] }),
        ),
      );
      const numbers = responses.map((r) => r.body.data.challanNumber);
      expect(responses.every((r) => r.status === 201)).toBe(true);
      expect(new Set(numbers).size).toBe(8);
    });

    it('handles multiple products and sums the totals across lines', async () => {
      const a = await createProduct(warehouseToken, { currentStock: 50, unitPrice: 100 });
      const b = await createProduct(warehouseToken, { currentStock: 50, unitPrice: 250 });
      const c = await createProduct(warehouseToken, { currentStock: 50, unitPrice: 12.5 });

      const response = await createChallan({
        customerId,
        items: [
          { productId: a.id, quantity: 2 },
          { productId: b.id, quantity: 3 },
          { productId: c.id, quantity: 4 },
        ],
      });

      expect(response.status).toBe(201);
      expect(response.body.data.items).toHaveLength(3);
      expect(response.body.data.totalQuantity).toBe(9);
      expect(response.body.data.totalAmount).toBe(1000); // 200 + 750 + 50
    });

    it('merges a product repeated across two lines into one line', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 50, unitPrice: 10 });
      const response = await createChallan({
        customerId,
        items: [
          { productId: product.id, quantity: 3 },
          { productId: product.id, quantity: 4 },
        ],
      });

      expect(response.status).toBe(201);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0].quantity).toBe(7);
      expect(response.body.data.totalQuantity).toBe(7);
    });

    it('RULE 4 — a draft does not reduce stock', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 20 });
      const response = await createChallan({
        customerId,
        items: [{ productId: product.id, quantity: 5 }],
        status: 'DRAFT',
      });

      expect(response.status).toBe(201);
      expect(await stockOf(product.id)).toBe(20);

      const movements = await request
        .get(`${BASE}/stock/movements?productId=${product.id}&referenceType=CHALLAN`)
        .set(authHeader(warehouseToken));
      expect(movements.body.meta.total).toBe(0);
    });

    it('RULE 1 — creating directly as CONFIRMED reduces stock and logs an OUT movement', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 20 });

      const response = await createChallan({
        customerId,
        items: [{ productId: product.id, quantity: 5 }],
        status: 'CONFIRMED',
      });

      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('CONFIRMED');
      expect(response.body.data.confirmedAt).toBeTruthy();
      expect(response.body.data.confirmedByName).toBe('Test Sales');
      expect(await stockOf(product.id)).toBe(15);

      const movements = await request
        .get(`${BASE}/stock/movements?productId=${product.id}&referenceType=CHALLAN`)
        .set(authHeader(warehouseToken));
      expect(movements.body.meta.total).toBe(1);
      expect(movements.body.data[0]).toMatchObject({
        movementType: 'OUT',
        quantity: 5,
        quantityChange: -5,
        stockBefore: 20,
        stockAfter: 15,
        referenceType: 'CHALLAN',
        referenceId: response.body.data.id,
      });
      expect(movements.body.data[0].reason).toContain('Sales Challan');
      expect(movements.body.data[0].createdByName).toBe('Test Sales');
    });

    it('rejects CANCELLED as an initial status', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 10 });
      const response = await createChallan({
        customerId,
        items: [{ productId: product.id, quantity: 1 }],
        status: 'CANCELLED',
      });
      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  describe('Validation and edge cases', () => {
    it('rejects a challan with no items (400)', async () => {
      const empty = await createChallan({ customerId, items: [] });
      expect(empty.status).toBe(400);

      const missing = await createChallan({ customerId });
      expect(missing.status).toBe(400);
    });

    it('rejects zero, negative, fractional and non-numeric quantities (400)', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 50 });
      for (const quantity of [0, -3, 1.5, 'two']) {
        const response = await createChallan({
          customerId,
          items: [{ productId: product.id, quantity }],
        });
        expect(response.status, `quantity=${quantity}`).toBe(400);
      }
    });

    it('returns 404 for an unknown customer and 400 for a malformed customer id', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 10 });

      const unknown = await createChallan({
        customerId: '11111111-1111-1111-1111-111111111111',
        items: [{ productId: product.id, quantity: 1 }],
      });
      expect(unknown.status).toBe(404);

      const malformed = await createChallan({
        customerId: 'nope',
        items: [{ productId: product.id, quantity: 1 }],
      });
      expect(malformed.status).toBe(400);
    });

    it('returns 404 for an unknown product and 400 for a malformed product id', async () => {
      const unknown = await createChallan({
        customerId,
        items: [{ productId: '11111111-1111-1111-1111-111111111111', quantity: 1 }],
      });
      expect(unknown.status).toBe(404);

      const malformed = await createChallan({ customerId, items: [{ productId: 'nope', quantity: 1 }] });
      expect(malformed.status).toBe(400);
    });

    it('refuses to add an inactive product', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 10 });
      await request
        .patch(`${BASE}/products/${product.id}`)
        .set(authHeader(warehouseToken))
        .send({ isActive: false });

      const response = await createChallan({ customerId, items: [{ productId: product.id, quantity: 1 }] });
      expect(response.status).toBe(409);
    });
  });

  // -------------------------------------------------------------------------
  describe('RULE 2 / RULE 3 — insufficient stock', () => {
    it('refuses to confirm when a single line exceeds stock, and deducts nothing', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 20 });

      const response = await createChallan({
        customerId,
        items: [{ productId: product.id, quantity: 25 }],
        status: 'CONFIRMED',
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(response.body.error.meta.shortfalls[0]).toMatchObject({
        requestedQuantity: 25,
        availableStock: 20,
        shortfall: 5,
      });
      expect(await stockOf(product.id)).toBe(20);
    });

    it('rolls the whole transaction back — no partial deduction across lines', async () => {
      const ok = await createProduct(warehouseToken, { currentStock: 100 });
      const short = await createProduct(warehouseToken, { currentStock: 2 });

      const response = await createChallan({
        customerId,
        items: [
          { productId: ok.id, quantity: 10 },
          { productId: short.id, quantity: 50 },
        ],
        status: 'CONFIRMED',
      });

      expect(response.status).toBe(409);
      // The sufficient line must NOT have been deducted.
      expect(await stockOf(ok.id)).toBe(100);
      expect(await stockOf(short.id)).toBe(2);

      // And no challan row survived the rollback.
      const { rows } = await pool.query<{ count: number }>(
        'SELECT count(*)::bigint AS count FROM challan_items WHERE product_id = $1',
        [short.id],
      );
      expect(rows[0]?.count).toBe(0);
    });

    it('reports every short line in one error', async () => {
      const a = await createProduct(warehouseToken, { currentStock: 1 });
      const b = await createProduct(warehouseToken, { currentStock: 1 });

      const response = await createChallan({
        customerId,
        items: [
          { productId: a.id, quantity: 5 },
          { productId: b.id, quantity: 9 },
        ],
        status: 'CONFIRMED',
      });

      expect(response.status).toBe(409);
      expect(response.body.error.meta.shortfalls).toHaveLength(2);
    });

    it('allows confirming a quantity exactly equal to available stock', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 7 });
      const response = await createChallan({
        customerId,
        items: [{ productId: product.id, quantity: 7 }],
        status: 'CONFIRMED',
      });
      expect(response.status).toBe(201);
      expect(await stockOf(product.id)).toBe(0);
    });

    it('refuses to confirm a draft raised before stock ran out', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 10 });
      const draft = await createChallan({
        customerId,
        items: [{ productId: product.id, quantity: 8 }],
        status: 'DRAFT',
      });

      // Warehouse writes the stock off in the meantime.
      await request
        .post(`${BASE}/stock/movements`)
        .set(authHeader(warehouseToken))
        .send({ productId: product.id, movementType: 'OUT', quantity: 6, reason: 'Damaged' });

      const confirm = await request
        .post(`${BASE}/challans/${draft.body.data.id}/confirm`)
        .set(authHeader(salesToken));

      expect(confirm.status).toBe(409);
      expect(confirm.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(await stockOf(product.id)).toBe(4);

      const stillDraft = await request
        .get(`${BASE}/challans/${draft.body.data.id}`)
        .set(authHeader(salesToken));
      expect(stillDraft.body.data.status).toBe('DRAFT');
    });

    it('never lets stock go negative under concurrent confirmations', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 10 });
      const drafts = await Promise.all([
        createChallan({ customerId, items: [{ productId: product.id, quantity: 8 }] }),
        createChallan({ customerId, items: [{ productId: product.id, quantity: 8 }] }),
      ]);

      const results = await Promise.all(
        drafts.map((draft) =>
          request.post(`${BASE}/challans/${draft.body.data.id}/confirm`).set(authHeader(salesToken)),
        ),
      );

      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 409]);
      expect(await stockOf(product.id)).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  describe('RULE 5 — product snapshot', () => {
    it('stores the product name, SKU, category, location and unit price on each line', async () => {
      const product = await createProduct(warehouseToken, {
        name: 'Snapshot Widget',
        sku: 'SNAP-0001',
        category: 'Widgets',
        location: 'Bay 9',
        unitPrice: 199.99,
        currentStock: 30,
      });

      const response = await createChallan({
        customerId,
        items: [{ productId: product.id, quantity: 2 }],
      });

      expect(response.body.data.items[0]).toMatchObject({
        productId: product.id,
        productName: 'Snapshot Widget',
        productSku: 'SNAP-0001',
        productCategory: 'Widgets',
        productLocation: 'Bay 9',
        unitPrice: 199.99,
        quantity: 2,
        lineTotal: 399.98,
      });
    });

    it('keeps historical values after the product master is renamed and repriced', async () => {
      const product = await createProduct(warehouseToken, {
        name: 'Original Name',
        sku: 'HIST-0001',
        category: 'Original Category',
        unitPrice: 100,
        currentStock: 30,
      });

      const challan = await createChallan({
        customerId,
        items: [{ productId: product.id, quantity: 3 }],
        status: 'CONFIRMED',
      });
      expect(challan.status).toBe(201);
      const originalTotal = challan.body.data.totalAmount;

      // Change everything about the master record.
      const patched = await request
        .patch(`${BASE}/products/${product.id}`)
        .set(authHeader(warehouseToken))
        .send({
          name: 'Completely Different Name',
          sku: 'HIST-9999',
          category: 'New Category',
          unitPrice: 999,
        });
      expect(patched.status).toBe(200);

      const reread = await request
        .get(`${BASE}/challans/${challan.body.data.id}`)
        .set(authHeader(salesToken));

      expect(reread.body.data.items[0]).toMatchObject({
        productName: 'Original Name',
        productSku: 'HIST-0001',
        productCategory: 'Original Category',
        unitPrice: 100,
      });
      expect(reread.body.data.totalAmount).toBe(originalTotal);
      // The link to the live product is still available for drill-down.
      expect(reread.body.data.items[0].productId).toBe(product.id);
    });
  });

  // -------------------------------------------------------------------------
  describe('Confirmation', () => {
    it('confirms a draft, reduces stock and stamps the confirming user', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 20 });
      const draft = await createChallan({
        customerId,
        items: [{ productId: product.id, quantity: 5 }],
      });
      expect(await stockOf(product.id)).toBe(20);

      const response = await request
        .post(`${BASE}/challans/${draft.body.data.id}/confirm`)
        .set(authHeader(salesToken));

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('CONFIRMED');
      expect(response.body.data.confirmedByName).toBe('Test Sales');
      expect(await stockOf(product.id)).toBe(15);
    });

    it('writes one OUT movement per line when confirming a multi-line challan', async () => {
      const a = await createProduct(warehouseToken, { currentStock: 30 });
      const b = await createProduct(warehouseToken, { currentStock: 30 });
      const draft = await createChallan({
        customerId,
        items: [
          { productId: a.id, quantity: 4 },
          { productId: b.id, quantity: 6 },
        ],
      });

      await request.post(`${BASE}/challans/${draft.body.data.id}/confirm`).set(authHeader(salesToken));

      expect(await stockOf(a.id)).toBe(26);
      expect(await stockOf(b.id)).toBe(24);

      const movements = await request
        .get(`${BASE}/stock/movements?referenceType=CHALLAN&limit=100`)
        .set(authHeader(warehouseToken));
      const forThisChallan = movements.body.data.filter(
        (m: { referenceId: string }) => m.referenceId === draft.body.data.id,
      );
      expect(forThisChallan).toHaveLength(2);
    });

    it('rejects a second confirmation with 409 and does not deduct twice', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 20 });
      const draft = await createChallan({ customerId, items: [{ productId: product.id, quantity: 5 }] });

      const first = await request
        .post(`${BASE}/challans/${draft.body.data.id}/confirm`)
        .set(authHeader(salesToken));
      expect(first.status).toBe(200);

      const second = await request
        .post(`${BASE}/challans/${draft.body.data.id}/confirm`)
        .set(authHeader(salesToken));
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('INVALID_STATE_TRANSITION');
      expect(await stockOf(product.id)).toBe(15);
    });

    it('returns 404 for an unknown challan and 400 for a malformed id', async () => {
      const unknown = await request
        .post(`${BASE}/challans/11111111-1111-1111-1111-111111111111/confirm`)
        .set(authHeader(salesToken));
      expect(unknown.status).toBe(404);

      const malformed = await request.post(`${BASE}/challans/nope/confirm`).set(authHeader(salesToken));
      expect(malformed.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  describe('Cancellation', () => {
    it('cancels a draft without touching stock', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 20 });
      const draft = await createChallan({ customerId, items: [{ productId: product.id, quantity: 5 }] });

      const response = await request
        .post(`${BASE}/challans/${draft.body.data.id}/cancel`)
        .set(authHeader(salesToken))
        .send({ reason: 'Customer changed their mind' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('CANCELLED');
      expect(response.body.data.cancellationReason).toBe('Customer changed their mind');
      expect(response.body.data.cancelledByName).toBe('Test Sales');
      expect(await stockOf(product.id)).toBe(20);
    });

    it('cancels a confirmed challan and returns the stock with an IN movement', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 20 });
      const challan = await createChallan({
        customerId,
        items: [{ productId: product.id, quantity: 5 }],
        status: 'CONFIRMED',
      });
      expect(await stockOf(product.id)).toBe(15);

      const response = await request
        .post(`${BASE}/challans/${challan.body.data.id}/cancel`)
        .set(authHeader(salesToken))
        .send({ reason: 'Returned undelivered' });

      expect(response.status).toBe(200);
      expect(await stockOf(product.id)).toBe(20);

      const movements = await request
        .get(`${BASE}/stock/movements?productId=${product.id}&limit=10`)
        .set(authHeader(warehouseToken));
      expect(movements.body.data[0]).toMatchObject({
        movementType: 'IN',
        quantity: 5,
        stockBefore: 15,
        stockAfter: 20,
        referenceType: 'CHALLAN',
      });
      expect(movements.body.data[0].reason).toContain('cancelled');
    });

    it('rejects cancelling an already-cancelled challan with 409', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 20 });
      const draft = await createChallan({ customerId, items: [{ productId: product.id, quantity: 1 }] });
      await request
        .post(`${BASE}/challans/${draft.body.data.id}/cancel`)
        .set(authHeader(salesToken))
        .send({});

      const second = await request
        .post(`${BASE}/challans/${draft.body.data.id}/cancel`)
        .set(authHeader(salesToken))
        .send({});
      expect(second.status).toBe(409);
    });

    it('refuses to confirm a cancelled challan', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 20 });
      const draft = await createChallan({ customerId, items: [{ productId: product.id, quantity: 1 }] });
      await request
        .post(`${BASE}/challans/${draft.body.data.id}/cancel`)
        .set(authHeader(salesToken))
        .send({});

      const confirm = await request
        .post(`${BASE}/challans/${draft.body.data.id}/confirm`)
        .set(authHeader(salesToken));
      expect(confirm.status).toBe(409);
      expect(await stockOf(product.id)).toBe(20);
    });
  });

  // -------------------------------------------------------------------------
  describe('Editing', () => {
    it('edits a draft and recalculates the totals', async () => {
      const a = await createProduct(warehouseToken, { currentStock: 50, unitPrice: 100 });
      const b = await createProduct(warehouseToken, { currentStock: 50, unitPrice: 50 });
      const draft = await createChallan({ customerId, items: [{ productId: a.id, quantity: 2 }] });

      const response = await request
        .patch(`${BASE}/challans/${draft.body.data.id}`)
        .set(authHeader(salesToken))
        .send({
          items: [
            { productId: a.id, quantity: 3 },
            { productId: b.id, quantity: 4 },
          ],
          notes: 'Revised order',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.totalQuantity).toBe(7);
      expect(response.body.data.totalAmount).toBe(500); // 300 + 200
      expect(response.body.data.notes).toBe('Revised order');
      expect(response.body.data.items).toHaveLength(2);
    });

    it('refuses to edit a confirmed challan with 409', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 20 });
      const challan = await createChallan({
        customerId,
        items: [{ productId: product.id, quantity: 2 }],
        status: 'CONFIRMED',
      });

      const response = await request
        .patch(`${BASE}/challans/${challan.body.data.id}`)
        .set(authHeader(salesToken))
        .send({ notes: 'too late' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('refuses to edit a cancelled challan with 409', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 20 });
      const draft = await createChallan({ customerId, items: [{ productId: product.id, quantity: 1 }] });
      await request
        .post(`${BASE}/challans/${draft.body.data.id}/cancel`)
        .set(authHeader(salesToken))
        .send({});

      const response = await request
        .patch(`${BASE}/challans/${draft.body.data.id}`)
        .set(authHeader(salesToken))
        .send({ notes: 'nope' });
      expect(response.status).toBe(409);
    });
  });

  // -------------------------------------------------------------------------
  describe('Listing and retrieval', () => {
    it('paginates and returns per-row summary fields', async () => {
      const response = await request.get(`${BASE}/challans?page=1&limit=5`).set(authHeader(salesToken));
      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBeGreaterThan(0);
      expect(response.body.data[0]).toHaveProperty('challanNumber');
      expect(response.body.data[0]).toHaveProperty('itemCount');
      expect(response.body.data[0].customer.name).toBeTruthy();
    });

    it('filters by status and by customer', async () => {
      const byStatus = await request
        .get(`${BASE}/challans?status=CONFIRMED&limit=100`)
        .set(authHeader(salesToken));
      expect(byStatus.body.data.every((c: { status: string }) => c.status === 'CONFIRMED')).toBe(true);

      const byCustomer = await request
        .get(`${BASE}/challans?customerId=${customerId}&limit=100`)
        .set(authHeader(salesToken));
      expect(byCustomer.body.data.every((c: { customerId: string }) => c.customerId === customerId)).toBe(true);
    });

    it('searches by challan number', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 10 });
      const created = await createChallan({ customerId, items: [{ productId: product.id, quantity: 1 }] });
      const number = created.body.data.challanNumber;

      const response = await request
        .get(`${BASE}/challans?search=${number}`)
        .set(authHeader(salesToken));
      expect(response.body.meta.total).toBe(1);
      expect(response.body.data[0].challanNumber).toBe(number);
    });

    it('rejects an invalid status filter with 400', async () => {
      const response = await request.get(`${BASE}/challans?status=PENDING`).set(authHeader(salesToken));
      expect(response.status).toBe(400);
    });

    it('returns the detail with items, and 404 for an unknown id', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 10 });
      const created = await createChallan({ customerId, items: [{ productId: product.id, quantity: 2 }] });

      const detail = await request
        .get(`${BASE}/challans/${created.body.data.id}`)
        .set(authHeader(salesToken));
      expect(detail.status).toBe(200);
      expect(detail.body.data.items).toHaveLength(1);

      const unknown = await request
        .get(`${BASE}/challans/11111111-1111-1111-1111-111111111111`)
        .set(authHeader(salesToken));
      expect(unknown.status).toBe(404);
    });
  });
});
