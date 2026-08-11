import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError, api } from '../lib/api-client';
import { EMAIL_PATTERN } from '../lib/validation';
import { Spinner } from '../components/ui';
import type { AuthUser } from '../types/api';

/**
 * Self-registration.
 *
 * ADMIN is not offered: the API rejects it, because a public endpoint must never
 * let a caller grant itself administrative access. Accounts arrive inactive and
 * an administrator approves them, so this page ends in a confirmation rather
 * than a session.
 */
const REQUESTABLE_ROLES = ['SALES', 'WAREHOUSE', 'ACCOUNTS'] as const;

interface FormState {
  name: string;
  email: string;
  password: string;
  requestedRole: string;
}

const EMPTY: FormState = { name: '', email: '', password: '', requestedRole: 'SALES' };

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
      <div className="auth-shell">
        <header className="auth-mast">
          <span className="auth-mast__mark">EC</span>
          <span className="auth-mast__name">ERP &amp; CRM Operations</span>
        </header>

        {submitted ? (
          <>
            <h1 className="auth-heading">Request sent</h1>
            <div className="auth-rule" />

            <div className="auth-success">
              An administrator needs to activate <strong>{submitted.email}</strong> before you can
              sign in. You requested <strong>{submitted.role.toLowerCase()}</strong> access.
            </div>

            <button
              type="button"
              className="auth-submit"
              style={{ marginTop: 'var(--space-6)' }}
              onClick={() => navigate('/login')}
            >
              Back to sign in
            </button>

            <p className="auth-note">
              Evaluating the portal? The sign-in page has demo accounts that work immediately.
            </p>
          </>
        ) : (
          <>
            <h1 className="auth-heading">Request access</h1>
            <div className="auth-rule" />
            <p className="auth-lede">
              Accounts are reviewed by an administrator before they go live.
            </p>

            {formError ? (
              <div className="auth-alert" role="alert">
                {formError}
              </div>
            ) : null}

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              <div>
                <label className="auth-label" htmlFor="reg-name">
                  Full name
                </label>
                <input
                  id="reg-name"
                  className={`auth-input ${errors.name ? 'has-error' : ''}`}
                  autoComplete="name"
                  placeholder="Priya Sharma"
                  value={form.name}
                  onChange={(event) => setField('name', event.target.value)}
                  disabled={isSubmitting}
                />
                {errors.name ? <span className="auth-field__error">{errors.name}</span> : null}
              </div>

              <div>
                <label className="auth-label" htmlFor="reg-email">
                  Work email
                </label>
                <input
                  id="reg-email"
                  className={`auth-input ${errors.email ? 'has-error' : ''}`}
                  type="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={(event) => setField('email', event.target.value)}
                  disabled={isSubmitting}
                />
                {errors.email ? <span className="auth-field__error">{errors.email}</span> : null}
              </div>

              <div>
                <label className="auth-label" htmlFor="reg-password">
                  Password
                </label>
                <input
                  id="reg-password"
                  className={`auth-input ${errors.password ? 'has-error' : ''}`}
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters, with a number"
                  value={form.password}
                  onChange={(event) => setField('password', event.target.value)}
                  disabled={isSubmitting}
                />
                {errors.password ? (
                  <span className="auth-field__error">{errors.password}</span>
                ) : null}
              </div>

              <div>
                <span className="auth-label">Team</span>
                <div className="auth-roles" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  {REQUESTABLE_ROLES.map((role) => (
                    <button
                      key={role}
                      type="button"
                      className={`auth-role ${form.requestedRole === role ? 'is-selected' : ''}`}
                      onClick={() => setField('requestedRole', role)}
                      disabled={isSubmitting}
                      aria-pressed={form.requestedRole === role}
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
                    Sending
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
      </div>
    </div>
  );
}
