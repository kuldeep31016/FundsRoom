import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../lib/api-client';
import { EMAIL_PATTERN } from '../lib/validation';
import { Spinner } from '../components/ui';
import { AuthBrandPanel } from '../components/layout/AuthBrandPanel';
import {
  IconBox,
  IconCheck,
  IconCrown,
  IconEye,
  IconEyeOff,
  IconLock,
  IconMail,
  IconReport,
  IconUsers,
} from '../components/ui/icons';
import type { Role } from '../types/api';

/**
 * Demo accounts created by `npm run seed`.
 *
 * Choosing a role fills the form with that account's credentials — the actual
 * sign-in still goes through `POST /auth/login` when the button is pressed, so
 * this is a shortcut past typing rather than a bypass of authentication.
 */
const DEMO_ROLES: Array<{
  role: Role;
  email: string;
  tint: string;
  blurb: string;
  Icon: typeof IconCrown;
}> = [
  {
    role: 'ADMIN',
    email: 'admin@erpcrm.test',
    tint: 'tint-violet',
    blurb: 'Full system access and administration',
    Icon: IconCrown,
  },
  {
    role: 'SALES',
    email: 'sales@erpcrm.test',
    tint: 'tint-green',
    blurb: 'Manage customers, sales and challans',
    Icon: IconUsers,
  },
  {
    role: 'WAREHOUSE',
    email: 'warehouse@erpcrm.test',
    tint: 'tint-amber',
    blurb: 'Manage inventory, stock and dispatch',
    Icon: IconBox,
  },
  {
    role: 'ACCOUNTS',
    email: 'accounts@erpcrm.test',
    tint: 'tint-blue',
    blurb: 'View reports and financial data',
    Icon: IconReport,
  },
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
      <div className="auth__inner">
        <AuthBrandPanel />

        <section className="auth-card">
          <div className="auth-card__badge">
            <IconLock width={24} height={24} />
          </div>
          <h2 className="auth-card__title">Welcome back</h2>
          <p className="auth-card__subtitle">Sign in to access your ERP + CRM dashboard</p>

          {formError ? (
            <div className="auth-alert" role="alert">
              {formError}
            </div>
          ) : null}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div>
              <div className="auth-field">
                <span className="auth-field__icon">
                  <IconMail width={18} height={18} />
                </span>
                <input
                  className={`auth-input ${errors.email ? 'has-error' : ''}`}
                  type="email"
                  name="email"
                  autoComplete="username"
                  placeholder="Enter your email"
                  aria-label="Email address"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setErrors((current) => ({ ...current, email: undefined }));
                  }}
                  disabled={isSubmitting}
                />
              </div>
              {errors.email ? <span className="auth-field__error">{errors.email}</span> : null}
            </div>

            <div>
              <div className="auth-field">
                <span className="auth-field__icon">
                  <IconLock width={18} height={18} />
                </span>
                <input
                  className={`auth-input auth-input--password ${errors.password ? 'has-error' : ''}`}
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  aria-label="Password"
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
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <IconEyeOff width={17} height={17} /> : <IconEye width={17} height={17} />}
                </button>
              </div>
              {errors.password ? <span className="auth-field__error">{errors.password}</span> : null}
            </div>

            <h3 className="auth-roles__heading">Choose your role</h3>
            <p className="auth-roles__hint">Select a portal to fill the demo credentials</p>

            <div className="auth-roles">
              {DEMO_ROLES.map(({ role, email: roleEmail, tint, blurb, Icon }) => (
                <button
                  key={role}
                  type="button"
                  className={`auth-role ${selectedRole === role ? 'is-selected' : ''}`}
                  onClick={() => chooseRole(role, roleEmail)}
                  disabled={isSubmitting}
                  aria-pressed={selectedRole === role}
                >
                  {selectedRole === role ? (
                    <span className="auth-role__check">
                      <IconCheck width={11} height={11} />
                    </span>
                  ) : null}
                  <span className={`auth-role__icon ${tint}`}>
                    <Icon width={20} height={20} />
                  </span>
                  <span className="auth-role__name">
                    {role.charAt(0) + role.slice(1).toLowerCase()}
                  </span>
                  <span className="auth-role__text">{blurb}</span>
                </button>
              ))}
            </div>

            <button type="submit" className="auth-submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <span className="auth-spinner" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                <>
                  <IconLock width={17} height={17} />
                  Sign in to Continue
                </>
              )}
            </button>
          </form>

          <p className="auth-note">
            Demo accounts: admin@erpcrm.test / sales@erpcrm.test / warehouse@erpcrm.test /
            accounts@erpcrm.test
            <br />
            Password: <code>{DEMO_PASSWORD}</code>
            <br />
            <br />
            Need your own account? <Link to="/register">Request access</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
