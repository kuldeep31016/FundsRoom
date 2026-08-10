import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../lib/api-client';
import { EMAIL_PATTERN } from '../lib/validation';
import { Alert, Button, Card, CardBody, Spinner, TextField } from '../components/ui';

/** Demo accounts created by `npm run seed`, offered as one-click fill-ins. */
const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@erpcrm.test', blurb: 'Full access' },
  { role: 'Sales', email: 'sales@erpcrm.test', blurb: 'CRM + challans' },
  { role: 'Warehouse', email: 'warehouse@erpcrm.test', blurb: 'Products + stock' },
  { role: 'Accounts', email: 'accounts@erpcrm.test', blurb: 'Read-only' },
];

const DEMO_PASSWORD = 'Password@123';

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
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        // Surface backend field-level issues inline as well.
        const fieldErrors = error.fieldErrors;
        if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      } else {
        setFormError('Unexpected error. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function fillDemoAccount(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setErrors({});
    setFormError(null);
  }

  return (
    <div className="login-page">
      <aside className="login-aside">
        <div>
          <div className="sidebar__logo" aria-hidden="true">
            EC
          </div>
          <h1 className="login-aside__headline" style={{ marginTop: 'var(--space-6)' }}>
            Mini ERP + CRM Operations Portal
          </h1>
          <p className="login-aside__lede">
            One workspace for the customer pipeline, warehouse stock and sales challans of a
            wholesale distribution business.
          </p>

          <div className="login-aside__features">
            <div className="login-aside__feature">
              <span aria-hidden="true">☺</span>
              <span>Track leads and customers with a full follow-up history</span>
            </div>
            <div className="login-aside__feature">
              <span aria-hidden="true">▣</span>
              <span>Live stock levels with low-stock alerts and an audited movement ledger</span>
            </div>
            <div className="login-aside__feature">
              <span aria-hidden="true">▤</span>
              <span>Sales challans that deduct stock transactionally on confirmation</span>
            </div>
            <div className="login-aside__feature">
              <span aria-hidden="true">⚙</span>
              <span>Role-based access for sales, warehouse, accounts and admin teams</span>
            </div>
          </div>
        </div>

        <p className="text-xs" style={{ color: '#7f8ba5' }}>
          Internal use only · v1.0.0
        </p>
      </aside>

      <main className="login-main">
        <div className="login-card">
          <div className="login-card__header">
            <h2 className="login-card__title">Sign in</h2>
            <p className="login-card__subtitle">Use your work email address to continue.</p>
          </div>

          <Card>
            <CardBody>
              <form onSubmit={handleSubmit} noValidate>
                <div className="stack stack--sm">
                  {formError ? <Alert variant="danger">{formError}</Alert> : null}

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
                    disabled={isSubmitting}
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
                    disabled={isSubmitting}
                  />

                  <Button type="submit" variant="primary" block isLoading={isSubmitting}>
                    {isSubmitting ? 'Signing in…' : 'Sign in'}
                  </Button>
                </div>
              </form>

              <div className="demo-accounts">
                <div className="demo-accounts__title">Demo accounts</div>
                <div className="demo-accounts__list">
                  {DEMO_ACCOUNTS.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      className="demo-account"
                      onClick={() => fillDemoAccount(account.email)}
                      disabled={isSubmitting}
                    >
                      <span>
                        <strong>{account.role}</strong>{' '}
                        <span className="text-subtle text-xs">{account.email}</span>
                      </span>
                      <span className="text-subtle text-xs nowrap">{account.blurb}</span>
                    </button>
                  ))}
                </div>
                <p className="demo-accounts__hint">
                  Click a role to fill the form. Password for all demo accounts:{' '}
                  <code>{DEMO_PASSWORD}</code>
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      </main>
    </div>
  );
}
