import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BASE,
  authHeader,
  createCustomer,
  ensureTestUsers,
  loginAs,
  request,
  resetBusinessData,
} from './helpers/test-app';
import { closePool } from '../src/db/pool';

let salesToken: string;
let accountsToken: string;

describe('Customer CRM module', () => {
  beforeAll(async () => {
    await ensureTestUsers();
    await resetBusinessData();
    salesToken = await loginAs('SALES');
    accountsToken = await loginAs('ACCOUNTS');
  });

  afterAll(async () => {
    await closePool();
  });

  describe('POST /customers', () => {
    it('creates a customer with every specified field and returns 201', async () => {
      const response = await request
        .post(`${BASE}/customers`)
        .set(authHeader(salesToken))
        .send({
          name: 'Ravi Menon',
          mobile: '9876500001',
          email: 'ravi@menonstores.test',
          businessName: 'Menon Stores',
          gstNumber: '27AAPFU0939F1ZV',
          customerType: 'WHOLESALE',
          address: '12 Link Road, Mumbai',
          status: 'ACTIVE',
          followUpDate: '2026-12-31',
          notes: 'Prefers morning calls.',
        });

      expect(response.status).toBe(201);
      const data = response.body.data;
      expect(data).toMatchObject({
        name: 'Ravi Menon',
        mobile: '9876500001',
        email: 'ravi@menonstores.test',
        businessName: 'Menon Stores',
        gstNumber: '27AAPFU0939F1ZV',
        customerType: 'WHOLESALE',
        address: '12 Link Road, Mumbai',
        status: 'ACTIVE',
        followUpDate: '2026-12-31',
        notes: 'Prefers morning calls.',
      });
      expect(data.id).toBeTruthy();
      expect(data.createdAt).toBeTruthy();
    });

    it('accepts a customer without the optional GST number', async () => {
      const response = await request
        .post(`${BASE}/customers`)
        .set(authHeader(salesToken))
        .send({ name: 'No GST Customer', mobile: '9876500002', customerType: 'RETAIL' });

      expect(response.status).toBe(201);
      expect(response.body.data.gstNumber).toBeNull();
      // Status defaults to LEAD when not supplied.
      expect(response.body.data.status).toBe('LEAD');
    });

    it('normalises a mobile number written with separators', async () => {
      const response = await request
        .post(`${BASE}/customers`)
        .set(authHeader(salesToken))
        .send({ name: 'Formatted Mobile', mobile: '+91 98765-00003', customerType: 'RETAIL' });

      expect(response.status).toBe(201);
      expect(response.body.data.mobile).toBe('919876500003');
    });

    it('rejects a missing required field with 400', async () => {
      const response = await request
        .post(`${BASE}/customers`)
        .set(authHeader(salesToken))
        .send({ mobile: '9876500004', customerType: 'RETAIL' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.some((d: { field: string }) => d.field === 'name')).toBe(true);
    });

    it('rejects an invalid customer type with 400', async () => {
      const response = await request
        .post(`${BASE}/customers`)
        .set(authHeader(salesToken))
        .send({ name: 'Bad Type', mobile: '9876500005', customerType: 'PLATINUM' });

      expect(response.status).toBe(400);
      expect(response.body.error.details[0].message).toContain('RETAIL');
    });

    it('rejects an invalid customer status with 400', async () => {
      const response = await request
        .post(`${BASE}/customers`)
        .set(authHeader(salesToken))
        .send({ name: 'Bad Status', mobile: '9876500006', customerType: 'RETAIL', status: 'ARCHIVED' });

      expect(response.status).toBe(400);
      expect(response.body.error.details[0].message).toContain('LEAD');
    });

    it('rejects an invalid mobile number and email with 400', async () => {
      const badMobile = await request
        .post(`${BASE}/customers`)
        .set(authHeader(salesToken))
        .send({ name: 'Bad Mobile', mobile: '12', customerType: 'RETAIL' });
      expect(badMobile.status).toBe(400);

      const badEmail = await request
        .post(`${BASE}/customers`)
        .set(authHeader(salesToken))
        .send({ name: 'Bad Email', mobile: '9876500007', email: 'nope', customerType: 'RETAIL' });
      expect(badEmail.status).toBe(400);
    });

    it('rejects an invalid GST number with 400', async () => {
      const response = await request
        .post(`${BASE}/customers`)
        .set(authHeader(salesToken))
        .send({ name: 'Bad GST', mobile: '9876500008', customerType: 'RETAIL', gstNumber: 'ABC123' });
      expect(response.status).toBe(400);
    });

    it('rejects unknown fields with 400', async () => {
      const response = await request
        .post(`${BASE}/customers`)
        .set(authHeader(salesToken))
        .send({ name: 'Extra', mobile: '9876500009', customerType: 'RETAIL', creditLimit: 5000 });
      expect(response.status).toBe(400);
    });

    it('returns 409 for a duplicate GST number', async () => {
      await createCustomer(salesToken, {
        name: 'GST Owner',
        mobile: '9876500010',
        gstNumber: '29AACCN1234K1Z5',
      });
      const response = await request
        .post(`${BASE}/customers`)
        .set(authHeader(salesToken))
        .send({
          name: 'GST Duplicate',
          mobile: '9876500011',
          customerType: 'RETAIL',
          gstNumber: '29AACCN1234K1Z5',
        });
      expect(response.status).toBe(409);
    });
  });

  describe('GET /customers', () => {
    it('returns a paginated envelope with complete metadata', async () => {
      const response = await request
        .get(`${BASE}/customers?page=1&limit=2`)
        .set(authHeader(salesToken));

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
      expect(response.body.meta).toMatchObject({ page: 1, limit: 2, hasPrev: false });
      expect(typeof response.body.meta.total).toBe('number');
      expect(typeof response.body.meta.totalPages).toBe('number');
      expect(typeof response.body.meta.hasNext).toBe('boolean');
    });

    it('returns different records on page 2', async () => {
      const page1 = await request.get(`${BASE}/customers?page=1&limit=1`).set(authHeader(salesToken));
      const page2 = await request.get(`${BASE}/customers?page=2&limit=1`).set(authHeader(salesToken));

      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);
      expect(page2.body.meta.hasPrev).toBe(true);
      expect(page1.body.data[0].id).not.toBe(page2.body.data[0].id);
    });

    it('searches by name on the server', async () => {
      await createCustomer(salesToken, { name: 'Zenith Unique Trading', mobile: '9876500020' });
      const response = await request
        .get(`${BASE}/customers?search=Zenith Unique`)
        .set(authHeader(salesToken));

      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(1);
      expect(response.body.data[0].name).toBe('Zenith Unique Trading');
    });

    it('searches by mobile number and by business name', async () => {
      await createCustomer(salesToken, {
        name: 'Searchable Co',
        mobile: '9123456780',
        businessName: 'Findme Enterprises',
      });

      const byMobile = await request.get(`${BASE}/customers?search=9123456780`).set(authHeader(salesToken));
      expect(byMobile.body.meta.total).toBe(1);

      const byBusiness = await request.get(`${BASE}/customers?search=Findme`).set(authHeader(salesToken));
      expect(byBusiness.body.meta.total).toBe(1);
    });

    it('filters by status and by customer type', async () => {
      const byStatus = await request.get(`${BASE}/customers?status=LEAD`).set(authHeader(salesToken));
      expect(byStatus.status).toBe(200);
      expect(byStatus.body.data.every((c: { status: string }) => c.status === 'LEAD')).toBe(true);

      const byType = await request.get(`${BASE}/customers?type=WHOLESALE`).set(authHeader(salesToken));
      expect(byType.status).toBe(200);
      expect(byType.body.data.every((c: { customerType: string }) => c.customerType === 'WHOLESALE')).toBe(true);
    });

    it('rejects an invalid filter value with 400', async () => {
      const response = await request.get(`${BASE}/customers?status=NOPE`).set(authHeader(salesToken));
      expect(response.status).toBe(400);
    });

    it('rejects an out-of-range limit with 400', async () => {
      const response = await request.get(`${BASE}/customers?limit=5000`).set(authHeader(salesToken));
      expect(response.status).toBe(400);
    });

    it('returns an empty page rather than an error when nothing matches', async () => {
      const response = await request
        .get(`${BASE}/customers?search=definitely-no-such-customer-xyz`)
        .set(authHeader(salesToken));
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
      expect(response.body.meta.total).toBe(0);
    });
  });

  describe('GET /customers/:id', () => {
    it('returns the customer detail', async () => {
      const customer = await createCustomer(salesToken, { name: 'Detail Target', mobile: '9876500030' });
      const response = await request.get(`${BASE}/customers/${customer.id}`).set(authHeader(salesToken));

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Detail Target');
      expect(response.body.data.createdByName).toBe('Test Sales');
    });

    it('returns 404 for a valid but unknown id', async () => {
      const response = await request
        .get(`${BASE}/customers/11111111-1111-1111-1111-111111111111`)
        .set(authHeader(salesToken));
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for a malformed id', async () => {
      const response = await request.get(`${BASE}/customers/not-a-uuid`).set(authHeader(salesToken));
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /customers/:id', () => {
    it('updates supplied fields and leaves the rest untouched', async () => {
      const customer = await createCustomer(salesToken, {
        name: 'Before Update',
        mobile: '9876500040',
        status: 'LEAD',
        notes: 'original note',
      });

      const response = await request
        .patch(`${BASE}/customers/${customer.id}`)
        .set(authHeader(salesToken))
        .send({ status: 'ACTIVE', businessName: 'Now Trading' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('ACTIVE');
      expect(response.body.data.businessName).toBe('Now Trading');
      expect(response.body.data.name).toBe('Before Update');
      expect(response.body.data.notes).toBe('original note');
    });

    it('clears an optional field when null is sent', async () => {
      const customer = await createCustomer(salesToken, {
        name: 'Clearable',
        mobile: '9876500041',
        notes: 'to be removed',
      });
      const response = await request
        .patch(`${BASE}/customers/${customer.id}`)
        .set(authHeader(salesToken))
        .send({ notes: null });

      expect(response.status).toBe(200);
      expect(response.body.data.notes).toBeNull();
    });

    it('accepts PUT as an alias for PATCH', async () => {
      const customer = await createCustomer(salesToken, { name: 'Put Target', mobile: '9876500042' });
      const response = await request
        .put(`${BASE}/customers/${customer.id}`)
        .set(authHeader(salesToken))
        .send({ status: 'INACTIVE' });
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('INACTIVE');
    });

    it('returns 400 for an empty patch body', async () => {
      const customer = await createCustomer(salesToken, { name: 'Empty Patch', mobile: '9876500043' });
      const response = await request
        .patch(`${BASE}/customers/${customer.id}`)
        .set(authHeader(salesToken))
        .send({});
      expect(response.status).toBe(400);
    });

    it('returns 400 for an invalid enum in the patch', async () => {
      const customer = await createCustomer(salesToken, { name: 'Bad Patch', mobile: '9876500044' });
      const response = await request
        .patch(`${BASE}/customers/${customer.id}`)
        .set(authHeader(salesToken))
        .send({ customerType: 'GOLD' });
      expect(response.status).toBe(400);
    });

    it('returns 404 when updating a non-existent customer', async () => {
      const response = await request
        .patch(`${BASE}/customers/11111111-1111-1111-1111-111111111111`)
        .set(authHeader(salesToken))
        .send({ status: 'ACTIVE' });
      expect(response.status).toBe(404);
    });
  });

  describe('Follow-up notes', () => {
    it('adds a follow-up note and advances the customer follow-up date', async () => {
      const customer = await createCustomer(salesToken, { name: 'Follow Target', mobile: '9876500050' });

      const response = await request
        .post(`${BASE}/customers/${customer.id}/follow-ups`)
        .set(authHeader(salesToken))
        .send({ note: 'Called about the new price list.', followUpDate: '2026-11-15' });

      expect(response.status).toBe(201);
      expect(response.body.data.followUp.note).toBe('Called about the new price list.');
      expect(response.body.data.followUp.createdByName).toBeTruthy();
      // The customer record is advanced in the same transaction.
      expect(response.body.data.customer.followUpDate).toBe('2026-11-15');
    });

    it('accepts a note without a next follow-up date', async () => {
      const customer = await createCustomer(salesToken, { name: 'Note Only', mobile: '9876500051' });
      const response = await request
        .post(`${BASE}/customers/${customer.id}/follow-ups`)
        .set(authHeader(salesToken))
        .send({ note: 'Left a voicemail.' });

      expect(response.status).toBe(201);
      expect(response.body.data.customer.followUpDate).toBeNull();
    });

    it('lists follow-ups newest first with pagination', async () => {
      const customer = await createCustomer(salesToken, { name: 'History', mobile: '9876500052' });
      for (const note of ['first contact', 'second contact', 'third contact']) {
        await request
          .post(`${BASE}/customers/${customer.id}/follow-ups`)
          .set(authHeader(salesToken))
          .send({ note });
      }

      const response = await request
        .get(`${BASE}/customers/${customer.id}/follow-ups?page=1&limit=2`)
        .set(authHeader(salesToken));

      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(3);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].note).toBe('third contact');
    });

    it('rejects an empty note with 400', async () => {
      const customer = await createCustomer(salesToken, { name: 'Blank Note', mobile: '9876500053' });
      const response = await request
        .post(`${BASE}/customers/${customer.id}/follow-ups`)
        .set(authHeader(salesToken))
        .send({ note: '   ' });
      expect(response.status).toBe(400);
    });

    it('returns 404 when adding a note to an unknown customer', async () => {
      const response = await request
        .post(`${BASE}/customers/11111111-1111-1111-1111-111111111111/follow-ups`)
        .set(authHeader(salesToken))
        .send({ note: 'ghost' });
      expect(response.status).toBe(404);
    });

    it('forbids a read-only role from adding a follow-up (403)', async () => {
      const customer = await createCustomer(salesToken, { name: 'RBAC Note', mobile: '9876500054' });
      const response = await request
        .post(`${BASE}/customers/${customer.id}/follow-ups`)
        .set(authHeader(accountsToken))
        .send({ note: 'should be rejected' });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });
});
