import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import * as controller from './challan.controller';
import {
  cancelChallanSchema,
  challanIdParamSchema,
  challanListQuerySchema,
  createChallanSchema,
  updateChallanSchema,
} from './challan.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission('challans:read'),
  validateQuery(challanListQuerySchema),
  asyncHandler(controller.listChallans),
);

router.post(
  '/',
  requirePermission('challans:write'),
  validateBody(createChallanSchema),
  asyncHandler(controller.createChallan),
);

router.get(
  '/:id',
  requirePermission('challans:read'),
  validateParams(challanIdParamSchema),
  asyncHandler(controller.getChallan),
);

router.patch(
  '/:id',
  requirePermission('challans:write'),
  validateParams(challanIdParamSchema),
  validateBody(updateChallanSchema),
  asyncHandler(controller.updateChallan),
);
router.put(
  '/:id',
  requirePermission('challans:write'),
  validateParams(challanIdParamSchema),
  validateBody(updateChallanSchema),
  asyncHandler(controller.updateChallan),
);

router.post(
  '/:id/confirm',
  requirePermission('challans:confirm'),
  validateParams(challanIdParamSchema),
  asyncHandler(controller.confirmChallan),
);

router.post(
  '/:id/cancel',
  requirePermission('challans:cancel'),
  validateParams(challanIdParamSchema),
  validateBody(cancelChallanSchema),
  asyncHandler(controller.cancelChallan),
);

export default router;
