import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BASE,
  authHeader,
  createProduct,
  ensureTestUsers,
  loginAs,
  request,
  resetBusinessData,
  stockOf,
} from './helpers/test-app';
import { closePool } from '../src/db/pool';

let warehouseToken: string;
let accountsToken: string;

describe('Inventory / stock movement module', () => {
  beforeAll(async () => {
    await ensureTestUsers();
    await resetBusinessData();
    warehouseToken = await loginAs('WAREHOUSE');
    accountsToken = await loginAs('ACCOUNTS');
  });

  afterAll(async () => {
    await closePool();
  });

  describe('POST /stock/movements — IN', () => {
    it('increases stock and writes a complete audit row', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 40 });

      const response = await request
        .post(`${BASE}/stock/movements`)
        .set(authHeader(warehouseToken))
        .send({
          productId: product.id,
          movementType: 'IN',
          quantity: 25,
          reason: 'Purchase order PO-1042 received',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.currentStock).toBe(65);
      expect(response.body.data.movement).toMatchObject({
        productId: product.id,
        movementType: 'IN',
        quantity: 25,
        quantityChange: 25,
        stockBefore: 40,
        stockAfter: 65,
        reason: 'Purchase order PO-1042 received',
        referenceType: 'MANUAL',
      });
      // Every field the specification requires on the movement log.
      expect(response.body.data.movement.createdBy).toBeTruthy();
      expect(response.body.data.movement.createdByName).toBe('Test Warehouse');
      expect(response.body.data.movement.createdAt).toBeTruthy();
      expect(await stockOf(product.id)).toBe(65);
    });
  });

  describe('POST /stock/movements — OUT', () => {
    it('decreases stock and records a negative quantityChange', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 40 });

      const response = await request
        .post(`${BASE}/stock/movements`)
        .set(authHeader(warehouseToken))
        .send({ productId: product.id, movementType: 'OUT', quantity: 15, reason: 'Damaged in transit' });

      expect(response.status).toBe(201);
      expect(response.body.data.movement).toMatchObject({
        movementType: 'OUT',
        quantity: 15,
        quantityChange: -15,
        stockBefore: 40,
        stockAfter: 25,
      });
      expect(await stockOf(product.id)).toBe(25);
    });

    it('allows an OUT movement that takes stock to exactly zero', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 8 });
      const response = await request
        .post(`${BASE}/stock/movements`)
        .set(authHeader(warehouseToken))
        .send({ productId: product.id, movementType: 'OUT', quantity: 8, reason: 'Full clearance' });

      expect(response.status).toBe(201);
      expect(await stockOf(product.id)).toBe(0);
    });

    it('rejects an OUT movement that exceeds stock with 409 and leaves stock untouched', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 10 });

      const response = await request
        .post(`${BASE}/stock/movements`)
        .set(authHeader(warehouseToken))
        .send({ productId: product.id, movementType: 'OUT', quantity: 11, reason: 'Over-issue attempt' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(response.body.error.meta).toMatchObject({ availableStock: 10, requestedQuantity: 11 });
      // Nothing changed, and no ledger row was written.
      expect(await stockOf(product.id)).toBe(10);

      const history = await request
        .get(`${BASE}/stock/movements?productId=${product.id}`)
        .set(authHeader(warehouseToken));
      expect(history.body.meta.total).toBe(1); // opening stock only
    });
  });

  describe('Validation', () => {
    it('rejects zero, negative, fractional and non-numeric quantities with 400', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 10 });
      const cases = [0, -5, 2.5, 'five'];

      for (const quantity of cases) {
        const response = await request
          .post(`${BASE}/stock/movements`)
          .set(authHeader(warehouseToken))
          .send({ productId: product.id, movementType: 'IN', quantity, reason: 'test' });
        expect(response.status, `quantity=${quantity}`).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects an invalid movement type with 400', async () => {
      const product = await createProduct(warehouseToken);
      const response = await request
        .post(`${BASE}/stock/movements`)
        .set(authHeader(warehouseToken))
        .send({ productId: product.id, movementType: 'TRANSFER', quantity: 1, reason: 'test' });

      expect(response.status).toBe(400);
      expect(response.body.error.details[0].message).toContain('IN, OUT');
    });

    it('rejects a missing reason with 400', async () => {
      const product = await createProduct(warehouseToken);
      const response = await request
        .post(`${BASE}/stock/movements`)
        .set(authHeader(warehouseToken))
        .send({ productId: product.id, movementType: 'IN', quantity: 1 });
      expect(response.status).toBe(400);
    });

    it('rejects a malformed product id with 400', async () => {
      const response = await request
        .post(`${BASE}/stock/movements`)
        .set(authHeader(warehouseToken))
        .send({ productId: 'not-a-uuid', movementType: 'IN', quantity: 1, reason: 'test' });
      expect(response.status).toBe(400);
    });

    it('returns 404 for a movement against an unknown product', async () => {
      const response = await request
        .post(`${BASE}/stock/movements`)
        .set(authHeader(warehouseToken))
        .send({
          productId: '11111111-1111-1111-1111-111111111111',
          movementType: 'IN',
          quantity: 1,
          reason: 'ghost product',
        });
      expect(response.status).toBe(404);
    });
  });

  describe('GET /stock/movements', () => {
    it('returns a paginated, newest-first history', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 100 });
      await request
        .post(`${BASE}/stock/movements`)
        .set(authHeader(warehouseToken))
        .send({ productId: product.id, movementType: 'IN', quantity: 5, reason: 'restock A' });
      await request
        .post(`${BASE}/stock/movements`)
        .set(authHeader(warehouseToken))
        .send({ productId: product.id, movementType: 'OUT', quantity: 3, reason: 'sample issue' });

      const response = await request
        .get(`${BASE}/stock/movements?productId=${product.id}&limit=10`)
        .set(authHeader(warehouseToken));

      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(3);
      expect(response.body.data[0].reason).toBe('sample issue');
      expect(response.body.data[0].productName).toBeTruthy();
      expect(response.body.data[0].productSku).toBeTruthy();
    });

    it('filters by movement type', async () => {
      const response = await request
        .get(`${BASE}/stock/movements?movementType=OUT&limit=100`)
        .set(authHeader(warehouseToken));
      expect(response.status).toBe(200);
      expect(response.body.data.every((m: { movementType: string }) => m.movementType === 'OUT')).toBe(true);
    });

    it('filters by reference type', async () => {
      const response = await request
        .get(`${BASE}/stock/movements?referenceType=PRODUCT_OPENING&limit=100`)
        .set(authHeader(warehouseToken));
      expect(response.status).toBe(200);
      expect(
        response.body.data.every((m: { referenceType: string }) => m.referenceType === 'PRODUCT_OPENING'),
      ).toBe(true);
    });

    it('filters by date range and rejects an inverted range', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const ok = await request
        .get(`${BASE}/stock/movements?from=${today}&to=${today}`)
        .set(authHeader(warehouseToken));
      expect(ok.status).toBe(200);
      expect(ok.body.meta.total).toBeGreaterThan(0);

      const inverted = await request
        .get(`${BASE}/stock/movements?from=2026-12-31&to=2026-01-01`)
        .set(authHeader(warehouseToken));
      expect(inverted.status).toBe(400);
    });

    it('rejects an invalid movementType filter with 400', async () => {
      const response = await request
        .get(`${BASE}/stock/movements?movementType=SIDEWAYS`)
        .set(authHeader(warehouseToken));
      expect(response.status).toBe(400);
    });

    it('allows a read-only role to view history but not to post a movement', async () => {
      const product = await createProduct(warehouseToken);

      const read = await request.get(`${BASE}/stock/movements`).set(authHeader(accountsToken));
      expect(read.status).toBe(200);

      const write = await request
        .post(`${BASE}/stock/movements`)
        .set(authHeader(accountsToken))
        .send({ productId: product.id, movementType: 'IN', quantity: 1, reason: 'should fail' });
      expect(write.status).toBe(403);
    });
  });

  describe('Ledger integrity', () => {
    it('the sum of signed movements always equals current stock', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 50 });
      const operations: Array<['IN' | 'OUT', number]> = [
        ['IN', 20],
        ['OUT', 35],
        ['IN', 5],
        ['OUT', 10],
      ];
      for (const [movementType, quantity] of operations) {
        const response = await request
          .post(`${BASE}/stock/movements`)
          .set(authHeader(warehouseToken))
          .send({ productId: product.id, movementType, quantity, reason: 'ledger check' });
        expect(response.status).toBe(201);
      }

      const history = await request
        .get(`${BASE}/stock/movements?productId=${product.id}&limit=100`)
        .set(authHeader(warehouseToken));
      const ledgerSum = history.body.data.reduce(
        (sum: number, m: { quantityChange: number }) => sum + m.quantityChange,
        0,
      );

      expect(ledgerSum).toBe(30); // 50 + 20 - 35 + 5 - 10
      expect(await stockOf(product.id)).toBe(30);
    });
  });
});
