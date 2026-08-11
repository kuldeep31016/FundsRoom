import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { ROLE_PERMISSIONS, type Permission, type Role } from '../../config/permissions';
import { query } from '../../db/pool';
import { ApiError, ERROR_CODES } from '../../utils/api-error';
import type { PublicUser, UserRecord } from '../../types/domain';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
}

export interface LoginResult {
  token: string;
  expiresIn: string;
  user: PublicUser & { permissions: readonly Permission[] };
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: 'erp-crm-api',
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: 'erp-crm-api' });
    if (typeof decoded === 'string' || !decoded.sub) {
      throw ApiError.unauthenticated('Malformed authentication token.', ERROR_CODES.TOKEN_INVALID);
    }
    const payload = decoded as jwt.JwtPayload & Omit<AccessTokenPayload, 'sub'>;
    return {
      sub: String(payload.sub),
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthenticated(
        'Your session has expired. Please sign in again.',
        ERROR_CODES.TOKEN_EXPIRED,
      );
    }
    throw ApiError.unauthenticated(
      'Invalid authentication token.',
      ERROR_CODES.TOKEN_INVALID,
    );
  }
}

export function toPublicUser(record: UserRecord): PublicUser {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    role: record.role,
    isActive: record.is_active,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const { rows } = await query<UserRecord>(
    `SELECT id, name, email, password_hash, role, is_active, created_at, updated_at
       FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const { rows } = await query<UserRecord>(
    `SELECT id, name, email, password_hash, role, is_active, created_at, updated_at
       FROM users
      WHERE id = $1
      LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Authenticate a user and mint a JWT.
 *
 * Unknown email and wrong password deliberately return the same 401 message so
 * the endpoint cannot be used to enumerate valid accounts.
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await findUserByEmail(email);

  if (!user) {
    // Constant-ish work factor even for unknown users, to avoid timing signals.
    await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    throw ApiError.unauthenticated('Invalid email or password.', ERROR_CODES.INVALID_CREDENTIALS);
  }

  const passwordMatches = await comparePassword(password, user.password_hash);
  if (!passwordMatches) {
    throw ApiError.unauthenticated('Invalid email or password.', ERROR_CODES.INVALID_CREDENTIALS);
  }

  if (!user.is_active) {
    throw new ApiError(
      403,
      ERROR_CODES.ACCOUNT_DISABLED,
      'This account has been deactivated. Contact an administrator.',
    );
  }

  const token = signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  return {
    token,
    expiresIn: env.JWT_EXPIRES_IN,
    user: { ...toPublicUser(user), permissions: ROLE_PERMISSIONS[user.role] },
  };
}

/** Re-reads the user from the database so a deactivated account loses access immediately. */
export async function getProfile(userId: string): Promise<PublicUser & { permissions: readonly Permission[] }> {
  const user = await findUserById(userId);
  if (!user) {
    throw ApiError.unauthenticated('Your account no longer exists.', ERROR_CODES.TOKEN_INVALID);
  }
  if (!user.is_active) {
    throw new ApiError(
      403,
      ERROR_CODES.ACCOUNT_DISABLED,
      'This account has been deactivated. Contact an administrator.',
    );
  }
  return { ...toPublicUser(user), permissions: ROLE_PERMISSIONS[user.role] };
}

/**
 * Create a self-registered account.
 *
 * The account is inserted with `is_active = false`, so the credentials are valid
 * but sign-in is refused with 403 ACCOUNT_DISABLED until an administrator
 * activates it. No token is issued here — registering is a request for access,
 * not a grant of it.
 */
export async function register(input: {
  name: string;
  email: string;
  password: string;
  requestedRole: Exclude<Role, 'ADMIN'>;
}): Promise<PublicUser> {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw ApiError.conflict(
      'An account with this email already exists.',
      ERROR_CODES.DUPLICATE_EMAIL,
    );
  }

  const passwordHash = await hashPassword(input.password);

  const { rows } = await query<UserRecord>(
    `INSERT INTO users (name, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, $4::user_role, false)
     RETURNING id, name, email, password_hash, role, is_active, created_at, updated_at`,
    [input.name, input.email, passwordHash, input.requestedRole],
  );

  return toPublicUser(rows[0] as UserRecord);
}
