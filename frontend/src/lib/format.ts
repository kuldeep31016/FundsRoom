import type { ChallanStatus, CustomerStatus, CustomerType, MovementType } from '../types/api';

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-IN');

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return currencyFormatter.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return numberFormatter.format(value);
}

/** 'YYYY-MM-DD' or ISO timestamp -> '12 Aug 2026'. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** ISO timestamp -> '12 Aug 2026, 14:05'. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })}, ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

/** ISO date -> 'in 3 days' / 'today' / '2 days overdue'. */
export function formatRelativeDueDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const target = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(target.getTime())) return null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - startOfToday.getTime()) / 86_400_000);

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return '1 day overdue';
  if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
  return `in ${diffDays} days`;
}

export function isOverdue(value: string | null | undefined): boolean {
  if (!value) return false;
  const target = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return target.getTime() < startOfToday.getTime();
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

/** Badge variants keep status colours identical everywhere they appear. */
export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const CHALLAN_STATUS_VARIANT: Record<ChallanStatus, BadgeVariant> = {
  DRAFT: 'warning',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
};

export const CUSTOMER_STATUS_VARIANT: Record<CustomerStatus, BadgeVariant> = {
  LEAD: 'info',
  ACTIVE: 'success',
  INACTIVE: 'neutral',
};

export const CUSTOMER_TYPE_VARIANT: Record<CustomerType, BadgeVariant> = {
  RETAIL: 'neutral',
  WHOLESALE: 'info',
  DISTRIBUTOR: 'success',
};

export const MOVEMENT_TYPE_VARIANT: Record<MovementType, BadgeVariant> = {
  IN: 'success',
  OUT: 'danger',
};
