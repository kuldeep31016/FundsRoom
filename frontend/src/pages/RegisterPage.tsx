import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError, api } from '../lib/api-client';
import { EMAIL_PATTERN } from '../lib/validation';
import { Spinner } from '../components/ui';
import { AuthBrandPanel } from '../components/layout/AuthBrandPanel';
import { IconBox, IconLock, IconMail, IconReport, IconUsers } from '../components/ui/icons';
import type { AuthUser } from '../types/api';

/**
 * Self-registration.
 *
 * ADMIN is not offered: the API rejects it, because a public endpoint must never
 * let a caller grant itself administrative access. Accounts arrive inactive and
 * an administrator approves them, so this page ends in a confirmation rather
 * than a session.
 */
const REQUESTABLE_ROLES = [
  { value: 'SALES', label: 'Sales', tint: 'tint-green', Icon: IconUsers },
  { value: 'WAREHOUSE', label: 'Warehouse', tint: 'tint-amber', Icon: IconBox },
  { value: 'ACCOUNTS', label: 'Accounts', tint: 'tint-blue', Icon: IconReport },
];

interface FormState {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  requestedRole: string;
}

const EMPTY: FormState = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  requestedRole: 'SALES',
};

export function RegisterPage() {
  const { isAuthenticated, isInitialising } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<AuthUser | null>(null);

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

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (!form.name.trim()) next.name = 'Full name is required';
    else if (form.name.trim().length < 2) next.name = 'Enter your full name';

    if (!form.email.trim()) next.email = 'Email is required';
    else if (!EMAIL_PATTERN.test(form.email.trim())) next.email = 'Enter a valid email address';

    if (!form.password) next.password = 'Password is required';
    else if (form.password.length < 8) next.password = 'Use at least 8 characters';
    else if (!/[A-Za-z]/.test(form.password)) next.password = 'Include at least one letter';
    else if (!/[0-9]/.test(form.password)) next.password = 'Include at least one number';

    if (form.confirmPassword !== form.password) next.confirmPassword = 'Passwords do not match';

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const { data } = await api.post<{ user: AuthUser; message: string }>('/auth/register', {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        requestedRole: form.requestedRole,
      });
      setSubmitted(data.user);
      toast.success('Account created', 'An administrator will review your request.');
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        setErrors(error.fieldErrors as Partial<Record<keyof FormState, string>>);
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
        <AuthBrandPanel
          headline="Request access to"
          highlight="the operations portal"
          lede="Accounts are reviewed by an administrator before they go live, so customer, stock and dispatch data stays with the people who should see it."
        />

        <section className="auth-card">
          {submitted ? (
            <>
              <div className="auth-card__badge">
                <IconUsers width={24} height={24} />
              </div>
              <h2 className="auth-card__title">Request submitted</h2>
              <p className="auth-card__subtitle">
                Thanks {submitted.name.split(' ')[0]} — your account has been created.
              </p>

              <div className="auth-success">
                <strong>Waiting for approval.</strong> An administrator needs to activate{' '}
                <strong>{submitted.email}</strong> before you can sign in. You requested{' '}
                <strong>{submitted.role}</strong> access.
              </div>

              <button type="button" className="auth-submit" onClick={() => navigate('/login')}>
                Back to sign in
              </button>

              <p className="auth-note">
                Evaluating the portal? The sign-in page has demo accounts for every role that work
                immediately.
              </p>
            </>
          ) : (
            <>
              <div className="auth-card__badge">
                <IconUsers width={24} height={24} />
              </div>
              <h2 className="auth-card__title">Create an account</h2>
              <p className="auth-card__subtitle">Request access to the operations portal</p>

              {formError ? (
                <div className="auth-alert" role="alert">
                  {formError}
                </div>
              ) : null}

              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                <div>
                  <div className="auth-field">
                    <span className="auth-field__icon">
                      <IconUsers width={18} height={18} />
                    </span>
                    <input
                      className={`auth-input ${errors.name ? 'has-error' : ''}`}
                      placeholder="Full name"
                      aria-label="Full name"
                      autoComplete="name"
                      value={form.name}
                      onChange={(event) => setField('name', event.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                  {errors.name ? <span className="auth-field__error">{errors.name}</span> : null}
                </div>

                <div>
                  <div className="auth-field">
                    <span className="auth-field__icon">
                      <IconMail width={18} height={18} />
                    </span>
                    <input
                      className={`auth-input ${errors.email ? 'has-error' : ''}`}
                      type="email"
                      placeholder="Work email"
                      aria-label="Work email"
                      autoComplete="username"
                      value={form.email}
                      onChange={(event) => setField('email', event.target.value)}
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
                      className={`auth-input ${errors.password ? 'has-error' : ''}`}
                      type="password"
                      placeholder="Password"
                      aria-label="Password"
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(event) => setField('password', event.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                  {errors.password ? (
                    <span className="auth-field__error">{errors.password}</span>
                  ) : (
                    <span className="auth-field__error" style={{ color: 'var(--auth-muted)' }}>
                      At least 8 characters, with a letter and a number
                    </span>
                  )}
                </div>

                <div>
                  <div className="auth-field">
                    <span className="auth-field__icon">
                      <IconLock width={18} height={18} />
                    </span>
                    <input
                      className={`auth-input ${errors.confirmPassword ? 'has-error' : ''}`}
                      type="password"
                      placeholder="Confirm password"
                      aria-label="Confirm password"
                      autoComplete="new-password"
                      value={form.confirmPassword}
                      onChange={(event) => setField('confirmPassword', event.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                  {errors.confirmPassword ? (
                    <span className="auth-field__error">{errors.confirmPassword}</span>
                  ) : null}
                </div>

                <h3 className="auth-roles__heading">Which team are you joining?</h3>
                <p className="auth-roles__hint">An administrator confirms this on approval</p>

                <div className="auth-roles" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                  {REQUESTABLE_ROLES.map(({ value, label, tint, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      className={`auth-role ${form.requestedRole === value ? 'is-selected' : ''}`}
                      onClick={() => setField('requestedRole', value)}
                      disabled={isSubmitting}
                      aria-pressed={form.requestedRole === value}
                    >
                      <span className={`auth-role__icon ${tint}`}>
                        <Icon width={20} height={20} />
                      </span>
                      <span className="auth-role__name">{label}</span>
                    </button>
                  ))}
                </div>

                <button type="submit" className="auth-submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <span className="auth-spinner" aria-hidden="true" />
                      Creating account…
                    </>
                  ) : (
                    'Request access'
                  )}
                </button>
              </form>

              <p className="auth-note">
                Already have an account? <Link to="/login">Sign in</Link>
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
