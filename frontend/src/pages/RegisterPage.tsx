import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError, api } from '../lib/api-client';
import { EMAIL_PATTERN } from '../lib/validation';
import { Alert, Button, SelectField, Spinner, TextField } from '../components/ui';
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
  { value: 'SALES', label: 'Sales — customers, follow-ups and challans' },
  { value: 'WAREHOUSE', label: 'Warehouse — products, stock and dispatch' },
  { value: 'ACCOUNTS', label: 'Accounts — read-only across every module' },
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
    <div className="login-page">
      <aside className="login-aside">
        <div className="login-brand">
          <div className="sidebar__logo" aria-hidden="true">
            EC
          </div>
          <span className="login-brand__name">ERP + CRM</span>
        </div>

        <div>
          <h1 className="login-aside__headline">Request access to the portal.</h1>
          <p className="login-aside__lede">
            Accounts are reviewed by an administrator before they go live, so the customer,
            stock and dispatch data stays with the people who should see it.
          </p>
        </div>

        <p className="login-aside__foot">Internal use only · v1.0.0</p>
      </aside>

      <main className="login-main">
        <div className="login-card">
          {submitted ? (
            <>
              <h2 className="login-card__title">Request submitted</h2>
              <p className="login-card__subtitle">
                Thanks {submitted.name.split(' ')[0]} — your account has been created.
              </p>

              <div style={{ marginTop: 'var(--space-5)' }}>
                <Alert variant="info" title="Waiting for approval">
                  An administrator needs to activate <strong>{submitted.email}</strong> before you
                  can sign in. You requested <strong>{submitted.role}</strong> access.
                </Alert>
              </div>

              <div className="stack stack--sm" style={{ marginTop: 'var(--space-5)' }}>
                <Button variant="primary" block onClick={() => navigate('/login')}>
                  Back to sign in
                </Button>
                <p className="login-hint">
                  Evaluating the portal? The sign-in page has demo accounts for every role that
                  work immediately.
                </p>
              </div>
            </>
          ) : (
            <>
              <h2 className="login-card__title">Create an account</h2>
              <p className="login-card__subtitle">
                Request access to the operations portal.
              </p>

              <form className="login-form" onSubmit={handleSubmit} noValidate>
                <div className="stack stack--sm">
                  {formError ? <Alert variant="danger">{formError}</Alert> : null}

                  <TextField
                    label="Full name"
                    value={form.name}
                    onChange={(event) => setField('name', event.target.value)}
                    error={errors.name}
                    placeholder="e.g. Priya Sharma"
                    autoComplete="name"
                    required
                    autoFocus
                    disabled={isSubmitting}
                  />

                  <TextField
                    label="Work email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setField('email', event.target.value)}
                    error={errors.email}
                    placeholder="you@company.com"
                    autoComplete="username"
                    required
                    disabled={isSubmitting}
                  />

                  <SelectField
                    label="Which team are you joining?"
                    value={form.requestedRole}
                    onChange={(event) => setField('requestedRole', event.target.value)}
                    error={errors.requestedRole}
                    options={REQUESTABLE_ROLES}
                    hint="An administrator confirms this when approving your account."
                    required
                    disabled={isSubmitting}
                  />

                  <TextField
                    label="Password"
                    type="password"
                    value={form.password}
                    onChange={(event) => setField('password', event.target.value)}
                    error={errors.password}
                    hint="At least 8 characters, with a letter and a number."
                    autoComplete="new-password"
                    required
                    disabled={isSubmitting}
                  />

                  <TextField
                    label="Confirm password"
                    type="password"
                    value={form.confirmPassword}
                    onChange={(event) => setField('confirmPassword', event.target.value)}
                    error={errors.confirmPassword}
                    autoComplete="new-password"
                    required
                    disabled={isSubmitting}
                  />

                  <Button type="submit" variant="primary" block isLoading={isSubmitting}>
                    {isSubmitting ? 'Creating account…' : 'Request access'}
                  </Button>
                </div>
              </form>

              <p className="login-hint">
                Already have an account? <Link to="/login">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
