import { z } from 'zod';
import {
  dateOnlySchema,
  optionalTrimmedString,
  paginationQuerySchema,
  positiveIntSchema,
  searchQuerySchema,
  sortOrderSchema,
  uuidParam,
} from '../../validation/common';
import { CHALLAN_STATUSES } from '../../types/domain';

const challanStatusSchema = z.enum(CHALLAN_STATUSES, {
  errorMap: () => ({ message: `Status must be one of: ${CHALLAN_STATUSES.join(', ')}` }),
});

const challanItemSchema = z
  .object({
    productId: uuidParam('Product id'),
    quantity: positiveIntSchema('Quantity'),
  })
  .strict();

/**
 * A challan can only be created as DRAFT or CONFIRMED — CANCELLED is reached
 * through the dedicated cancel endpoint, never as an initial state.
 */
const creatableStatusSchema = z.enum(['DRAFT', 'CONFIRMED'], {
  errorMap: () => ({ message: 'Status must be one of: DRAFT, CONFIRMED' }),
});

export const createChallanSchema = z
  .object({
    customerId: uuidParam('Customer id'),
    items: z
      .array(challanItemSchema, { required_error: 'At least one product is required' })
      .min(1, 'A challan must contain at least one product')
      .max(100, 'A challan may contain at most 100 line items'),
    status: creatableStatusSchema.default('DRAFT'),
    notes: optionalTrimmedString(1000),
  })
  .strict();

/** Only DRAFT challans can be edited; enforced in the service layer. */
export const updateChallanSchema = z
  .object({
    customerId: uuidParam('Customer id').optional(),
    items: z
      .array(challanItemSchema)
      .min(1, 'A challan must contain at least one product')
      .max(100, 'A challan may contain at most 100 line items')
      .optional(),
    notes: optionalTrimmedString(1000).nullable(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const cancelChallanSchema = z
  .object({
    reason: optionalTrimmedString(500),
  })
  .strict();

export const challanListQuerySchema = paginationQuerySchema
  .merge(searchQuerySchema)
  .extend({
    status: challanStatusSchema.optional(),
    customerId: z.string().uuid('Customer id must be a valid UUID').optional(),
    createdBy: z.string().uuid('Created by must be a valid UUID').optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    sortBy: z
      .enum(['createdAt', 'challanNumber', 'totalQuantity', 'totalAmount', 'status'])
      .default('createdAt'),
    sortOrder: sortOrderSchema('desc'),
  })
  .strict()
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: '"from" date must not be after "to" date',
    path: ['from'],
  });

export const challanIdParamSchema = z.object({ id: uuidParam('Challan id') });

export type CreateChallanInput = z.infer<typeof createChallanSchema>;
export type UpdateChallanInput = z.infer<typeof updateChallanSchema>;
export type CancelChallanInput = z.infer<typeof cancelChallanSchema>;
export type ChallanListQuery = z.infer<typeof challanListQuerySchema>;
