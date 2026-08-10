/** Shapes returned by the backend REST API. Mirrors `backend/src/utils/serializers.ts`. */

export const ROLES = ['ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTS'] as const;
export type Role = (typeof ROLES)[number];

export const CUSTOMER_TYPES = ['RETAIL', 'WHOLESALE', 'DISTRIBUTOR'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_STATUSES = ['LEAD', 'ACTIVE', 'INACTIVE'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const CHALLAN_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
export type ChallanStatus = (typeof CHALLAN_STATUSES)[number];

export const MOVEMENT_TYPES = ['IN', 'OUT'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export type Permission =
  | 'users:read'
  | 'users:write'
  | 'customers:read'
  | 'customers:write'
  | 'customers:followup:write'
  | 'products:read'
  | 'products:write'
  | 'stock:read'
  | 'stock:write'
  | 'challans:read'
  | 'challans:write'
  | 'challans:confirm'
  | 'challans:cancel'
  | 'dashboard:read';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  permissions: Permission[];
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  token: string;
  expiresIn: string;
  user: AuthUser;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  businessName: string | null;
  gstNumber: string | null;
  customerType: CustomerType;
  address: string | null;
  status: CustomerStatus;
  followUpDate: string | null;
  notes: string | null;
  createdBy: string | null;
  createdByName: string | null;
  followUpCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUp {
  id: string;
  customerId: string;
  note: string;
  followUpDate: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  unitPrice: number;
  currentStock: number;
  minStockAlert: number;
  location: string | null;
  isActive: boolean;
  isLowStock: boolean;
  stockValue: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string | null;
  productSku: string | null;
  movementType: MovementType;
  quantity: number;
  quantityChange: number;
  stockBefore: number;
  stockAfter: number;
  reason: string;
  referenceType: string | null;
  referenceId: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

/** A challan line. The `product*` fields are the snapshot taken at creation. */
export interface ChallanItem {
  id: string;
  challanId: string;
  productId: string;
  productName: string;
  productSku: string;
  productCategory: string | null;
  productLocation: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  currentStock: number | null;
  createdAt: string;
}

export interface Challan {
  id: string;
  challanNumber: string;
  customerId: string;
  customer: { id: string; name: string; businessName: string | null; mobile: string | null } | null;
  status: ChallanStatus;
  totalQuantity: number;
  totalAmount: number;
  itemCount?: number;
  notes: string | null;
  createdBy: string | null;
  createdByName: string | null;
  confirmedBy: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  cancelledBy: string | null;
  cancelledByName: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  items?: ChallanItem[];
}

export interface DashboardSummary {
  customers: { total: number; active: number; leads: number };
  products: { total: number; lowStock: number; stockValue: number };
  challans: {
    total: number;
    draft: number;
    confirmed: number;
    cancelled: number;
    confirmedAmount: number;
    confirmedQuantity: number;
  };
  lowStockProducts: Product[];
  upcomingFollowUps: Customer[];
  recentChallans: Challan[];
}
