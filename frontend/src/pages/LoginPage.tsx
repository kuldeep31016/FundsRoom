import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../lib/api-client';
import { EMAIL_PATTERN } from '../lib/validation';
import { Spinner } from '../components/ui';
import type { Role } from '../types/api';

/**
 * Demo accounts created by `npm run seed`.
 *
 * Choosing a role fills the form with that account's credentials; signing in
 * still goes through `POST /auth/login` when the button is pressed, so this is
 * a shortcut past typing rather than a bypass of authentication.
 */
const DEMO_ROLES: Array<{ role: Role; email: string }> = [
  { role: 'ADMIN', email: 'admin@erpcrm.test' },
  { role: 'SALES', email: 'sales@erpcrm.test' },
  { role: 'WAREHOUSE', email: 'warehouse@erpcrm.test' },
  { role: 'ACCOUNTS', email: 'accounts@erpcrm.test' },
];

const DEMO_PASSWORD = 'Password@123';

export function LoginPage() {
  const { login, isAuthenticated, isInitialising } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
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

  function chooseRole(role: Role, roleEmail: string) {
    setSelectedRole(role);
    setEmail(roleEmail);
    setPassword(DEMO_PASSWORD);
    setErrors({});
    setFormError(null);
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
        const fieldErrors = error.fieldErrors;
        if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      } else {
        setFormError('Unexpected error. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-shell">
        <header className="auth-mast">
          <span className="auth-mast__mark">EC</span>
          <span className="auth-mast__name">ERP &amp; CRM Operations</span>
        </header>

        <h1 className="auth-heading">Sign in</h1>
        <div className="auth-rule" />
        <p className="auth-lede">Customers, inventory and dispatch in one place.</p>

        {formError ? (
          <div className="auth-alert" role="alert">
            {formError}
          </div>
        ) : null}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div>
            <label className="auth-label" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              className={`auth-input ${errors.email ? 'has-error' : ''}`}
              type="email"
              name="email"
              autoComplete="username"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setErrors((current) => ({ ...current, email: undefined }));
              }}
              disabled={isSubmitting}
            />
            {errors.email ? <span className="auth-field__error">{errors.email}</span> : null}
          </div>

          <div>
            <label className="auth-label" htmlFor="auth-password">
              Password
            </label>
            <div className="auth-field">
              <input
                id="auth-password"
                className={`auth-input ${errors.password ? 'has-error' : ''}`}
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrors((current) => ({ ...current, password: undefined }));
                }}
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="auth-field__toggle"
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.password ? <span className="auth-field__error">{errors.password}</span> : null}
          </div>

          <div>
            <span className="auth-label">Demo role</span>
            <div className="auth-roles">
              {DEMO_ROLES.map(({ role, email: roleEmail }) => (
                <button
                  key={role}
                  type="button"
                  className={`auth-role ${selectedRole === role ? 'is-selected' : ''}`}
                  onClick={() => chooseRole(role, roleEmail)}
                  disabled={isSubmitting}
                  aria-pressed={selectedRole === role}
                >
                  {role.charAt(0) + role.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="auth-submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <span className="auth-spinner" aria-hidden="true" />
                Signing in
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <p className="auth-note">
          Demo password <code>{DEMO_PASSWORD}</code>
          <br />
          Need your own account? <Link to="/register">Request access</Link>
        </p>
      </div>
    </div>
  );
}
