import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireUser } from '../../middleware/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { sendCreated, sendOk, sendPaginated } from '../../utils/http';
import { query } from '../../db/pool';
import { ROLES } from '../../config/permissions';
import {
  emailSchema,
  paginationQuerySchema,
  requiredString,
  uuidParam,
} from '../../validation/common';
import { hashPassword, toPublicUser } from '../auth/auth.service';
import type { UserRecord } from '../../types/domain';
import { ApiError, ERROR_CODES } from '../../utils/api-error';

const router = Router();

const createUserSchema = z
  .object({
    name: requiredString('Name', 120),
    email: emailSchema,
    password: z
      .string({ required_error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be at most 128 characters'),
    role: z.enum(ROLES, {
      errorMap: () => ({ message: `Role must be one of: ${ROLES.join(', ')}` }),
    }),
  })
  .strict();

const userIdParamSchema = z.object({ id: uuidParam('User id') });

/** Administrators approve, suspend or re-assign an account. */
const updateUserSchema = z
  .object({
    isActive: z.boolean().optional(),
    role: z
      .enum(ROLES, { errorMap: () => ({ message: `Role must be one of: ${ROLES.join(', ')}` }) })
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

const listQuerySchema = paginationQuerySchema
  .extend({
    role: z.enum(ROLES).optional(),
  })
  .strict();

router.use(authenticate);

/** GET /users — administrator-only directory of portal accounts. */
router.get(
  '/',
  requirePermission('users:read'),
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const params = req.query as unknown as z.infer<typeof listQuerySchema>;
    const filters = params.role ? 'WHERE role = $3::user_role' : '';
    const values: unknown[] = [params.limit, (params.page - 1) * params.limit];
    if (params.role) values.push(params.role);

    const { rows } = await query<UserRecord>(
      `SELECT id, name, email, password_hash, role, is_active, created_at, updated_at
         FROM users ${filters}
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2`,
      values,
    );
    const { rows: countRows } = await query<{ count: number }>(
      `SELECT count(*)::bigint AS count FROM users ${params.role ? 'WHERE role = $1::user_role' : ''}`,
      params.role ? [params.role] : [],
    );

    sendPaginated(res, rows.map(toPublicUser), {
      page: params.page,
      limit: params.limit,
      total: countRows[0]?.count ?? 0,
    });
  }),
);

/** POST /users — administrator-only account creation. */
router.post(
  '/',
  requirePermission('users:write'),
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof createUserSchema>;

    const { rows: existing } = await query<{ id: string }>(
      'SELECT id FROM users WHERE lower(email) = lower($1)',
      [input.email],
    );
    if (existing.length > 0) {
      throw ApiError.conflict(
        'A user with this email already exists.',
        ERROR_CODES.DUPLICATE_EMAIL,
      );
    }

    const passwordHash = await hashPassword(input.password);
    const { rows } = await query<UserRecord>(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4::user_role)
       RETURNING id, name, email, password_hash, role, is_active, created_at, updated_at`,
      [input.name, input.email, passwordHash, input.role],
    );
    sendCreated(res, toPublicUser(rows[0] as UserRecord));
  }),
);

/**
 * PATCH /users/:id — approve a registration, suspend an account, or change a role.
 *
 * An administrator cannot deactivate or demote their own account: doing so would
 * immediately revoke the session performing the change, and if they were the last
 * administrator it would lock the organisation out of user management entirely.
 */
router.patch(
  '/:id',
  requirePermission('users:write'),
  validateParams(userIdParamSchema),
  validateBody(updateUserSchema),
  asyncHandler(async (req, res) => {
    const actor = requireUser(req);
    const targetId = req.params.id as string;
    const input = req.body as z.infer<typeof updateUserSchema>;

    if (targetId === actor.id && (input.isActive === false || (input.role && input.role !== actor.role))) {
      throw ApiError.conflict(
        'You cannot deactivate or change the role of your own account.',
      );
    }

    const assignments: string[] = [];
    const values: unknown[] = [];
    if (input.isActive !== undefined) {
      values.push(input.isActive);
      assignments.push(`is_active = $${values.length}`);
    }
    if (input.role !== undefined) {
      values.push(input.role);
      assignments.push(`role = $${values.length}::user_role`);
    }
    values.push(targetId);

    const { rows } = await query<UserRecord>(
      `UPDATE users SET ${assignments.join(', ')}
        WHERE id = $${values.length}
        RETURNING id, name, email, password_hash, role, is_active, created_at, updated_at`,
      values,
    );

    if (!rows[0]) {
      throw ApiError.notFound('User');
    }
    sendOk(res, toPublicUser(rows[0]));
  }),
);

export default router;
