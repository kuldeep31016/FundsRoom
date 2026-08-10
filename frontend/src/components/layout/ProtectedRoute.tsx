import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, Spinner } from '../ui';
import type { Permission } from '../../types/api';

/**
 * Route guard.
 *
 * Unauthenticated visitors are sent to the login screen (remembering where they
 * were headed). Authenticated users lacking the required permission get a clear
 * "no access" screen rather than a broken page.
 *
 * This is UX, not security: the API independently rejects any request the role
 * is not entitled to make.
 */
export function ProtectedRoute({
  children,
  permission,
}: {
  children: ReactNode;
  permission?: Permission;
}) {
  const { isAuthenticated, isInitialising, can, user } = useAuth();
  const location = useLocation();

  if (isInitialising) {
    return (
      <div className="full-page-loader">
        <Spinner large />
        <p className="text-muted text-sm">Restoring your session…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (permission && !can(permission)) {
    return (
      <EmptyState
        icon="⛔"
        title="You do not have access to this section"
        message={`Your role (${user?.role}) is not permitted to view this page. Contact an administrator if you believe this is a mistake.`}
      />
    );
  }

  return <>{children}</>;
}
