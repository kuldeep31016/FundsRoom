import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  BASE,
  authHeader,
  createCustomer,
  createProduct,
  ensureTestUsers,
  loginAs,
  request,
  resetBusinessData,
} from './helpers/test-app';
import { closePool, pool } from '../src/db/pool';
import { errorHandler } from '../src/middleware/error.middleware';
import { ApiError } from '../src/utils/api-error';

/** Minimal Express req/res doubles for exercising the error middleware directly. */
function fakeRequest(): Request {
  return {
    method: 'POST',
    originalUrl: '/api/v1/test',
    requestId: 'test-request-id',
  } as unknown as Request;
}

function fakeResponse(): Response & { statusCode: number; body: Record<string, unknown> } {
  const res = {
    statusCode: 0,
    body: {} as Record<string, unknown>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: Record<string, unknown>) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: Record<string, unknown> };
}

function runErrorHandler(error: unknown) {
  const res = fakeResponse();
  errorHandler(error, fakeRequest(), res, (() => undefined) as NextFunction);
  return res;
}

// One pool lifecycle for the whole file — closing it per describe would end the
// shared pool before later suites run.
beforeAll(async () => {
  await ensureTestUsers();
});

afterAll(async () => {
  await closePool();
});

describe('Centralised error handling', () => {
  describe('Database error translation', () => {
    it('maps a unique violation on products.sku to 409 DUPLICATE_SKU', () => {
      const pgError = Object.assign(new Error('duplicate key value'), {
        code: '23505',
        constraint: 'products_sku_key',
      });
      const res = runErrorHandler(pgError);
      expect(res.statusCode).toBe(409);
      expect((res.body.error as { code: string }).code).toBe('DUPLICATE_SKU');
    });

    it('maps a unique violation on users.email to 409 DUPLICATE_EMAIL', () => {
      const pgError = Object.assign(new Error('duplicate key value'), {
        code: '23505',
        constraint: 'users_email_lower_key',
      });
      const res = runErrorHandler(pgError);
      expect(res.statusCode).toBe(409);
      expect((res.body.error as { code: string }).code).toBe('DUPLICATE_EMAIL');
    });

    it('maps the current_stock check violation to 409 INSUFFICIENT_STOCK', () => {
      const pgError = Object.assign(new Error('check constraint violated'), {
        code: '23514',
        constraint: 'products_current_stock_check',
      });
      const res = runErrorHandler(pgError);
      expect(res.statusCode).toBe(409);
      expect((res.body.error as { code: string }).code).toBe('INSUFFICIENT_STOCK');
    });

    it('maps a foreign key violation to 400', () => {
      const pgError = Object.assign(new Error('fk violation'), {
        code: '23503',
        constraint: 'challans_customer_id_fkey',
      });
      expect(runErrorHandler(pgError).statusCode).toBe(400);
    });

    it('maps an invalid text representation to 400', () => {
      const pgError = Object.assign(new Error('invalid input syntax'), { code: '22P02' });
      expect(runErrorHandler(pgError).statusCode).toBe(400);
    });

    it('turns an unrecognised database failure into a 500 that leaks nothing', () => {
      const pgError = Object.assign(
        new Error('connection to server at "10.0.0.4", port 5432 failed: password authentication failed for user "erp_prod"'),
        { code: '08006' },
      );
      const res = runErrorHandler(pgError);

      expect(res.statusCode).toBe(500);
      const body = res.body.error as { code: string; message: string };
      expect(body.code).toBe('INTERNAL_ERROR');
      expect(body.message).toBe('An unexpected error occurred.');
      // The original message contained a host, a port and a database username.
      expect(JSON.stringify(res.body)).not.toContain('password authentication');
      expect(JSON.stringify(res.body)).not.toContain('erp_prod');
      expect(JSON.stringify(res.body)).not.toContain('10.0.0.4');
    });
  });

  describe('Generic errors', () => {
    it('turns an unexpected JS error into a safe 500', () => {
      const res = runErrorHandler(new TypeError("Cannot read properties of undefined (reading 'secret')"));
      expect(res.statusCode).toBe(500);
      const body = res.body.error as { code: string; message: string };
      expect(body.code).toBe('INTERNAL_ERROR');
      expect(body.message).toBe('An unexpected error occurred.');
    });

    it('preserves an explicit ApiError verbatim', () => {
      const res = runErrorHandler(ApiError.notFound('Widget'));
      expect(res.statusCode).toBe(404);
      expect((res.body.error as { message: string }).message).toBe('Widget not found.');
    });

    it('always includes the requestId for correlation', () => {
      const res = runErrorHandler(ApiError.forbidden());
      expect(res.body.requestId).toBe('test-request-id');
    });
  });
});

