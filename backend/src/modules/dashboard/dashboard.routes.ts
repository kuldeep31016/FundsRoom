import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { sendOk } from '../../utils/http';
import { getSummary } from './dashboard.service';

const router = Router();

router.use(authenticate);

router.get(
  '/summary',
  requirePermission('dashboard:read'),
  asyncHandler(async (_req, res) => {
    sendOk(res, await getSummary());
  }),
);

export default router;
