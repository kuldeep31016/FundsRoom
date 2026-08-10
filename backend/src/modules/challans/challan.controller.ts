import type { Request, Response } from 'express';
import { requireUser } from '../../middleware/auth.middleware';
import { sendCreated, sendOk, sendPaginated } from '../../utils/http';
import { serializeChallan } from '../../utils/serializers';
import * as service from './challan.service';
import type {
  CancelChallanInput,
  ChallanListQuery,
  CreateChallanInput,
  UpdateChallanInput,
} from './challan.schema';

/** GET /challans */
export async function listChallans(req: Request, res: Response): Promise<void> {
  const params = req.query as unknown as ChallanListQuery;
  const { rows, total } = await service.list(params);
  sendPaginated(res, rows.map((row) => serializeChallan(row)), {
    page: params.page,
    limit: params.limit,
    total,
  });
}

/** POST /challans */
export async function createChallan(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const { challan, items } = await service.create(req.body as CreateChallanInput, user.id);
  sendCreated(res, serializeChallan(challan, items));
}

/** GET /challans/:id */
export async function getChallan(req: Request, res: Response): Promise<void> {
  const { challan, items } = await service.getById(req.params.id as string);
  sendOk(res, serializeChallan(challan, items));
}

/** PATCH /challans/:id — draft only */
export async function updateChallan(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const { challan, items } = await service.update(
    req.params.id as string,
    req.body as UpdateChallanInput,
    user.id,
  );
  sendOk(res, serializeChallan(challan, items));
}

/** POST /challans/:id/confirm */
export async function confirmChallan(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const { challan, items } = await service.confirm(req.params.id as string, user.id);
  sendOk(res, serializeChallan(challan, items));
}

/** POST /challans/:id/cancel */
export async function cancelChallan(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const { challan, items } = await service.cancel(
    req.params.id as string,
    req.body as CancelChallanInput,
    user.id,
  );
  sendOk(res, serializeChallan(challan, items));
}
