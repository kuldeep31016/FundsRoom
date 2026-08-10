import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { validateBody, validateQuery } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import * as controller from './stock.controller';
import { createStockMovementSchema, stockMovementListQuerySchema } from './stock.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/movements',
  requirePermission('stock:read'),
  validateQuery(stockMovementListQuerySchema),
  asyncHandler(controller.listMovements),
);

router.post(
  '/movements',
  requirePermission('stock:write'),
  validateBody(createStockMovementSchema),
  asyncHandler(controller.createMovement),
);

export default router;
