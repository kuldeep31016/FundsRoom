import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError, api } from '../lib/api-client';
import { useApiResource } from '../hooks/useApiResource';
import { formatDate, titleCase } from '../lib/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
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
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<{ user: PortalUser; activate: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, meta, isLoading, error, refetch } = useApiResource<PortalUser[]>('/users', {
    page,
    limit: 10,
  });

  const awaitingApproval = (data ?? []).filter((user) => !user.isActive).length;

  async function applyStatus() {
    if (!pending) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      await api.patch(`/users/${pending.user.id}`, { isActive: pending.activate });
      toast.success(
        pending.activate ? 'Account activated' : 'Account suspended',
        pending.activate
          ? `${pending.user.name} can now sign in.`
          : `${pending.user.name} can no longer sign in.`,
      );
      setPending(null);
      refetch();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not update the account. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Portal accounts and the role assigned to each. Administrators only."
      />

      <div className="stack">
        {awaitingApproval > 0 ? (
          <Alert variant="warning" title="Accounts awaiting approval">
            {awaitingApproval} registered {awaitingApproval === 1 ? 'account is' : 'accounts are'}{' '}
            inactive. Nobody can sign in until an administrator activates them.
          </Alert>
        ) : null}

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
          <CardHeader
            title="Accounts"
            subtitle="Activate a newly registered account, or suspend one that should lose access"
          />
          <CardBody flush>
            {isLoading && !data ? (
              <TableSkeleton rows={5} columns={5} />
            ) : error ? (
              <ErrorState title="Could not load users" message={error.message} onRetry={refetch} />
            ) : (
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 680 }}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {(data ?? []).map((user) => {
                      const isSelf = user.id === currentUser?.id;
                      return (
                        <tr key={user.id}>
                          <td className="table__primary">
                            {user.name}
                            {isSelf ? <span className="text-subtle text-xs"> · you</span> : null}
                          </td>
                          <td className="text-muted">{user.email}</td>
                          <td>
                            <Badge variant={ROLE_VARIANT[user.role]}>{titleCase(user.role)}</Badge>
                          </td>
                          <td>
                            <Badge variant={user.isActive ? 'success' : 'warning'}>
                              {user.isActive ? 'Active' : 'Awaiting approval'}
                            </Badge>
                          </td>
                          <td className="text-muted nowrap">{formatDate(user.createdAt)}</td>
                          <td>
                            <div className="table__actions">
                              {isSelf ? (
                                // Deactivating your own account would revoke the very
                                // session doing it; the API rejects it too.
                                <span className="text-subtle text-xs nowrap">—</span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant={user.isActive ? 'ghost' : 'primary'}
                                  onClick={() => {
                                    setActionError(null);
                                    setPending({ user, activate: !user.isActive });
                                  }}
                                >
                                  {user.isActive ? 'Suspend' : 'Activate'}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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

      {pending ? (
        <ConfirmDialog
          title={pending.activate ? 'Activate this account?' : 'Suspend this account?'}
          message={
            pending.activate ? (
              <>
                <strong>{pending.user.name}</strong> ({pending.user.email}) will be able to sign in
                immediately with <strong>{titleCase(pending.user.role)}</strong> access.
              </>
            ) : (
              <>
                <strong>{pending.user.name}</strong> will be signed out and blocked from signing in
                again until reactivated.
              </>
            )
          }
          confirmLabel={pending.activate ? 'Activate account' : 'Suspend account'}
          variant={pending.activate ? 'primary' : 'danger'}
          isSubmitting={isSubmitting}
          onCancel={() => setPending(null)}
          onConfirm={applyStatus}
        >
          {actionError ? <Alert variant="danger">{actionError}</Alert> : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
