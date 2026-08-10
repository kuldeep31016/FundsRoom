import type { Request, Response } from 'express';
import { requireUser } from '../../middleware/auth.middleware';
import { sendCreated, sendOk, sendPaginated } from '../../utils/http';
import { serializeCustomer, serializeFollowUp } from '../../utils/serializers';
import * as service from './customer.service';
import type {
  CreateCustomerInput,
  CreateFollowUpInput,
  CustomerListQuery,
  UpdateCustomerInput,
} from './customer.schema';

/** GET /customers */
export async function listCustomers(req: Request, res: Response): Promise<void> {
  const params = req.query as unknown as CustomerListQuery;
  const { rows, total } = await service.list(params);
  sendPaginated(res, rows.map(serializeCustomer), {
    page: params.page,
    limit: params.limit,
    total,
  });
}

/** POST /customers */
export async function createCustomer(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const customer = await service.create(req.body as CreateCustomerInput, user.id);
  sendCreated(res, serializeCustomer(customer));
}

/** GET /customers/:id */
export async function getCustomer(req: Request, res: Response): Promise<void> {
  const customer = await service.getById(req.params.id as string);
  sendOk(res, serializeCustomer(customer));
}

/** PATCH /customers/:id (also mounted as PUT) */
export async function updateCustomer(req: Request, res: Response): Promise<void> {
  const customer = await service.update(req.params.id as string, req.body as UpdateCustomerInput);
  sendOk(res, serializeCustomer(customer));
}

/** GET /customers/:id/follow-ups */
export async function listFollowUps(req: Request, res: Response): Promise<void> {
  const params = req.query as unknown as { page: number; limit: number };
  const { rows, total } = await service.listFollowUps(req.params.id as string, params);
  sendPaginated(res, rows.map(serializeFollowUp), {
    page: params.page,
    limit: params.limit,
    total,
  });
}

/** POST /customers/:id/follow-ups */
export async function createFollowUp(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const { followUp, customer } = await service.addFollowUp(
    req.params.id as string,
    req.body as CreateFollowUpInput,
    user.id,
  );
  sendCreated(res, {
    followUp: serializeFollowUp(followUp),
    customer: serializeCustomer(customer),
  });
}