describe('Dashboard summary', () => {
  let adminToken: string;

  beforeAll(async () => {
    await resetBusinessData();
    adminToken = await loginAs('ADMIN');

    const customer = await createCustomer(adminToken, {
      name: 'Dashboard Customer',
      mobile: '9800000200',
      status: 'ACTIVE',
    });
    const healthy = await createProduct(adminToken, { currentStock: 100, minStockAlert: 10, unitPrice: 50 });
    await createProduct(adminToken, { currentStock: 2, minStockAlert: 20, unitPrice: 10 });

    await request
      .post(`${BASE}/challans`)
      .set(authHeader(adminToken))
      .send({ customerId: customer.id, items: [{ productId: healthy.id, quantity: 4 }], status: 'CONFIRMED' });
    await request
      .post(`${BASE}/challans`)
      .set(authHeader(adminToken))
      .send({ customerId: customer.id, items: [{ productId: healthy.id, quantity: 2 }], status: 'DRAFT' });
  });

  it('aggregates customers, products and challans in a single call', async () => {
    const response = await request.get(`${BASE}/dashboard/summary`).set(authHeader(adminToken));

    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.customers.total).toBe(1);
    expect(data.customers.active).toBe(1);
    expect(data.products.total).toBe(2);
    expect(data.products.lowStock).toBe(1);
    expect(data.challans.total).toBe(2);
    expect(data.challans.confirmed).toBe(1);
    expect(data.challans.draft).toBe(1);
    expect(data.challans.confirmedQuantity).toBe(4);
    expect(data.challans.confirmedAmount).toBe(200);
  });

  it('returns the low-stock watchlist and recent challans', async () => {
    const response = await request.get(`${BASE}/dashboard/summary`).set(authHeader(adminToken));
    expect(response.body.data.lowStockProducts).toHaveLength(1);
    expect(response.body.data.lowStockProducts[0].isLowStock).toBe(true);
    expect(response.body.data.recentChallans.length).toBe(2);
    expect(response.body.data.recentChallans[0].challanNumber).toBeTruthy();
  });

  it('reports the total inventory valuation', async () => {
    const response = await request.get(`${BASE}/dashboard/summary`).set(authHeader(adminToken));
    // 96 units @ 50 (4 dispatched) + 2 units @ 10
    expect(response.body.data.products.stockValue).toBe(4820);
  });
});

describe('Data integrity invariants', () => {
  it('the database itself refuses negative stock', async () => {
    await expect(
      pool.query("UPDATE products SET current_stock = -1 WHERE id = (SELECT id FROM products LIMIT 1)"),
    ).rejects.toThrow(/current_stock/);
  });

  it('the database itself refuses a zero or negative challan line quantity', async () => {
    await expect(
      pool.query(
        `INSERT INTO challan_items (challan_id, product_id, product_name, product_sku, unit_price, quantity)
         SELECT c.id, p.id, p.name, p.sku, p.unit_price, 0
           FROM challans c, products p LIMIT 1`,
      ),
    ).rejects.toThrow(/quantity/);
  });

  it('the database itself refuses a duplicate challan number', async () => {
    await expect(
      pool.query(
        `INSERT INTO challans (challan_number, customer_id, created_by)
         SELECT c.challan_number, c.customer_id, c.created_by FROM challans c LIMIT 1`,
      ),
    ).rejects.toThrow(/challan_number/);
  });
});
