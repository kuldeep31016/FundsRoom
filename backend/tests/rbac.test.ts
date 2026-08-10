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
import { ROLES, ROLE_PERMISSIONS, type Role } from '../src/config/permissions';

const tokens = {} as Record<Role, string>;
let customerId: string;
let productId: string;
let draftIdByRole: Record<string, string> = {};

/**
 * The full authorization matrix, asserted against the live API.
 *
 * This is the security boundary the case study calls out: the frontend hides
 * controls, but these tests prove a hand-crafted HTTP request from the wrong
 * role is rejected by the server.
 */
describe('Role-based access control (backend enforced)', () => {
  beforeAll(async () => {
    await ensureTestUsers();
    await resetBusinessData();
    for (const role of ROLES) {
      tokens[role] = await loginAs(role);
    }
    const customer = await createCustomer(tokens.SALES, { name: 'RBAC Customer', mobile: '9800000099' });
    customerId = customer.id as string;
    const product = await createProduct(tokens.WAREHOUSE, { currentStock: 500 });
    productId = product.id as string;

    // One draft per role that is allowed to create challans, so confirm/cancel
    // checks never collide with each other.
    for (const role of ['ADMIN', 'SALES'] as const) {
      for (const purpose of ['confirm', 'cancel']) {
        const response = await request
          .post(`${BASE}/challans`)
          .set(authHeader(tokens[role]))
          .send({ customerId, items: [{ productId, quantity: 1 }] });
        draftIdByRole[`${role}:${purpose}`] = response.body.data.id;
      }
    }
    // Extra drafts for the roles that may confirm/cancel but not create.
    for (const purpose of ['confirm', 'cancel']) {
      for (const role of ['WAREHOUSE', 'ACCOUNTS'] as const) {
        const response = await request
          .post(`${BASE}/challans`)
          .set(authHeader(tokens.SALES))
          .send({ customerId, items: [{ productId, quantity: 1 }] });
        draftIdByRole[`${role}:${purpose}`] = response.body.data.id;
      }
    }
  });

  afterAll(async () => {
    await closePool();
  });

  // -------------------------------------------------------------------------
  describe('Permission matrix is internally consistent', () => {
    it('ADMIN holds every permission', () => {
      expect(ROLE_PERMISSIONS.ADMIN.length).toBeGreaterThan(0);
      for (const role of ROLES) {
        for (const permission of ROLE_PERMISSIONS[role]) {
          expect(ROLE_PERMISSIONS.ADMIN).toContain(permission);
        }
      }
    });

    it('ACCOUNTS holds no write permission', () => {
      const writes = ROLE_PERMISSIONS.ACCOUNTS.filter((p) => p.includes(':write'));
      expect(writes).toEqual([]);
    });

    it('every role can read the dashboard', () => {
      for (const role of ROLES) {
        expect(ROLE_PERMISSIONS[role]).toContain('dashboard:read');
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('Read access — all four roles', () => {
    const readEndpoints = [
      '/customers',
      '/products',
      '/stock/movements',
      '/challans',
      '/dashboard/summary',
    ];

    for (const role of ROLES) {
      for (const endpoint of readEndpoints) {
        it(`${role} can GET ${endpoint}`, async () => {
          const response = await request.get(`${BASE}${endpoint}`).set(authHeader(tokens[role]));
          expect(response.status).toBe(200);
        });
      }
    }
  });

  // -------------------------------------------------------------------------
  describe('customers:write', () => {
    const allowed: Role[] = ['ADMIN', 'SALES'];

    for (const role of ROLES) {
      const shouldPass = allowed.includes(role);
      it(`${role} ${shouldPass ? 'can' : 'cannot'} create a customer`, async () => {
        const response = await request
          .post(`${BASE}/customers`)
          .set(authHeader(tokens[role]))
          .send({ name: `RBAC ${role}`, mobile: '9811100000', customerType: 'RETAIL' });

        if (shouldPass) {
          expect(response.status).toBe(201);
        } else {
          expect(response.status).toBe(403);
          expect(response.body.error.code).toBe('FORBIDDEN');
        }
      });

      it(`${role} ${shouldPass ? 'can' : 'cannot'} update a customer`, async () => {
        const response = await request
          .patch(`${BASE}/customers/${customerId}`)
          .set(authHeader(tokens[role]))
          .send({ notes: `touched by ${role}` });
        expect(response.status).toBe(shouldPass ? 200 : 403);
      });
    }
  });

  // -------------------------------------------------------------------------
  describe('products:write', () => {
    const allowed: Role[] = ['ADMIN', 'WAREHOUSE'];

    for (const role of ROLES) {
      const shouldPass = allowed.includes(role);
      it(`${role} ${shouldPass ? 'can' : 'cannot'} create a product`, async () => {
        const response = await request
          .post(`${BASE}/products`)
          .set(authHeader(tokens[role]))
          .send({
            name: `RBAC Product ${role}`,
            sku: `RBAC-${role}`,
            category: 'RBAC',
            unitPrice: 10,
            currentStock: 1,
          });
        expect(response.status).toBe(shouldPass ? 201 : 403);
      });

      it(`${role} ${shouldPass ? 'can' : 'cannot'} update a product`, async () => {
        const response = await request
          .patch(`${BASE}/products/${productId}`)
          .set(authHeader(tokens[role]))
          .send({ minStockAlert: 3 });
        expect(response.status).toBe(shouldPass ? 200 : 403);
      });
    }
  });

  // -------------------------------------------------------------------------
  describe('stock:write', () => {
    const allowed: Role[] = ['ADMIN', 'WAREHOUSE'];

    for (const role of ROLES) {
      const shouldPass = allowed.includes(role);
      it(`${role} ${shouldPass ? 'can' : 'cannot'} post a stock movement`, async () => {
        const response = await request
          .post(`${BASE}/stock/movements`)
          .set(authHeader(tokens[role]))
          .send({ productId, movementType: 'IN', quantity: 1, reason: `RBAC ${role}` });
        expect(response.status).toBe(shouldPass ? 201 : 403);
      });
    }
  });

  // -------------------------------------------------------------------------
  describe('challans:write / confirm / cancel', () => {
    const canWrite: Role[] = ['ADMIN', 'SALES'];
    const canConfirm: Role[] = ['ADMIN', 'SALES', 'WAREHOUSE'];
    const canCancel: Role[] = ['ADMIN', 'SALES', 'WAREHOUSE'];

    for (const role of ROLES) {
      it(`${role} ${canWrite.includes(role) ? 'can' : 'cannot'} create a challan`, async () => {
        const response = await request
          .post(`${BASE}/challans`)
          .set(authHeader(tokens[role]))
          .send({ customerId, items: [{ productId, quantity: 1 }] });
        expect(response.status).toBe(canWrite.includes(role) ? 201 : 403);
      });

      it(`${role} ${canConfirm.includes(role) ? 'can' : 'cannot'} confirm a challan`, async () => {
        const id = draftIdByRole[`${role}:confirm`];
        const response = await request
          .post(`${BASE}/challans/${id}/confirm`)
          .set(authHeader(tokens[role]));
        expect(response.status).toBe(canConfirm.includes(role) ? 200 : 403);
      });

      it(`${role} ${canCancel.includes(role) ? 'can' : 'cannot'} cancel a challan`, async () => {
        const id = draftIdByRole[`${role}:cancel`];
        const response = await request
          .post(`${BASE}/challans/${id}/cancel`)
          .set(authHeader(tokens[role]))
          .send({ reason: `RBAC ${role}` });
        expect(response.status).toBe(canCancel.includes(role) ? 200 : 403);
      });
    }
  });

  // -------------------------------------------------------------------------
  describe('users administration (ADMIN only)', () => {
    for (const role of ROLES) {
      const shouldPass = role === 'ADMIN';
      it(`${role} ${shouldPass ? 'can' : 'cannot'} list users`, async () => {
        const response = await request.get(`${BASE}/users`).set(authHeader(tokens[role]));
        expect(response.status).toBe(shouldPass ? 200 : 403);
      });

      it(`${role} ${shouldPass ? 'can' : 'cannot'} create a user`, async () => {
        const response = await request
          .post(`${BASE}/users`)
          .set(authHeader(tokens[role]))
          .send({
            name: `Created by ${role}`,
            email: `rbac-${role.toLowerCase()}@test.local`,
            password: 'Password@123',
            role: 'SALES',
          });
        expect(response.status).toBe(shouldPass ? 201 : 403);
      });
    }
  });

  // -------------------------------------------------------------------------
  describe('Unauthenticated access is rejected before authorization', () => {
    const protectedEndpoints: Array<[string, string]> = [
      ['get', '/customers'],
      ['post', '/customers'],
      ['get', '/products'],
      ['post', '/products'],
      ['get', '/stock/movements'],
      ['post', '/stock/movements'],
      ['get', '/challans'],
      ['post', '/challans'],
      ['get', '/dashboard/summary'],
      ['get', '/users'],
    ];

    for (const [method, endpoint] of protectedEndpoints) {
      it(`${method.toUpperCase()} ${endpoint} returns 401 without a token`, async () => {
        const response = await (method === 'get'
          ? request.get(`${BASE}${endpoint}`)
          : request.post(`${BASE}${endpoint}`).send({}));
        expect(response.status).toBe(401);
      });
    }

    it('returns 401 (not 403) when the token is invalid, even for a forbidden action', async () => {
      const response = await request
        .post(`${BASE}/products`)
        .set(authHeader('garbage.token.value'))
        .send({ name: 'x', sku: 'X-1', category: 'x', unitPrice: 1 });
      expect(response.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  describe('403 responses are informative but safe', () => {
    it('names the role and the missing permission without leaking internals', async () => {
      const response = await request
        .post(`${BASE}/products`)
        .set(authHeader(tokens.ACCOUNTS))
        .send({ name: 'x', sku: 'X-2', category: 'x', unitPrice: 1 });

      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain('ACCOUNTS');
      expect(response.body.error.message).toContain('products:write');
      expect(response.body.error).not.toHaveProperty('stack');
    });
  });
});
