import type { Role } from '../config/permissions';

// Declared as const tuples so both the TypeScript union and the Zod enum can be
// derived from one list — the API can never validate a value the type rejects.
export const CUSTOMER_TYPES = ['RETAIL', 'WHOLESALE', 'DISTRIBUTOR'] as const;
export const CUSTOMER_STATUSES = ['LEAD', 'ACTIVE', 'INACTIVE'] as const;
export const STOCK_MOVEMENT_TYPES = ['IN', 'OUT'] as const;
export const CHALLAN_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;

export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];
export type ChallanStatus = (typeof CHALLAN_STATUSES)[number];

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerRecord {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  business_name: string | null;
  gst_number: string | null;
  customer_type: CustomerType;
  address: string | null;
  status: CustomerStatus;
  follow_up_date: Date | string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  created_by_name?: string | null;
  follow_up_count?: number;
}

export interface FollowUpRecord {
  id: string;
  customer_id: string;
  note: string;
  follow_up_date: Date | string | null;
  created_by: string | null;
  created_at: Date;
  created_by_name?: string | null;
}

export interface ProductRecord {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit_price: number;
  current_stock: number;
  min_stock_alert: number;
  location: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface StockMovementRecord {
  id: string;
  product_id: string;
  movement_type: StockMovementType;
  quantity: number;
  quantity_change: number;
  stock_before: number;
  stock_after: number;
  reason: string;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
  created_at: Date;
  product_name?: string;
  product_sku?: string;
  created_by_name?: string | null;
}

export interface ChallanRecord {
  id: string;
  challan_number: string;
  customer_id: string;
  status: ChallanStatus;
  total_quantity: number;
  total_amount: number;
  notes: string | null;
  created_by: string | null;
  confirmed_by: string | null;
  confirmed_at: Date | null;
  cancelled_by: string | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  created_at: Date;
  updated_at: Date;
  customer_name?: string;
  customer_business_name?: string | null;
  customer_mobile?: string;
  created_by_name?: string | null;
  confirmed_by_name?: string | null;
  cancelled_by_name?: string | null;
  item_count?: number;
}

export interface ChallanItemRecord {
  id: string;
  challan_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  product_category: string | null;
  product_location: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  created_at: Date;
  /** Live stock of the referenced product — used by the UI, never persisted. */
  current_stock?: number;
}
