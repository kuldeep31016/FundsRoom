import { withTransaction, type Queryable } from '../../db/pool';
import { ApiError, ERROR_CODES } from '../../utils/api-error';
import type { ChallanItemRecord, ChallanRecord } from '../../types/domain';
import { findCustomerById } from '../customers/customer.repository';
import { lockProductForUpdate } from '../products/product.repository';
import { applyStockMovement, STOCK_REFERENCE } from '../stock/stock.service';
import * as repository from './challan.repository';
import type {
  CancelChallanInput,
  ChallanListQuery,
  CreateChallanInput,
  UpdateChallanInput,
} from './challan.schema';

/** A line item after the product has been looked up, locked and snapshotted. */
interface ResolvedItem {
  productId: string;
  productName: string;
  productSku: string;
  productCategory: string | null;
  productLocation: string | null;
  unitPrice: number;
  quantity: number;
  availableStock: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Collapse repeated products into a single line and return them sorted by
 * product id.
 *
 * Sorting matters: every transaction that touches products acquires row locks in
 * the same order, which removes the classic two-transaction deadlock.
 */
function normaliseItems(items: { productId: string; quantity: number }[]): {
  productId: string;
  quantity: number;
}[] {
  const merged = new Map<string, number>();
  for (const item of items) {
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
  }
  return [...merged.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => (a.productId < b.productId ? -1 : 1));
}

/**
 * RULE 5 — build the product snapshot.
 *
 * Name, SKU, category, location and unit price are copied onto the line at the
 * moment the challan is written. Later edits to the product master never alter
 * an existing challan.
 */
async function resolveItems(
  db: Queryable,
  rawItems: { productId: string; quantity: number }[],
): Promise<ResolvedItem[]> {
  const normalised = normaliseItems(rawItems);
  const resolved: ResolvedItem[] = [];

  for (const item of normalised) {
    const product = await lockProductForUpdate(db, item.productId);
    if (!product) {
      throw new ApiError(404, ERROR_CODES.NOT_FOUND, `Product ${item.productId} not found.`);
    }
    if (!product.is_active) {
      throw ApiError.conflict(
        `Product "${product.name}" (${product.sku}) is inactive and cannot be added to a challan.`,
      );
    }
    resolved.push({
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      productCategory: product.category,
      productLocation: product.location,
      unitPrice: product.unit_price,
      quantity: item.quantity,
      availableStock: product.current_stock,
    });
  }

  return resolved;
}

/**
 * RULE 3 — check every line before touching any stock.
 *
 * Running this ahead of the deductions means the caller gets one error listing
 * *all* shortfalls, and it makes the "no partial update" guarantee obvious in
 * the code (the transaction is still untouched at this point).
 */
function assertStockAvailable(items: { productName: string; productSku: string; quantity: number; availableStock: number; productId: string }[]): void {
  const shortfalls = items
    .filter((item) => item.quantity > item.availableStock)
    .map((item) => ({
      productId: item.productId,
      productName: item.productName,
      sku: item.productSku,
      requestedQuantity: item.quantity,
      availableStock: item.availableStock,
      shortfall: item.quantity - item.availableStock,
    }));

  if (shortfalls.length > 0) {
    const summary = shortfalls
      .map((s) => `${s.productName} (${s.sku}): requested ${s.requestedQuantity}, available ${s.availableStock}`)
      .join('; ');
    throw ApiError.conflict(
      `Insufficient stock — ${summary}. No stock has been deducted.`,
      ERROR_CODES.INSUFFICIENT_STOCK,
      { shortfalls },
    );
  }
}

function totalsFor(items: { quantity: number; unitPrice: number }[]): {
  totalQuantity: number;
  totalAmount: number;
} {
  return {
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: round2(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)),
  };
}

/** Deduct stock for every line and write the OUT movements. Caller holds the tx. */
async function postStockOut(
  db: Queryable,
  challan: ChallanRecord,
  items: { productId: string; quantity: number }[],
  userId: string,
): Promise<void> {
  for (const item of items) {
    await applyStockMovement(
      db,
      {
        productId: item.productId,
        movementType: 'OUT',
        quantity: item.quantity,
        reason: `Sales Challan ${challan.challan_number}`,
        referenceType: STOCK_REFERENCE.CHALLAN,
        referenceId: challan.id,
      },
      userId,
    );
  }
}

