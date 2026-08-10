import { z } from 'zod';
import {
  moneySchema,
  nonNegativeIntSchema,
  optionalTrimmedString,
  paginationQuerySchema,
  requiredString,
  searchQuerySchema,
  skuSchema,
  sortOrderSchema,
  uuidParam,
} from '../../validation/common';

export const createProductSchema = z
  .object({
    name: requiredString('Product name', 150),
    sku: skuSchema,
    category: requiredString('Category', 80),
    unitPrice: moneySchema('Unit price'),
    // Opening stock. Any non-zero value is posted as an initial IN movement so
    // the ledger always explains the balance.
    currentStock: nonNegativeIntSchema('Current stock').default(0),
    minStockAlert: nonNegativeIntSchema('Minimum stock alert').default(0),
    location: optionalTrimmedString(120),
  })
  .strict();

export const updateProductSchema = z
  .object({
    name: requiredString('Product name', 150).optional(),
    sku: skuSchema.optional(),
    category: requiredString('Category', 80).optional(),
    unitPrice: moneySchema('Unit price').optional(),
    minStockAlert: nonNegativeIntSchema('Minimum stock alert').optional(),
    location: optionalTrimmedString(120).nullable(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })
  .refine((data) => !('currentStock' in data), {
    message: 'Stock cannot be edited directly — use the stock movement endpoint',
  });

export const productListQuerySchema = paginationQuerySchema
  .merge(searchQuerySchema)
  .extend({
    category: z.string().trim().max(80).optional(),
    lowStock: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === 'true')),
    isActive: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === 'true')),
    sortBy: z.enum(['createdAt', 'name', 'sku', 'unitPrice', 'currentStock']).default('createdAt'),
    sortOrder: sortOrderSchema('desc'),
  })
  .strict();

export const productIdParamSchema = z.object({ id: uuidParam('Product id') });

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
