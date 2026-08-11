import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../lib/api-client';
import { EMAIL_PATTERN } from '../lib/validation';
import { Alert, Button, Spinner, TextField } from '../components/ui';
import type { Role } from '../types/api';

/**
 * Demo accounts created by `npm run seed`.
 *
 * Selecting a role signs in through the *real* `POST /auth/login` endpoint with
 * that account's credentials — it is a shortcut past typing, not a bypass of
 * authentication. The email/password form below remains available and is the
 * only path a genuine user would take.
 */
const DEMO_ROLES: Array<{
  role: Role;
  email: string;
  icon: string;
  blurb: string;
}> = [
  { role: 'ADMIN', email: 'admin@erpcrm.test', icon: '★', blurb: 'Everything, plus user administration' },
  { role: 'SALES', email: 'sales@erpcrm.test', icon: '☺', blurb: 'Customers, follow-ups and challans' },
  { role: 'WAREHOUSE', email: 'warehouse@erpcrm.test', icon: '▣', blurb: 'Products, stock and dispatch' },
  { role: 'ACCOUNTS', email: 'accounts@erpcrm.test', icon: '▤', blurb: 'Read-only across every module' },
];

const DEMO_PASSWORD = 'Password@123';

const CAPABILITIES = ['Customer CRM', 'Live inventory', 'Stock-safe challans', 'Role-based access'];

export function LoginPage() {
  const { login, isAuthenticated, isInitialising } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Which role card is mid-request, so only that card shows a spinner. */
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);

  if (isInitialising) {
    return (
      <div className="full-page-loader">
        <Spinner large />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const busy = isSubmitting || pendingRole !== null;

  function goToIntendedPage() {
    const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
    navigate(from && from !== '/login' ? from : '/', { replace: true });
  }

  function reportFailure(error: unknown) {
    if (error instanceof ApiError) {
      setFormError(error.message);
      const fieldErrors = error.fieldErrors;
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
    } else {
      setFormError('Unexpected error. Please try again.');
    }
  }

  async function signInAs(role: Role, roleEmail: string) {
    setFormError(null);
    setPendingRole(role);
    try {
      const user = await login(roleEmail, DEMO_PASSWORD);
      toast.success(`Signed in as ${user.name.split(' ')[0]}`, `${user.role} access enabled.`);
      goToIntendedPage();
    } catch (error) {
      reportFailure(error);
    } finally {
      setPendingRole(null);
    }
  }

  function validate(): boolean {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = 'Email is required';
    else if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid email address';
    if (!password) next.password = 'Password is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`, `Signed in as ${user.role}.`);
      goToIntendedPage();
    } catch (error) {
      reportFailure(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <aside className="login-aside">
        <div className="login-brand">
          <div className="sidebar__logo" aria-hidden="true">
            EC
          </div>
          <span className="login-brand__name">ERP + CRM</span>
        </div>

        <div>
          <h1 className="login-aside__headline">Run the whole operation from one place.</h1>
          <p className="login-aside__lede">
            Customers, stock and dispatch for a wholesale distribution business — with inventory
            that stays honest.
          </p>

          <div className="login-chips">
            {CAPABILITIES.map((capability) => (
              <span className="login-chip" key={capability}>
                {capability}
              </span>
            ))}
          </div>
        </div>

        <p className="login-aside__foot">Internal use only · v1.0.0</p>
      </aside>

      <main className="login-main">
        <div className="login-card">
          <h2 className="login-card__title">Choose a role to continue</h2>
          <p className="login-card__subtitle">
            Each role sees a different portal. Pick one to sign in instantly.
          </p>

          {formError ? (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <Alert variant="danger">{formError}</Alert>
            </div>
          ) : null}

          <div className="role-grid">
            {DEMO_ROLES.map(({ role, email: roleEmail, icon, blurb }) => (
              <button
                key={role}
                type="button"
                className={`role-card role-card--${role.toLowerCase()} ${
                  pendingRole === role ? 'is-busy' : ''
                }`}
                onClick={() => void signInAs(role, roleEmail)}
                disabled={busy}
                aria-label={`Sign in as ${role}`}
              >
                {pendingRole === role ? (
                  <span className="role-card__spinner">
                    <Spinner />
                  </span>
                ) : null}
                <span className="role-card__icon" aria-hidden="true">
                  {icon}
                </span>
                <span className="role-card__name">
                  {role.charAt(0) + role.slice(1).toLowerCase()}
                </span>
                <span className="role-card__blurb">{blurb}</span>
              </button>
            ))}
          </div>

          <div className="login-divider">or</div>

          {showEmailForm ? (
            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <div className="stack stack--sm">
                <TextField
                  label="Email address"
                  type="email"
                  name="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  error={errors.email}
                  required
                  autoFocus
                  disabled={busy}
                />

                <TextField
                  label="Password"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  error={errors.password}
                  required
                  disabled={busy}
                />

                <Button type="submit" variant="primary" block isLoading={isSubmitting}>
                  {isSubmitting ? 'Signing in…' : 'Sign in'}
                </Button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="login-toggle"
              onClick={() => setShowEmailForm(true)}
              disabled={busy}
            >
              Sign in with email and password
            </button>
          )}

          <p className="login-hint">
            Demo accounts share the password <code>{DEMO_PASSWORD}</code>
          </p>
        </div>
      </main>
    </div>
  );
}
