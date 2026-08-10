import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { paginationQuerySchema } from '../../validation/common';
import * as controller from './product.controller';
import {
  createProductSchema,
  productIdParamSchema,
  productListQuerySchema,
  updateProductSchema,
} from './product.schema';

const router = Router();

router.use(authenticate);

// Declared before "/:id" so the literal path is not captured as a UUID param.
router.get('/categories', requirePermission('products:read'), asyncHandler(controller.listCategories));

router.get(
  '/',
  requirePermission('products:read'),
  validateQuery(productListQuerySchema),
  asyncHandler(controller.listProducts),
);

router.post(
  '/',
  requirePermission('products:write'),
  validateBody(createProductSchema),
  asyncHandler(controller.createProduct),
);

router.get(
  '/:id',
  requirePermission('products:read'),
  validateParams(productIdParamSchema),
  asyncHandler(controller.getProduct),
);

router.patch(
  '/:id',
  requirePermission('products:write'),
  validateParams(productIdParamSchema),
  validateBody(updateProductSchema),
  asyncHandler(controller.updateProduct),
);
router.put(
  '/:id',
  requirePermission('products:write'),
  validateParams(productIdParamSchema),
  validateBody(updateProductSchema),
  asyncHandler(controller.updateProduct),
);

router.get(
  '/:id/stock-movements',
  requirePermission('stock:read'),
  validateParams(productIdParamSchema),
  validateQuery(paginationQuerySchema.strict()),
  asyncHandler(controller.getStockHistory),
);

export default router;
