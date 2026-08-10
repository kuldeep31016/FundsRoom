import { z } from 'zod';

/** Trim strings and turn "" into undefined so optional text fields stay NULL. */
export const optionalTrimmedString = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' || value === undefined ? undefined : value));

export const requiredString = (field: string, max = 255, min = 1) =>
  z
    .string({ required_error: `${field} is required`, invalid_type_error: `${field} must be text` })
    .trim()
    .min(min, `${field} is required`)
    .max(max, `${field} must be at most ${max} characters`);

export const uuidParam = (field = 'id') =>
  z.string({ required_error: `${field} is required` }).uuid(`${field} must be a valid UUID`);

export const emailSchema = z
  .string({ invalid_type_error: 'Email must be text' })
  .trim()
  .toLowerCase()
  .email('Must be a valid email address')
  .max(255, 'Email must be at most 255 characters');

/** 10–15 digits; optional leading + and separators are stripped before validation. */
export const mobileSchema = z
  .string({ required_error: 'Mobile number is required' })
  .trim()
  .transform((value) => value.replace(/[\s()+-]/g, ''))
  .pipe(
    z
      .string()
      .regex(/^[0-9]{10,15}$/, 'Mobile number must contain 10 to 15 digits'),
  );

export const gstNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    'GST number must be a valid 15-character GSTIN (e.g. 27AAPFU0939F1ZV)',
  );

export const skuSchema = z
  .string({ required_error: 'SKU is required' })
  .trim()
  .toUpperCase()
  .min(2, 'SKU must be at least 2 characters')
  .max(32, 'SKU must be at most 32 characters')
  .regex(
    /^[A-Z0-9][A-Z0-9._-]*$/,
    'SKU may only contain letters, digits, dot, underscore and hyphen',
  );

/** Strictly positive integer — used for quantities. Rejects 0, negatives, decimals. */
export const positiveIntSchema = (field: string, max = 1_000_000) =>
  z
    .number({
      required_error: `${field} is required`,
      invalid_type_error: `${field} must be a number`,
    })
    .int(`${field} must be a whole number`)
    .positive(`${field} must be greater than zero`)
    .max(max, `${field} must be at most ${max}`);

export const nonNegativeIntSchema = (field: string, max = 100_000_000) =>
  z
    .number({
      required_error: `${field} is required`,
      invalid_type_error: `${field} must be a number`,
    })
    .int(`${field} must be a whole number`)
    .min(0, `${field} cannot be negative`)
    .max(max, `${field} must be at most ${max}`);

export const moneySchema = (field: string) =>
  z
    .number({
      required_error: `${field} is required`,
      invalid_type_error: `${field} must be a number`,
    })
    .min(0, `${field} cannot be negative`)
    .max(99_999_999.99, `${field} is too large`)
    .refine(
      (value) => Number.isFinite(value) && Math.round(value * 100) === Number((value * 100).toFixed(0)),
      `${field} may have at most 2 decimal places`,
    );

/** ISO date (YYYY-MM-DD). Empty string is treated as "clear the value". */
export const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Date is not a valid calendar date');

/** Query-string helpers: everything arrives as a string. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'page must be 1 or greater').default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'limit must be 1 or greater')
    .max(100, 'limit must be at most 100')
    .default(10),
});

export const searchQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
});

export function sortOrderSchema(defaultOrder: 'asc' | 'desc' = 'desc') {
  return z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default(defaultOrder)
    .transform((value) => value.toLowerCase() as 'asc' | 'desc');
}
