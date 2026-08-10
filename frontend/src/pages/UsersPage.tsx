import { useState } from 'react';
import { useApiResource } from '../hooks/useApiResource';
import { formatDate, titleCase } from '../lib/format';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  PageHeader,
  Pagination,
  TableSkeleton,
} from '../components/ui';
import { ROLES, type Role } from '../types/api';

interface PortalUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

/** Human-readable summary of what each role may do — mirrors the backend matrix. */
const ROLE_SUMMARY: Record<Role, string> = {
  ADMIN: 'Full access, including user administration',
  SALES: 'Customers, follow-ups and sales challans',
  WAREHOUSE: 'Products, stock movements, challan dispatch',
  ACCOUNTS: 'Read-only access across all modules',
};

const ROLE_VARIANT: Record<Role, 'success' | 'info' | 'warning' | 'neutral'> = {
  ADMIN: 'success',
  SALES: 'info',
  WAREHOUSE: 'warning',
  ACCOUNTS: 'neutral',
};

export function UsersPage() {
  const [page, setPage] = useState(1);
  const { data, meta, isLoading, error, refetch } = useApiResource<PortalUser[]>('/users', {
    page,
    limit: 10,
  });

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Portal accounts and the role assigned to each. Administrators only."
      />

      <div className="stack">
        <Card>
          <CardHeader title="Role permissions" subtitle="What each role is allowed to do" />
          <CardBody>
            <div className="detail-grid">
              {ROLES.map((role) => (
                <div className="detail" key={role}>
                  <div className="detail__label">
                    <Badge variant={ROLE_VARIANT[role]}>{titleCase(role)}</Badge>
                  </div>
                  <div className="detail__value text-sm text-muted">{ROLE_SUMMARY[role]}</div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Accounts" />
          <CardBody flush>
            {isLoading && !data ? (
              <TableSkeleton rows={5} columns={4} />
            ) : error ? (
              <ErrorState title="Could not load users" message={error.message} onRetry={refetch} />
            ) : (
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data ?? []).map((user) => (
                      <tr key={user.id}>
                        <td className="table__primary">{user.name}</td>
                        <td className="text-muted">{user.email}</td>
                        <td>
                          <Badge variant={ROLE_VARIANT[user.role]}>{titleCase(user.role)}</Badge>
                        </td>
                        <td>
                          <Badge variant={user.isActive ? 'success' : 'neutral'}>
                            {user.isActive ? 'Active' : 'Disabled'}
                          </Badge>
                        </td>
                        <td className="text-muted nowrap">{formatDate(user.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
          {meta ? (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              limit={meta.limit}
              onPageChange={setPage}
              isLoading={isLoading}
            />
          ) : null}
        </Card>
      </div>
    </>
  );
}
