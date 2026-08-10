import { Router } from 'express';
import { pool } from '../db/pool';
import { ROLE_PERMISSIONS, ROLES } from '../config/permissions';
import { asyncHandler } from '../utils/async-handler';
import { sendOk } from '../utils/http';
import authRoutes from '../modules/auth/auth.routes';
import customerRoutes from '../modules/customers/customer.routes';
import productRoutes from '../modules/products/product.routes';
import stockRoutes from '../modules/stock/stock.routes';
import challanRoutes from '../modules/challans/challan.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import userRoutes from '../modules/users/user.routes';

const router = Router();

/** Public liveness/readiness probe — also verifies the database connection. */
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    await pool.query('SELECT 1');
    sendOk(res, {
      status: 'ok',
      service: 'erp-crm-api',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  }),
);

/** Public: lets the frontend render the permission matrix without hardcoding it. */
router.get('/meta/roles', (_req, res) => {
  sendOk(
    res,
    ROLES.map((role) => ({ role, permissions: ROLE_PERMISSIONS[role] })),
  );
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/customers', customerRoutes);
router.use('/products', productRoutes);
router.use('/stock', stockRoutes);
router.use('/challans', challanRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
