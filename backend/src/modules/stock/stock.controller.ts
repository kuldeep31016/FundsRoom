import type { Request, Response } from 'express';
import { requireUser } from '../../middleware/auth.middleware';
import { sendCreated, sendPaginated } from '../../utils/http';
import { serializeStockMovement } from '../../utils/serializers';
import * as service from './stock.service';
import type { CreateStockMovementInput, StockMovementListQuery } from './stock.schema';

/** GET /stock/movements */
export async function listMovements(req: Request, res: Response): Promise<void> {
  const params = req.query as unknown as StockMovementListQuery;
  const { rows, total } = await service.listMovements(params);
  sendPaginated(res, rows.map(serializeStockMovement), {
    page: params.page,
    limit: params.limit,
    total,
  });
}

/** POST /stock/movements */
export async function createMovement(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const { movement, newStock } = await service.createManualMovement(
    req.body as CreateStockMovementInput,
    user.id,
  );
  sendCreated(res, { movement: serializeStockMovement(movement), currentStock: newStock });
}
