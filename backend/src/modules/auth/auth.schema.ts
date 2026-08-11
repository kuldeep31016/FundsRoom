import { z } from 'zod';
import { emailSchema, requiredString } from '../../validation/common';

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z
      .string({ required_error: 'Password is required' })
      .min(1, 'Password is required')
      .max(128, 'Password must be at most 128 characters'),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Self-registration.
 *
 * ADMIN is deliberately absent from the selectable roles: a public endpoint must
 * never let a caller grant itself administrative access. Accounts are created
 * inactive and an administrator activates them, so registering does not by
 * itself confer any access to business data.
 */
export const registerSchema = z
  .object({
    name: requiredString('Full name', 120, 2),
    email: emailSchema,
    password: z
      .string({ required_error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be at most 128 characters')
      .regex(/[A-Za-z]/, 'Password must contain at least one letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    requestedRole: z.enum(['SALES', 'WAREHOUSE', 'ACCOUNTS'], {
      errorMap: () => ({ message: 'Role must be one of: SALES, WAREHOUSE, ACCOUNTS' }),
    }),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
