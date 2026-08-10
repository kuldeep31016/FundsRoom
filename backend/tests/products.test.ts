import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BASE,
  authHeader,
  createProduct,
  ensureTestUsers,
  loginAs,
  request,
  resetBusinessData,
} from './helpers/test-app';
import { closePool } from '../src/db/pool';

let warehouseToken: string;
let salesToken: string;

describe('Product module', () => {
  beforeAll(async () => {
    await ensureTestUsers();
    await resetBusinessData();
    warehouseToken = await loginAs('WAREHOUSE');
    salesToken = await loginAs('SALES');
  });

  afterAll(async () => {
    await closePool();
  });

  describe('POST /products', () => {
    it('creates a product with all specified fields and returns 201', async () => {
      const response = await request
        .post(`${BASE}/products`)
        .set(authHeader(warehouseToken))
        .send({
          name: 'Premium Steel Bucket 15L',
          sku: 'HW-BUCKET-15',
          category: 'Hardware',
          unitPrice: 249.5,
          currentStock: 80,
          minStockAlert: 20,
          location: 'Warehouse D - Rack 7',
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        name: 'Premium Steel Bucket 15L',
        sku: 'HW-BUCKET-15',
        category: 'Hardware',
        unitPrice: 249.5,
        currentStock: 80,
        minStockAlert: 20,
        location: 'Warehouse D - Rack 7',
        isActive: true,
        isLowStock: false,
      });
    });

    it('records the opening stock as an auditable IN movement', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 55 });
      const history = await request
        .get(`${BASE}/products/${product.id}/stock-movements`)
        .set(authHeader(warehouseToken));

      expect(history.status).toBe(200);
      expect(history.body.meta.total).toBe(1);
      expect(history.body.data[0]).toMatchObject({
        movementType: 'IN',
        quantity: 55,
        quantityChange: 55,
        stockBefore: 0,
        stockAfter: 55,
        reason: 'Opening stock',
        referenceType: 'PRODUCT_OPENING',
      });
    });

    it('creates no movement when opening stock is zero', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 0 });
      const history = await request
        .get(`${BASE}/products/${product.id}/stock-movements`)
        .set(authHeader(warehouseToken));
      expect(history.body.meta.total).toBe(0);
      expect(product.currentStock).toBe(0);
    });

    it('upper-cases the SKU', async () => {
      const response = await request
        .post(`${BASE}/products`)
        .set(authHeader(warehouseToken))
        .send({ name: 'Lowercase SKU', sku: 'low-case-01', category: 'Misc', unitPrice: 10 });
      expect(response.status).toBe(201);
      expect(response.body.data.sku).toBe('LOW-CASE-01');
    });

    it('returns 409 for a duplicate SKU', async () => {
      await request
        .post(`${BASE}/products`)
        .set(authHeader(warehouseToken))
        .send({ name: 'First', sku: 'DUP-SKU-01', category: 'Misc', unitPrice: 10 });

      const response = await request
        .post(`${BASE}/products`)
        .set(authHeader(warehouseToken))
        .send({ name: 'Second', sku: 'DUP-SKU-01', category: 'Misc', unitPrice: 12 });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('DUPLICATE_SKU');
    });

    it('treats a differently-cased SKU as a duplicate', async () => {
      await request
        .post(`${BASE}/products`)
        .set(authHeader(warehouseToken))
        .send({ name: 'Case A', sku: 'CASE-DUP-1', category: 'Misc', unitPrice: 10 });
      const response = await request
        .post(`${BASE}/products`)
        .set(authHeader(warehouseToken))
        .send({ name: 'Case B', sku: 'case-dup-1', category: 'Misc', unitPrice: 10 });
      expect(response.status).toBe(409);
    });

    it('rejects a negative price and a negative stock with 400', async () => {
      const negativePrice = await request
        .post(`${BASE}/products`)
        .set(authHeader(warehouseToken))
        .send({ name: 'Neg Price', sku: 'NEG-PRICE', category: 'Misc', unitPrice: -5 });
      expect(negativePrice.status).toBe(400);

      const negativeStock = await request
        .post(`${BASE}/products`)
        .set(authHeader(warehouseToken))
        .send({ name: 'Neg Stock', sku: 'NEG-STOCK', category: 'Misc', unitPrice: 5, currentStock: -3 });
      expect(negativeStock.status).toBe(400);
    });

    it('rejects a non-numeric price and a fractional stock with 400', async () => {
      const badPrice = await request
        .post(`${BASE}/products`)
        .set(authHeader(warehouseToken))
        .send({ name: 'Bad Price', sku: 'BAD-PRICE', category: 'Misc', unitPrice: 'free' });
      expect(badPrice.status).toBe(400);

      const fractional = await request
        .post(`${BASE}/products`)
        .set(authHeader(warehouseToken))
        .send({ name: 'Frac', sku: 'FRAC-1', category: 'Misc', unitPrice: 10, currentStock: 2.5 });
      expect(fractional.status).toBe(400);
    });

    it('rejects missing required fields and an invalid SKU format with 400', async () => {
      const missing = await request
        .post(`${BASE}/products`)
        .set(authHeader(warehouseToken))
        .send({ name: 'No SKU', category: 'Misc', unitPrice: 10 });
      expect(missing.status).toBe(400);

      const badSku = await request
        .post(`${BASE}/products`)
        .set(authHeader(warehouseToken))
        .send({ name: 'Bad SKU', sku: 'has spaces!', category: 'Misc', unitPrice: 10 });
      expect(badSku.status).toBe(400);
    });
  });

  describe('GET /products', () => {
    it('paginates with full metadata', async () => {
      const response = await request.get(`${BASE}/products?page=1&limit=3`).set(authHeader(salesToken));
      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeLessThanOrEqual(3);
      expect(response.body.meta).toMatchObject({ page: 1, limit: 3, hasPrev: false });
    });

    it('searches by name, SKU and category', async () => {
      await createProduct(warehouseToken, {
        name: 'Xylophone Cleaner Special',
        sku: 'XYL-9001',
        category: 'Novelty',
      });

      for (const term of ['Xylophone', 'XYL-9001', 'Novelty']) {
        const response = await request
          .get(`${BASE}/products?search=${encodeURIComponent(term)}`)
          .set(authHeader(salesToken));
        expect(response.body.meta.total, `search term ${term}`).toBe(1);
      }
    });

    it('filters to low-stock products only', async () => {
      await createProduct(warehouseToken, { name: 'Low One', currentStock: 2, minStockAlert: 10 });
      const response = await request.get(`${BASE}/products?lowStock=true`).set(authHeader(salesToken));

      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBeGreaterThan(0);
      for (const product of response.body.data) {
        expect(product.currentStock).toBeLessThanOrEqual(product.minStockAlert);
        expect(product.isLowStock).toBe(true);
      }
    });

    it('flags isLowStock exactly at the alert threshold', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 10, minStockAlert: 10 });
      const response = await request.get(`${BASE}/products/${product.id}`).set(authHeader(salesToken));
      expect(response.body.data.isLowStock).toBe(true);
    });

    it('sorts by unit price ascending', async () => {
      const response = await request
        .get(`${BASE}/products?sortBy=unitPrice&sortOrder=asc&limit=100`)
        .set(authHeader(salesToken));
      const prices = response.body.data.map((p: { unitPrice: number }) => p.unitPrice);
      expect([...prices].sort((a: number, b: number) => a - b)).toEqual(prices);
    });

    it('lists distinct categories', async () => {
      const response = await request.get(`${BASE}/products/categories`).set(authHeader(salesToken));
      expect(response.status).toBe(200);
      expect(response.body.data).toContain('Hardware');
      expect(new Set(response.body.data).size).toBe(response.body.data.length);
    });
  });

  describe('GET /products/:id', () => {
    it('returns the product', async () => {
      const product = await createProduct(warehouseToken, { name: 'Detail Product' });
      const response = await request.get(`${BASE}/products/${product.id}`).set(authHeader(salesToken));
      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Detail Product');
      expect(response.body.data.stockValue).toBeGreaterThan(0);
    });

    it('returns 404 for an unknown id and 400 for a malformed id', async () => {
      const notFound = await request
        .get(`${BASE}/products/11111111-1111-1111-1111-111111111111`)
        .set(authHeader(salesToken));
      expect(notFound.status).toBe(404);

      const badId = await request.get(`${BASE}/products/abc`).set(authHeader(salesToken));
      expect(badId.status).toBe(400);
    });
  });

  describe('PATCH /products/:id', () => {
    it('updates the supplied fields', async () => {
      const product = await createProduct(warehouseToken, { name: 'Editable', unitPrice: 100 });
      const response = await request
        .patch(`${BASE}/products/${product.id}`)
        .set(authHeader(warehouseToken))
        .send({ name: 'Edited Name', unitPrice: 175.25, minStockAlert: 12 });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        name: 'Edited Name',
        unitPrice: 175.25,
        minStockAlert: 12,
      });
    });

    it('refuses to change stock directly', async () => {
      const product = await createProduct(warehouseToken, { currentStock: 30 });
      const response = await request
        .patch(`${BASE}/products/${product.id}`)
        .set(authHeader(warehouseToken))
        .send({ currentStock: 9999 });

      expect(response.status).toBe(400);
      const stillThere = await request
        .get(`${BASE}/products/${product.id}`)
        .set(authHeader(warehouseToken));
      expect(stillThere.body.data.currentStock).toBe(30);
    });

    it('returns 409 when renaming to an SKU owned by another product', async () => {
      await createProduct(warehouseToken, { sku: 'TAKEN-SKU-1' });
      const other = await createProduct(warehouseToken, { sku: 'FREE-SKU-1' });

      const response = await request
        .patch(`${BASE}/products/${other.id}`)
        .set(authHeader(warehouseToken))
        .send({ sku: 'TAKEN-SKU-1' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('DUPLICATE_SKU');
    });

    it('allows a product to keep its own SKU', async () => {
      const product = await createProduct(warehouseToken, { sku: 'SELF-SKU-1' });
      const response = await request
        .patch(`${BASE}/products/${product.id}`)
        .set(authHeader(warehouseToken))
        .send({ sku: 'SELF-SKU-1', name: 'Renamed Only' });
      expect(response.status).toBe(200);
    });

    it('returns 404 for an unknown product and 400 for an empty patch', async () => {
      const notFound = await request
        .patch(`${BASE}/products/11111111-1111-1111-1111-111111111111`)
        .set(authHeader(warehouseToken))
        .send({ name: 'ghost' });
      expect(notFound.status).toBe(404);

      const product = await createProduct(warehouseToken);
      const empty = await request
        .patch(`${BASE}/products/${product.id}`)
        .set(authHeader(warehouseToken))
        .send({});
      expect(empty.status).toBe(400);
    });
  });
});