export async function list(
  params: ChallanListQuery,
): Promise<{ rows: ChallanRecord[]; total: number }> {
  return repository.listChallans(params);
}

export async function getById(
  id: string,
): Promise<{ challan: ChallanRecord; items: ChallanItemRecord[] }> {
  const challan = await repository.findChallanById(id);
  if (!challan) {
    throw ApiError.notFound('Challan');
  }
  const items = await repository.findChallanItems(id);
  return { challan, items };
}

/**
 * Create a challan, optionally confirming it in the same request.
 *
 * RULE 6 — the whole thing runs in one transaction: number allocation, header,
 * items, stock validation, stock deduction and movement logging. Any failure
 * rolls everything back, so a confirmed challan can never exist alongside
 * unchanged (or half-changed) inventory.
 */
export async function create(
  input: CreateChallanInput,
  userId: string,
): Promise<{ challan: ChallanRecord; items: ChallanItemRecord[] }> {
  return withTransaction(async (client) => {
    const customer = await findCustomerById(input.customerId, client);
    if (!customer) {
      throw ApiError.notFound('Customer');
    }

    const resolved = await resolveItems(client, input.items);

    // RULE 4: a draft never touches stock, so availability is only enforced when
    // the caller asks for an immediately-confirmed challan.
    if (input.status === 'CONFIRMED') {
      assertStockAvailable(resolved);
    }

    const totals = totalsFor(resolved);
    const challanNumber = await repository.nextChallanNumber(client, new Date().getFullYear());

    // Always inserted as DRAFT first: the CHECK constraint requires confirmed_at
    // to be set whenever status is CONFIRMED, and `markConfirmed` does both.
    let challan = await repository.insertChallan(client, {
      challanNumber,
      customerId: input.customerId,
      status: 'DRAFT',
      totalQuantity: totals.totalQuantity,
      totalAmount: totals.totalAmount,
      notes: input.notes ?? null,
      createdBy: userId,
    });

    const items = await repository.insertChallanItems(
      client,
      resolved.map((item) => ({
        challanId: challan.id,
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        productCategory: item.productCategory,
        productLocation: item.productLocation,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
    );

    if (input.status === 'CONFIRMED') {
      await postStockOut(client, challan, resolved, userId);
      challan = await repository.markConfirmed(client, challan.id, userId);
    }

    // Re-read through the joined query so the response carries customer and
    // actor names rather than bare foreign keys.
    return { challan: (await repository.findChallanById(challan.id, client)) ?? challan, items };
  });
}

/** Edit a challan. Only DRAFT challans are editable. */
export async function update(
  id: string,
  input: UpdateChallanInput,
  _userId: string,
): Promise<{ challan: ChallanRecord; items: ChallanItemRecord[] }> {
  return withTransaction(async (client) => {
    const existing = await repository.lockChallanForUpdate(client, id);
    if (!existing) {
      throw ApiError.notFound('Challan');
    }
    if (existing.status !== 'DRAFT') {
      throw ApiError.conflict(
        `Only draft challans can be edited. This challan is ${existing.status}.`,
        ERROR_CODES.INVALID_STATE_TRANSITION,
        { currentStatus: existing.status },
      );
    }

    const customerId = input.customerId ?? existing.customer_id;
    if (input.customerId) {
      const customer = await findCustomerById(input.customerId, client);
      if (!customer) {
        throw ApiError.notFound('Customer');
      }
    }

    let items: ChallanItemRecord[];
    let totals: { totalQuantity: number; totalAmount: number };

    if (input.items) {
      // Re-snapshot against the current product master, then replace the lines.
      const resolved = await resolveItems(client, input.items);
      totals = totalsFor(resolved);
      await repository.deleteChallanItems(client, id);
      items = await repository.insertChallanItems(
        client,
        resolved.map((item) => ({
          challanId: id,
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          productCategory: item.productCategory,
          productLocation: item.productLocation,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
        })),
      );
    } else {
      items = await repository.findChallanItems(id, client);
      totals = totalsFor(items.map((i) => ({ quantity: i.quantity, unitPrice: i.unit_price })));
    }

    const notes = input.notes === undefined ? existing.notes : input.notes;
    const challan = await repository.updateChallanHeader(client, id, {
      customerId,
      notes,
      totalQuantity: totals.totalQuantity,
      totalAmount: totals.totalAmount,
    });

    return { challan: (await repository.findChallanById(id, client)) ?? challan, items };
  });
}

/**
 * RULE 1 — confirming a draft deducts stock and records an OUT movement per line.
 * RULE 2/3 — availability is verified for every line first; a shortfall aborts
 * the transaction before a single unit has moved.
 */
export async function confirm(
  id: string,
  userId: string,
): Promise<{ challan: ChallanRecord; items: ChallanItemRecord[] }> {
  return withTransaction(async (client) => {
    const existing = await repository.lockChallanForUpdate(client, id);
    if (!existing) {
      throw ApiError.notFound('Challan');
    }
    if (existing.status === 'CONFIRMED') {
      // Guards against a double-click deducting stock twice.
      throw ApiError.conflict(
        `Challan ${existing.challan_number} is already confirmed.`,
        ERROR_CODES.INVALID_STATE_TRANSITION,
        { currentStatus: existing.status },
      );
    }
    if (existing.status === 'CANCELLED') {
      throw ApiError.conflict(
        `Challan ${existing.challan_number} is cancelled and cannot be confirmed.`,
        ERROR_CODES.INVALID_STATE_TRANSITION,
        { currentStatus: existing.status },
      );
    }

    const items = await repository.findChallanItems(id, client);
    if (items.length === 0) {
      throw ApiError.conflict(
        'A challan with no products cannot be confirmed.',
        ERROR_CODES.INVALID_STATE_TRANSITION,
      );
    }

    // Lock every referenced product (in product_id order) and validate up front.
    const locked: ResolvedItem[] = [];
    for (const item of items) {
      const product = await lockProductForUpdate(client, item.product_id);
      if (!product) {
        throw new ApiError(
          404,
          ERROR_CODES.NOT_FOUND,
          `Product ${item.product_name} (${item.product_sku}) no longer exists.`,
        );
      }
      locked.push({
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        productCategory: product.category,
        productLocation: product.location,
        unitPrice: item.unit_price,
        quantity: item.quantity,
        availableStock: product.current_stock,
      });
    }

    assertStockAvailable(locked);
    await postStockOut(client, existing, locked, userId);
    const challan = await repository.markConfirmed(client, id, userId);

    return {
      challan: (await repository.findChallanById(id, client)) ?? challan,
      items: await repository.findChallanItems(id, client),
    };
  });
}

/**
 * Cancel a challan.
 *
 * A DRAFT never moved stock, so cancelling it is a status change. A CONFIRMED
 * challan is reversed: every line is returned to inventory with an IN movement,
 * inside the same transaction as the status change.
 */
export async function cancel(
  id: string,
  input: CancelChallanInput,
  userId: string,
): Promise<{ challan: ChallanRecord; items: ChallanItemRecord[] }> {
  return withTransaction(async (client) => {
    const existing = await repository.lockChallanForUpdate(client, id);
    if (!existing) {
      throw ApiError.notFound('Challan');
    }
    if (existing.status === 'CANCELLED') {
      throw ApiError.conflict(
        `Challan ${existing.challan_number} is already cancelled.`,
        ERROR_CODES.INVALID_STATE_TRANSITION,
        { currentStatus: existing.status },
      );
    }

    if (existing.status === 'CONFIRMED') {
      const items = await repository.findChallanItems(id, client);
      for (const item of items) {
        await applyStockMovement(
          client,
          {
            productId: item.product_id,
            movementType: 'IN',
            quantity: item.quantity,
            reason: `Sales Challan ${existing.challan_number} cancelled — stock returned`,
            referenceType: STOCK_REFERENCE.CHALLAN,
            referenceId: existing.id,
          },
          userId,
        );
      }
    }

    const challan = await repository.markCancelled(client, id, userId, input.reason ?? null);
    return {
      challan: (await repository.findChallanById(id, client)) ?? challan,
      items: await repository.findChallanItems(id, client),
    };
  });
}
