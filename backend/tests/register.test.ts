import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BASE, authHeader, ensureTestUsers, loginAs, request } from './helpers/test-app';
import { closePool, pool } from '../src/db/pool';

let adminToken: string;
let salesToken: string;

const PASSWORD = 'Password@123';

/** Registrations accumulate across tests; keep the emails unique per case. */
let counter = 0;
function uniqueEmail(): string {
  counter += 1;
  return `signup-${Date.now()}-${counter}@test.local`;
}

async function registerUser(overrides: Record<string, unknown> = {}) {
  return request.post(`${BASE}/auth/register`).send({
    name: 'New Starter',
    email: uniqueEmail(),
    password: PASSWORD,
    requestedRole: 'SALES',
    ...overrides,
  });
}

describe('Self-registration', () => {
  beforeAll(async () => {
    await ensureTestUsers();
    adminToken = await loginAs('ADMIN');
    salesToken = await loginAs('SALES');
    // Remove anything left by a previous run so counts stay predictable.
    await pool.query("DELETE FROM users WHERE email LIKE 'signup-%@test.local'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE 'signup-%@test.local'");
    await closePool();
  });

  describe('POST /auth/register', () => {
    it('creates an account and returns 201 without a token', async () => {
      const response = await registerUser({ name: 'Priya Sharma' });

      expect(response.status).toBe(201);
      expect(response.body.data.user.name).toBe('Priya Sharma');
      expect(response.body.data.user.role).toBe('SALES');
      // Registering must not grant access.
      expect(response.body.data.user.isActive).toBe(false);
      expect(response.body.data).not.toHaveProperty('token');
      expect(response.body.data.message).toContain('administrator');
    });

    it('never returns the password hash', async () => {
      const response = await registerUser();
      expect(JSON.stringify(response.body)).not.toContain('$2a$');
      expect(response.body.data.user).not.toHaveProperty('passwordHash');
      expect(response.body.data.user).not.toHaveProperty('password_hash');
    });

    it('refuses to sign in until an administrator approves the account', async () => {
      const email = uniqueEmail();
      await registerUser({ email });

      const login = await request.post(`${BASE}/auth/login`).send({ email, password: PASSWORD });

      expect(login.status).toBe(403);
      expect(login.body.error.code).toBe('ACCOUNT_DISABLED');
    });

    it('rejects a request for the ADMIN role — no self-elevation', async () => {
      const response = await registerUser({ requestedRole: 'ADMIN' });

      expect(response.status).toBe(400);
      expect(response.body.error.details[0].message).toContain('SALES, WAREHOUSE, ACCOUNTS');
    });

    it('rejects an unknown role', async () => {
      const response = await registerUser({ requestedRole: 'SUPERUSER' });
      expect(response.status).toBe(400);
    });

    it('returns 409 for an email that already exists', async () => {
      const email = uniqueEmail();
      expect((await registerUser({ email })).status).toBe(201);

      const duplicate = await registerUser({ email });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('DUPLICATE_EMAIL');
    });

    it('treats a differently-cased email as a duplicate', async () => {
      const email = uniqueEmail();
      await registerUser({ email });

      const duplicate = await registerUser({ email: email.toUpperCase() });
      expect(duplicate.status).toBe(409);
    });

    it('cannot be used to hijack a seeded account', async () => {
      const response = await registerUser({ email: 'admin@test.local' });
      expect(response.status).toBe(409);

      // The original account still works with its own password.
      const login = await request
        .post(`${BASE}/auth/login`)
        .send({ email: 'admin@test.local', password: PASSWORD });
      expect(login.status).toBe(200);
      expect(login.body.data.user.role).toBe('ADMIN');
    });

    it('enforces password strength', async () => {
      for (const password of ['short1', 'nodigitshere', '12345678']) {
        const response = await registerUser({ password });
        expect(response.status, `password=${password}`).toBe(400);
      }
    });

    it('rejects a missing name, a bad email and unknown fields', async () => {
      expect((await registerUser({ name: '' })).status).toBe(400);
      expect((await registerUser({ email: 'not-an-email' })).status).toBe(400);
      expect((await registerUser({ isActive: true })).status).toBe(400);
    });

    it('ignores an attempt to self-activate via an extra field', async () => {
      // `.strict()` rejects the payload outright rather than silently dropping it.
      const response = await request.post(`${BASE}/auth/register`).send({
        name: 'Sneaky',
        email: uniqueEmail(),
        password: PASSWORD,
        requestedRole: 'SALES',
        is_active: true,
      });
      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /users/:id — administrator approval', () => {
    it('activates a pending account, which can then sign in', async () => {
      const email = uniqueEmail();
      const created = await registerUser({ email });
      const userId = created.body.data.user.id;

      const approved = await request
        .patch(`${BASE}/users/${userId}`)
        .set(authHeader(adminToken))
        .send({ isActive: true });

      expect(approved.status).toBe(200);
      expect(approved.body.data.isActive).toBe(true);

      const login = await request.post(`${BASE}/auth/login`).send({ email, password: PASSWORD });
      expect(login.status).toBe(200);
      expect(login.body.data.user.role).toBe('SALES');
    });

    it('can change the assigned role', async () => {
      const created = await registerUser({ requestedRole: 'SALES' });
      const response = await request
        .patch(`${BASE}/users/${created.body.data.user.id}`)
        .set(authHeader(adminToken))
        .send({ isActive: true, role: 'WAREHOUSE' });

      expect(response.status).toBe(200);
      expect(response.body.data.role).toBe('WAREHOUSE');
    });

    it('suspends an active account, revoking sign-in', async () => {
      const email = uniqueEmail();
      const created = await registerUser({ email });
      const userId = created.body.data.user.id;

      await request
        .patch(`${BASE}/users/${userId}`)
        .set(authHeader(adminToken))
        .send({ isActive: true });
      expect((await request.post(`${BASE}/auth/login`).send({ email, password: PASSWORD })).status).toBe(200);

      await request
        .patch(`${BASE}/users/${userId}`)
        .set(authHeader(adminToken))
        .send({ isActive: false });

      const blocked = await request.post(`${BASE}/auth/login`).send({ email, password: PASSWORD });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('ACCOUNT_DISABLED');
    });

    it('an existing session dies as soon as the account is suspended', async () => {
      const email = uniqueEmail();
      const created = await registerUser({ email });
      const userId = created.body.data.user.id;
      await request
        .patch(`${BASE}/users/${userId}`)
        .set(authHeader(adminToken))
        .send({ isActive: true });

      const login = await request.post(`${BASE}/auth/login`).send({ email, password: PASSWORD });
      const token = login.body.data.token as string;
      expect((await request.get(`${BASE}/auth/me`).set(authHeader(token))).status).toBe(200);

      await request
        .patch(`${BASE}/users/${userId}`)
        .set(authHeader(adminToken))
        .send({ isActive: false });

      // The JWT is still cryptographically valid, but the profile check rejects it.
      const after = await request.get(`${BASE}/auth/me`).set(authHeader(token));
      expect(after.status).toBe(403);
      expect(after.body.error.code).toBe('ACCOUNT_DISABLED');
    });

    it('stops an administrator locking themselves out', async () => {
      const me = await request.get(`${BASE}/auth/me`).set(authHeader(adminToken));
      const myId = me.body.data.user.id;

      const deactivate = await request
        .patch(`${BASE}/users/${myId}`)
        .set(authHeader(adminToken))
        .send({ isActive: false });
      expect(deactivate.status).toBe(409);

      const demote = await request
        .patch(`${BASE}/users/${myId}`)
        .set(authHeader(adminToken))
        .send({ role: 'ACCOUNTS' });
      expect(demote.status).toBe(409);

      // Still an active administrator.
      expect((await request.get(`${BASE}/auth/me`).set(authHeader(adminToken))).status).toBe(200);
    });

    it('is administrator-only', async () => {
      const created = await registerUser();
      const response = await request
        .patch(`${BASE}/users/${created.body.data.user.id}`)
        .set(authHeader(salesToken))
        .send({ isActive: true });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('requires authentication', async () => {
      const created = await registerUser();
      const response = await request
        .patch(`${BASE}/users/${created.body.data.user.id}`)
        .send({ isActive: true });
      expect(response.status).toBe(401);
    });

    it('returns 404 for an unknown user and 400 for an empty patch', async () => {
      const unknown = await request
        .patch(`${BASE}/users/11111111-1111-1111-1111-111111111111`)
        .set(authHeader(adminToken))
        .send({ isActive: true });
      expect(unknown.status).toBe(404);

      const created = await registerUser();
      const empty = await request
        .patch(`${BASE}/users/${created.body.data.user.id}`)
        .set(authHeader(adminToken))
        .send({});
      expect(empty.status).toBe(400);
    });
  });
});
