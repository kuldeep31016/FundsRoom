import { z } from 'zod';
import {
  dateOnlySchema,
  paginationQuerySchema,
  positiveIntSchema,
  requiredString,
  searchQuerySchema,
  uuidParam,
} from '../../validation/common';
import { STOCK_MOVEMENT_TYPES } from '../../types/domain';

const movementTypeSchema = z.enum(STOCK_MOVEMENT_TYPES, {
  errorMap: () => ({ message: `Movement type must be one of: ${STOCK_MOVEMENT_TYPES.join(', ')}` }),
});

export const createStockMovementSchema = z
  .object({
    productId: uuidParam('Product id'),
    movementType: movementTypeSchema,
    quantity: positiveIntSchema('Quantity'),
    reason: requiredString('Reason', 200),
  })
  .strict();

export const stockMovementListQuerySchema = paginationQuerySchema
  .merge(searchQuerySchema)
  .extend({
    productId: z.string().uuid('Product id must be a valid UUID').optional(),
    movementType: movementTypeSchema.optional(),
    referenceType: z.enum(['MANUAL', 'CHALLAN', 'PRODUCT_OPENING']).optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .strict()
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: '"from" date must not be after "to" date',
    path: ['from'],
  });

export type CreateStockMovementInput = z.infer<typeof createStockMovementSchema>;
export type StockMovementListQuery = z.infer<typeof stockMovementListQuerySchema>;
