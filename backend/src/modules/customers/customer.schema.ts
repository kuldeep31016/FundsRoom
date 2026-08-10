import { z } from 'zod';
import {
  dateOnlySchema,
  emailSchema,
  gstNumberSchema,
  mobileSchema,
  optionalTrimmedString,
  paginationQuerySchema,
  requiredString,
  searchQuerySchema,
  sortOrderSchema,
  uuidParam,
} from '../../validation/common';
import { CUSTOMER_STATUSES, CUSTOMER_TYPES } from '../../types/domain';

const customerTypeSchema = z.enum(CUSTOMER_TYPES, {
  errorMap: () => ({ message: `Customer type must be one of: ${CUSTOMER_TYPES.join(', ')}` }),
});

const customerStatusSchema = z.enum(CUSTOMER_STATUSES, {
  errorMap: () => ({ message: `Status must be one of: ${CUSTOMER_STATUSES.join(', ')}` }),
});

/** Optional email/GST accept "" to mean "leave empty / clear". */
const optionalEmail = emailSchema.optional().or(z.literal('')).transform((v) => (v ? v : undefined));
const optionalGst = gstNumberSchema.optional().or(z.literal('')).transform((v) => (v ? v : undefined));
const optionalDate = dateOnlySchema.optional().or(z.literal('')).transform((v) => (v ? v : undefined));

export const createCustomerSchema = z
  .object({
    name: requiredString('Customer name', 150),
    mobile: mobileSchema,
    email: optionalEmail,
    businessName: optionalTrimmedString(150),
    gstNumber: optionalGst,
    customerType: customerTypeSchema,
    address: optionalTrimmedString(500),
    status: customerStatusSchema.default('LEAD'),
    followUpDate: optionalDate,
    notes: optionalTrimmedString(2000),
  })
  .strict();

/**
 * PATCH semantics: every field optional, but `null` is an explicit "clear this".
 * `.strict()` rejects unknown keys so typos surface as 400 instead of silently
 * doing nothing.
 */
export const updateCustomerSchema = z
  .object({
    name: requiredString('Customer name', 150).optional(),
    mobile: mobileSchema.optional(),
    email: optionalEmail.nullable(),
    businessName: optionalTrimmedString(150).nullable(),
    gstNumber: optionalGst.nullable(),
    customerType: customerTypeSchema.optional(),
    address: optionalTrimmedString(500).nullable(),
    status: customerStatusSchema.optional(),
    followUpDate: optionalDate.nullable(),
    notes: optionalTrimmedString(2000).nullable(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const customerListQuerySchema = paginationQuerySchema
  .merge(searchQuerySchema)
  .extend({
    status: customerStatusSchema.optional(),
    type: customerTypeSchema.optional(),
    followUpBefore: dateOnlySchema.optional(),
    sortBy: z.enum(['createdAt', 'name', 'followUpDate', 'status']).default('createdAt'),
    sortOrder: sortOrderSchema('desc'),
  })
  .strict();

export const customerIdParamSchema = z.object({ id: uuidParam('Customer id') });

export const createFollowUpSchema = z
  .object({
    note: requiredString('Note', 2000),
    followUpDate: optionalDate,
  })
  .strict();

export const followUpListQuerySchema = paginationQuerySchema.extend({}).strict();

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;
