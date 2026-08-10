/**
 * Role → permission matrix.
 *
 * The case study names the four roles but does not spell out what each one may
 * do, so the matrix below is a documented, business-sensible interpretation
 * (see README → "Role-Based Access"). It is the single source of truth: the
 * backend enforces it via `requirePermission`, and the frontend reads the same
 * permission names (mirrored in `frontend/src/lib/permissions.ts`) purely to
 * hide controls the user cannot use.
 */
export const ROLES = ['ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTS'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'users:read',
  'users:write',

  'customers:read',
  'customers:write',
  'customers:followup:write',

  'products:read',
  'products:write',

  'stock:read',
  'stock:write',

  'challans:read',
  'challans:write',
  'challans:confirm',
  'challans:cancel',

  'dashboard:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const SALES_PERMISSIONS: Permission[] = [
  'customers:read',
  'customers:write',
  'customers:followup:write',
  'products:read',
  'stock:read',
  'challans:read',
  'challans:write',
  'challans:confirm',
  'challans:cancel',
  'dashboard:read',
];

const WAREHOUSE_PERMISSIONS: Permission[] = [
  'customers:read',
  'products:read',
  'products:write',
  'stock:read',
  'stock:write',
  'challans:read',
  'challans:confirm',
  'challans:cancel',
  'dashboard:read',
];

// Accounts is a read-only, reporting-oriented role in this system: there is no
// invoicing module in scope, so there is nothing for it to mutate.
const ACCOUNTS_PERMISSIONS: Permission[] = [
  'customers:read',
  'products:read',
  'stock:read',
  'challans:read',
  'dashboard:read',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  SALES: SALES_PERMISSIONS,
  WAREHOUSE: WAREHOUSE_PERMISSIONS,
  ACCOUNTS: ACCOUNTS_PERMISSIONS,
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
