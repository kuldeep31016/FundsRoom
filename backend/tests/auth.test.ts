import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { BASE, TEST_PASSWORD, TEST_USERS, authHeader, ensureTestUsers, loginAs, request } from './helpers/test-app';
import { closePool, pool } from '../src/db/pool';
import { ROLES } from '../src/config/permissions';

describe('Authentication', () => {
  beforeAll(async () => {
    await ensureTestUsers();
  });

  afterAll(async () => {
    await closePool();
  });

  describe('POST /auth/login', () => {
    it('signs in with valid credentials and returns a JWT plus the permission set', async () => {
      const response = await request
        .post(`${BASE}/auth/login`)
        .send({ email: TEST_USERS.ADMIN.email, password: TEST_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(typeof response.body.data.token).toBe('string');
      expect(response.body.data.user.role).toBe('ADMIN');
      expect(response.body.data.user.permissions).toContain('challans:confirm');
      // The password hash must never leave the server.
      expect(response.body.data.user).not.toHaveProperty('password_hash');
      expect(response.body.data.user).not.toHaveProperty('passwordHash');
    });

    it('logs in successfully for every one of the four roles', async () => {
      for (const role of ROLES) {
        const response = await request
          .post(`${BASE}/auth/login`)
          .send({ email: TEST_USERS[role].email, password: TEST_PASSWORD });
        expect(response.status, `login failed for ${role}`).toBe(200);
        expect(response.body.data.user.role).toBe(role);
      }
    });

    it('is case-insensitive on the email address', async () => {
      const response = await request
        .post(`${BASE}/auth/login`)
        .send({ email: TEST_USERS.SALES.email.toUpperCase(), password: TEST_PASSWORD });
      expect(response.status).toBe(200);
    });

    it('rejects a wrong password with 401 and a generic message', async () => {
      const response = await request
        .post(`${BASE}/auth/login`)
        .send({ email: TEST_USERS.ADMIN.email, password: 'WrongPassword1' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(response.body.error.message).toBe('Invalid email or password.');
    });

    it('returns the same generic 401 for an unknown email (no account enumeration)', async () => {
      const response = await request
        .post(`${BASE}/auth/login`)
        .send({ email: 'nobody@test.local', password: TEST_PASSWORD });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(response.body.error.message).toBe('Invalid email or password.');
    });

    it('returns 400 when credentials are missing', async () => {
      const response = await request.post(`${BASE}/auth/login`).send({});
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      const fields = response.body.error.details.map((d: { field: string }) => d.field);
      expect(fields).toContain('email');
      expect(fields).toContain('password');
    });

    it('returns 400 for a malformed email', async () => {
      const response = await request
        .post(`${BASE}/auth/login`)
        .send({ email: 'not-an-email', password: TEST_PASSWORD });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for a malformed JSON body', async () => {
      const response = await request
        .post(`${BASE}/auth/login`)
        .set('Content-Type', 'application/json')
        .send('{"email": "broken"');
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('MALFORMED_JSON');
    });

    it('returns 403 for a deactivated account', async () => {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, is_active)
         SELECT 'Disabled User', 'disabled@test.local', password_hash, 'SALES', false
           FROM users WHERE email = $1
         ON CONFLICT (lower(email)) DO UPDATE SET is_active = false`,
        [TEST_USERS.SALES.email],
      );

      const response = await request
        .post(`${BASE}/auth/login`)
        .send({ email: 'disabled@test.local', password: TEST_PASSWORD });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('ACCOUNT_DISABLED');
    });
  });

  describe('JWT validation', () => {
    it('GET /auth/me returns the caller profile with a valid token', async () => {
      const token = await loginAs('WAREHOUSE');
      const response = await request.get(`${BASE}/auth/me`).set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.data.user.email).toBe(TEST_USERS.WAREHOUSE.email);
      expect(response.body.data.user.permissions).toContain('stock:write');
      expect(response.body.data.user.permissions).not.toContain('customers:write');
    });

    it('returns 401 when the Authorization header is missing', async () => {
      const response = await request.get(`${BASE}/auth/me`);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('returns 401 when the scheme is not Bearer', async () => {
      const token = await loginAs('ADMIN');
      const response = await request.get(`${BASE}/auth/me`).set({ Authorization: `Basic ${token}` });
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_INVALID');
    });

    it('returns 401 for a garbage token', async () => {
      const response = await request.get(`${BASE}/auth/me`).set(authHeader('not.a.real.token'));
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_INVALID');
    });

    it('returns 401 for a token signed with the wrong secret', async () => {
      const forged = jwt.sign(
        { sub: '00000000-0000-0000-0000-000000000000', email: 'x@test.local', name: 'X', role: 'ADMIN' },
        'a-completely-different-secret',
        { issuer: 'erp-crm-api', expiresIn: '1h' },
      );
      const response = await request.get(`${BASE}/auth/me`).set(authHeader(forged));
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_INVALID');
    });

    it('returns 401 for an expired token', async () => {
      const expired = jwt.sign(
        { sub: '00000000-0000-0000-0000-000000000000', email: 'x@test.local', name: 'X', role: 'ADMIN' },
        process.env.JWT_SECRET as string,
        { issuer: 'erp-crm-api', expiresIn: '-10s' },
      );
      const response = await request.get(`${BASE}/auth/me`).set(authHeader(expired));
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('rejects a valid-looking token whose user no longer exists', async () => {
      const orphan = jwt.sign(
        { sub: '11111111-1111-1111-1111-111111111111', email: 'ghost@test.local', name: 'Ghost', role: 'ADMIN' },
        process.env.JWT_SECRET as string,
        { issuer: 'erp-crm-api', expiresIn: '1h' },
      );
      const response = await request.get(`${BASE}/auth/me`).set(authHeader(orphan));
      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('succeeds for an authenticated caller', async () => {
      const token = await loginAs('ACCOUNTS');
      const response = await request.post(`${BASE}/auth/logout`).set(authHeader(token));
      expect(response.status).toBe(200);
    });

    it('returns 401 without a token', async () => {
      const response = await request.post(`${BASE}/auth/logout`);
      expect(response.status).toBe(401);
    });
  });

  describe('Infrastructure', () => {
    it('GET /health reports a live database', async () => {
      const response = await request.get(`${BASE}/health`);
      expect(response.status).toBe(200);
      expect(response.body.data.database).toBe('connected');
    });

    it('returns 404 with the standard envelope for an unknown route', async () => {
      const response = await request.get(`${BASE}/does-not-exist`);
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});
