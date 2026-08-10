import { z } from 'zod';
import { ALLOWED_IMAGE_TYPES } from '../storage/storage.service';
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

const imageContentTypeSchema = z.enum(ALLOWED_IMAGE_TYPES, {
  errorMap: () => ({
    message: `Image must be one of: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
  }),
});

/** Requests a presigned upload URL; the browser then PUTs the file to S3. */
export const productImageUploadUrlSchema = z
  .object({
    contentType: imageContentTypeSchema,
    contentLength: z
      .number({ required_error: 'File size is required' })
      .int('File size must be a whole number of bytes')
      .positive('File size must be greater than zero'),
  })
  .strict();

/** Confirms an upload and attaches the stored object to the product. */
export const attachProductImageSchema = z
  .object({
    key: requiredString('Upload key', 300),
  })
  .strict();

export type ProductImageUploadUrlInput = z.infer<typeof productImageUploadUrlSchema>;
export type AttachProductImageInput = z.infer<typeof attachProductImageSchema>;
