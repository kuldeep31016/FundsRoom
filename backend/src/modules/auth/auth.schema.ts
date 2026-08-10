import { z } from 'zod';
import { emailSchema } from '../../validation/common';

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
