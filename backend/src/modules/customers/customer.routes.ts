import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import * as controller from './customer.controller';
import {
  createCustomerSchema,
  createFollowUpSchema,
  customerIdParamSchema,
  customerListQuerySchema,
  followUpListQuerySchema,
  updateCustomerSchema,
} from './customer.schema';

const router = Router();

// Every customer route requires a valid JWT.
router.use(authenticate);

router.get(
  '/',
  requirePermission('customers:read'),
  validateQuery(customerListQuerySchema),
  asyncHandler(controller.listCustomers),
);

router.post(
  '/',
  requirePermission('customers:write'),
  validateBody(createCustomerSchema),
  asyncHandler(controller.createCustomer),
);

router.get(
  '/:id',
  requirePermission('customers:read'),
  validateParams(customerIdParamSchema),
  asyncHandler(controller.getCustomer),
);

// PATCH is the canonical partial update; PUT is accepted as an alias because the
// brief mentions "PUT/PATCH". Both apply the same partial-update semantics.
router.patch(
  '/:id',
  requirePermission('customers:write'),
  validateParams(customerIdParamSchema),
  validateBody(updateCustomerSchema),
  asyncHandler(controller.updateCustomer),
);
router.put(
  '/:id',
  requirePermission('customers:write'),
  validateParams(customerIdParamSchema),
  validateBody(updateCustomerSchema),
  asyncHandler(controller.updateCustomer),
);

router.get(
  '/:id/follow-ups',
  requirePermission('customers:read'),
  validateParams(customerIdParamSchema),
  validateQuery(followUpListQuerySchema),
  asyncHandler(controller.listFollowUps),
);

router.post(
  '/:id/follow-ups',
  requirePermission('customers:followup:write'),
  validateParams(customerIdParamSchema),
  validateBody(createFollowUpSchema),
  asyncHandler(controller.createFollowUp),
);

export default router;
