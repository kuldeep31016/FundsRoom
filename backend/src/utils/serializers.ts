import type {
  ChallanItemRecord,
  ChallanRecord,
  CustomerRecord,
  FollowUpRecord,
  ProductRecord,
  StockMovementRecord,
} from '../types/domain';

/**
 * Database rows use snake_case; the public API uses camelCase.
 * Keeping the translation in one place means a column rename never leaks into
 * the API contract and the frontend types stay stable.
 */

function isoDate(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function serializeCustomer(row: CustomerRecord) {
  return {
    id: row.id,
    name: row.name,
    mobile: row.mobile,
    email: row.email,
    businessName: row.business_name,
    gstNumber: row.gst_number,
    customerType: row.customer_type,
    address: row.address,
    status: row.status,
    followUpDate: isoDate(row.follow_up_date),
    notes: row.notes,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    followUpCount: row.follow_up_count ?? undefined,
    createdAt: isoDate(row.created_at),
    updatedAt: isoDate(row.updated_at),
  };
}

export function serializeFollowUp(row: FollowUpRecord) {
  return {
    id: row.id,
    customerId: row.customer_id,
    note: row.note,
    followUpDate: isoDate(row.follow_up_date),
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    createdAt: isoDate(row.created_at),
  };
}

export function serializeProduct(row: ProductRecord) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    unitPrice: row.unit_price,
    currentStock: row.current_stock,
    minStockAlert: row.min_stock_alert,
    location: row.location,
    isActive: row.is_active,
    imageKey: row.image_key,
    imageMimeType: row.image_mime_type,
    imageSize: row.image_size,
    imageUpdatedAt: isoDate(row.image_updated_at),
    // Populated by `withImageUrls`; null when storage is not configured.
    imageUrl: null as string | null,
    // Derived flag so every consumer applies the same low-stock rule.
    isLowStock: row.current_stock <= row.min_stock_alert,
    stockValue: Number((row.current_stock * row.unit_price).toFixed(2)),
    createdBy: row.created_by,
    createdAt: isoDate(row.created_at),
    updatedAt: isoDate(row.updated_at),
  };
}

export function serializeStockMovement(row: StockMovementRecord) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name ?? null,
    productSku: row.product_sku ?? null,
    movementType: row.movement_type,
    quantity: row.quantity,
    quantityChange: row.quantity_change,
    stockBefore: row.stock_before,
    stockAfter: row.stock_after,
    reason: row.reason,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    createdAt: isoDate(row.created_at),
  };
}

export function serializeChallanItem(row: ChallanItemRecord) {
  return {
    id: row.id,
    challanId: row.challan_id,
    productId: row.product_id,
    // Snapshot fields — the values as they were when the challan was raised.
    productName: row.product_name,
    productSku: row.product_sku,
    productCategory: row.product_category,
    productLocation: row.product_location,
    unitPrice: row.unit_price,
    quantity: row.quantity,
    lineTotal: row.line_total,
    currentStock: row.current_stock ?? null,
    createdAt: isoDate(row.created_at),
  };
}

export function serializeChallan(row: ChallanRecord, items?: ChallanItemRecord[]) {
  return {
    id: row.id,
    challanNumber: row.challan_number,
    customerId: row.customer_id,
    customer: row.customer_name
      ? {
          id: row.customer_id,
          name: row.customer_name,
          businessName: row.customer_business_name ?? null,
          mobile: row.customer_mobile ?? null,
        }
      : null,
    status: row.status,
    totalQuantity: row.total_quantity,
    totalAmount: row.total_amount,
    itemCount: row.item_count ?? items?.length ?? undefined,
    notes: row.notes,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    confirmedBy: row.confirmed_by,
    confirmedByName: row.confirmed_by_name ?? null,
    confirmedAt: isoDate(row.confirmed_at),
    cancelledBy: row.cancelled_by,
    cancelledByName: row.cancelled_by_name ?? null,
    cancelledAt: isoDate(row.cancelled_at),
    cancellationReason: row.cancellation_reason,
    createdAt: isoDate(row.created_at),
    updatedAt: isoDate(row.updated_at),
    ...(items ? { items: items.map(serializeChallanItem) } : {}),
  };
}
