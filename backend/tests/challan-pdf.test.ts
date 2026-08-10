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
} from './helpers/test-app';
import { closePool } from '../src/db/pool';

let salesToken: string;
let warehouseToken: string;
let accountsToken: string;
let customerId: string;
let challanId: string;
let challanNumber: string;

/** A PDF file always begins with "%PDF-" and ends with an "%%EOF" marker. */
function isPdf(body: Buffer): boolean {
  return body.subarray(0, 5).toString('latin1') === '%PDF-';
}

function isComplete(body: Buffer): boolean {
  return body.subarray(-1024).toString('latin1').includes('%%EOF');
}

describe('Challan PDF export', () => {
  beforeAll(async () => {
    await ensureTestUsers();
    await resetBusinessData();
    salesToken = await loginAs('SALES');
    warehouseToken = await loginAs('WAREHOUSE');
    accountsToken = await loginAs('ACCOUNTS');

    const customer = await createCustomer(salesToken, {
      name: 'PDF Test Customer',
      mobile: '9800000300',
      businessName: 'PDF Traders',
      gstNumber: '27AAPFU0939F1ZV',
    });
    customerId = customer.id as string;

    const productA = await createProduct(warehouseToken, {
      name: 'PDF Widget A',
      currentStock: 100,
      unitPrice: 249.5,
      location: 'Warehouse D - Rack 7',
    });
    const productB = await createProduct(warehouseToken, {
      name: 'PDF Widget B',
      currentStock: 100,
      unitPrice: 1200,
    });

    const created = await request
      .post(`${BASE}/challans`)
      .set(authHeader(salesToken))
      .send({
        customerId,
        items: [
          { productId: productA.id, quantity: 4 },
          { productId: productB.id, quantity: 2 },
        ],
        notes: 'Deliver before noon.',
      });
    challanId = created.body.data.id;
    challanNumber = created.body.data.challanNumber;
  });

  afterAll(async () => {
    await closePool();
  });

  it('returns a well-formed PDF for a draft challan', async () => {
    const response = await request
      .get(`${BASE}/challans/${challanId}/pdf`)
      .set(authHeader(salesToken))
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(isPdf(response.body)).toBe(true);
    expect(isComplete(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(1000);
  });

  it('sends the challan number as the download filename', async () => {
    const response = await request
      .get(`${BASE}/challans/${challanId}/pdf`)
      .set(authHeader(salesToken));

    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="${challanNumber}.pdf"`,
    );
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('declares an accurate Content-Length', async () => {
    const response = await request
      .get(`${BASE}/challans/${challanId}/pdf`)
      .set(authHeader(salesToken))
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(Number(response.headers['content-length'])).toBe(response.body.length);
  });

  it('still renders after the challan is confirmed', async () => {
    const confirmed = await request
      .post(`${BASE}/challans/${challanId}/confirm`)
      .set(authHeader(salesToken));
    expect(confirmed.status).toBe(200);

    const response = await request
      .get(`${BASE}/challans/${challanId}/pdf`)
      .set(authHeader(salesToken))
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(isPdf(response.body)).toBe(true);
    expect(isComplete(response.body)).toBe(true);
  });

  it('still renders after the challan is cancelled', async () => {
    const cancelled = await request
      .post(`${BASE}/challans/${challanId}/cancel`)
      .set(authHeader(salesToken))
      .send({ reason: 'Customer refused delivery' });
    expect(cancelled.status).toBe(200);

    const response = await request
      .get(`${BASE}/challans/${challanId}/pdf`)
      .set(authHeader(salesToken))
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(isPdf(response.body)).toBe(true);
  });

  it('renders a multi-page document for a large challan', async () => {
    // 40 lines comfortably overflows one A4 page, exercising the pagination path.
    const products = [];
    for (let index = 0; index < 40; index += 1) {
      products.push(await createProduct(warehouseToken, { currentStock: 50, unitPrice: 99.99 }));
    }

    const created = await request
      .post(`${BASE}/challans`)
      .set(authHeader(salesToken))
      .send({
        customerId,
        items: products.map((product) => ({ productId: product.id, quantity: 2 })),
      });
    expect(created.status).toBe(201);
    expect(created.body.data.items).toHaveLength(40);

    const response = await request
      .get(`${BASE}/challans/${created.body.data.id}/pdf`)
      .set(authHeader(salesToken))
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(isPdf(response.body)).toBe(true);
    expect(isComplete(response.body)).toBe(true);
    // More than one "/Type /Page" object means the document actually paginated.
    const pageCount = (response.body.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pageCount).toBeGreaterThan(1);
  });

  describe('Access control', () => {
    it('allows every role with challans:read to download', async () => {
      for (const [role, token] of [
        ['SALES', salesToken],
        ['WAREHOUSE', warehouseToken],
        ['ACCOUNTS', accountsToken],
      ] as const) {
        const response = await request
          .get(`${BASE}/challans/${challanId}/pdf`)
          .set(authHeader(token));
        expect(response.status, `role ${role}`).toBe(200);
      }
    });

    it('returns 401 without a token', async () => {
      const response = await request.get(`${BASE}/challans/${challanId}/pdf`);
      expect(response.status).toBe(401);
    });

    it('returns 404 for an unknown challan, as JSON not PDF', async () => {
      const response = await request
        .get(`${BASE}/challans/11111111-1111-1111-1111-111111111111/pdf`)
        .set(authHeader(salesToken));

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for a malformed challan id', async () => {
      const response = await request
        .get(`${BASE}/challans/not-a-uuid/pdf`)
        .set(authHeader(salesToken));
      expect(response.status).toBe(400);
    });
  });
});
