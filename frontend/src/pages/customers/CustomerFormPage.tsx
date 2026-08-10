import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api-client';
import { useApiResource } from '../../hooks/useApiResource';
import {
  compact,
  hasErrors,
  maxLength,
  required,
  validEmail,
  validGst,
  validMobile,
  type FieldErrors,
} from '../../lib/validation';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardFooter,
  ErrorState,
  LoadingState,
  PageHeader,
  SelectField,
  TextAreaField,
  TextField,
} from '../../components/ui';
import { CUSTOMER_STATUSES, CUSTOMER_TYPES, type Customer } from '../../types/api';
import { titleCase } from '../../lib/format';

interface FormState {
  name: string;
  mobile: string;
  email: string;
  businessName: string;
  gstNumber: string;
  customerType: string;
  address: string;
  status: string;
  followUpDate: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  mobile: '',
  email: '',
  businessName: '',
  gstNumber: '',
  customerType: 'RETAIL',
  address: '',
  status: 'LEAD',
  followUpDate: '',
  notes: '',
};

/** Shared by "Add customer" and "Edit customer" — `id` decides the mode. */
export function CustomerFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const { data: existing, isLoading, error: loadError, refetch } = useApiResource<Customer>(
    isEdit ? `/customers/${id}` : null,
  );

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors<FormState>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setForm({
      name: existing.name,
      mobile: existing.mobile,
      email: existing.email ?? '',
      businessName: existing.businessName ?? '',
      gstNumber: existing.gstNumber ?? '',
      customerType: existing.customerType,
      address: existing.address ?? '',
      status: existing.status,
      followUpDate: existing.followUpDate ?? '',
      notes: existing.notes ?? '',
    });
  }, [existing]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    // Clear the inline error as soon as the user edits the field.
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate(): boolean {
    const next = compact<FormState>({
      name: required(form.name, 'Customer name') ?? maxLength(form.name, 150, 'Customer name'),
      mobile: validMobile(form.mobile),
      email: validEmail(form.email),
      gstNumber: validGst(form.gstNumber),
      businessName: maxLength(form.businessName, 150, 'Business name'),
      address: maxLength(form.address, 500, 'Address'),
      notes: maxLength(form.notes, 2000, 'Notes'),
    });
    setErrors(next);
    return !hasErrors(next);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) {
      setFormError('Please correct the highlighted fields.');
      return;
    }

    // Empty strings become null on edit (clear the column) and are omitted on create.
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      mobile: form.mobile.trim(),
      customerType: form.customerType,
      status: form.status,
      email: form.email.trim() || (isEdit ? null : undefined),
      businessName: form.businessName.trim() || (isEdit ? null : undefined),
      gstNumber: form.gstNumber.trim().toUpperCase() || (isEdit ? null : undefined),
      address: form.address.trim() || (isEdit ? null : undefined),
      followUpDate: form.followUpDate || (isEdit ? null : undefined),
      notes: form.notes.trim() || (isEdit ? null : undefined),
    };
    for (const key of Object.keys(payload)) {
      if (payload[key] === undefined) delete payload[key];
    }

    setIsSubmitting(true);
    try {
      if (isEdit) {
        const { data } = await api.patch<Customer>(`/customers/${id}`, payload);
        toast.success('Customer updated', `${data.name} has been saved.`);
        navigate(`/customers/${id}`);
      } else {
        const { data } = await api.post<Customer>('/customers', payload);
        toast.success('Customer added', `${data.name} is now in your CRM.`);
        navigate(`/customers/${data.id}`);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        setErrors(error.fieldErrors);
      } else {
        setFormError('Unexpected error. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isEdit && isLoading && !existing) {
    return (
      <Card>
        <LoadingState message="Loading customer…" />
      </Card>
    );
  }

  if (isEdit && loadError) {
    return (
      <Card>
        <ErrorState
          title={loadError.status === 404 ? 'Customer not found' : 'Could not load customer'}
          message={loadError.message}
          onRetry={loadError.status === 404 ? undefined : refetch}
        />
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit customer' : 'Add customer'}
        subtitle={
          isEdit
            ? 'Update the account details. Changes take effect immediately.'
            : 'Capture a new lead or account for the sales pipeline.'
        }
        breadcrumbs={
          <>
            <Link to="/customers">Customers</Link>
            <span aria-hidden="true">/</span>
            <span>{isEdit ? existing?.name : 'New'}</span>
          </>
        }
      />

      <form onSubmit={handleSubmit} noValidate>
        <Card>
          <CardBody>
            <div className="stack">
              {formError ? <Alert variant="danger">{formError}</Alert> : null}

              <div className="form-grid">
                <TextField
                  label="Customer name"
                  value={form.name}
                  onChange={(event) => setField('name', event.target.value)}
                  error={errors.name}
                  placeholder="e.g. Suresh Patel"
                  required
                  autoFocus
                  disabled={isSubmitting}
                />
                <TextField
                  label="Business name"
                  value={form.businessName}
                  onChange={(event) => setField('businessName', event.target.value)}
                  error={errors.businessName}
                  placeholder="e.g. Patel General Stores"
                  optional
                  disabled={isSubmitting}
                />
                <TextField
                  label="Mobile number"
                  value={form.mobile}
                  onChange={(event) => setField('mobile', event.target.value)}
                  error={errors.mobile}
                  hint="10 to 15 digits"
                  placeholder="9876543210"
                  inputMode="tel"
                  required
                  disabled={isSubmitting}
                />
                <TextField
                  label="Email address"
                  type="email"
                  value={form.email}
                  onChange={(event) => setField('email', event.target.value)}
                  error={errors.email}
                  placeholder="name@company.com"
                  optional
                  disabled={isSubmitting}
                />
                <SelectField
                  label="Customer type"
                  value={form.customerType}
                  onChange={(event) => setField('customerType', event.target.value)}
                  error={errors.customerType}
                  options={CUSTOMER_TYPES.map((value) => ({ value, label: titleCase(value) }))}
                  required
                  disabled={isSubmitting}
                />
                <SelectField
                  label="Status"
                  value={form.status}
                  onChange={(event) => setField('status', event.target.value)}
                  error={errors.status}
                  options={CUSTOMER_STATUSES.map((value) => ({ value, label: titleCase(value) }))}
                  required
                  disabled={isSubmitting}
                />
                <TextField
                  label="GST number"
                  value={form.gstNumber}
                  onChange={(event) => setField('gstNumber', event.target.value.toUpperCase())}
                  error={errors.gstNumber}
                  hint="15-character GSTIN, e.g. 27AAPFU0939F1ZV"
                  placeholder="27AAPFU0939F1ZV"
                  optional
                  disabled={isSubmitting}
                />
                <TextField
                  label="Next follow-up date"
                  type="date"
                  value={form.followUpDate}
                  onChange={(event) => setField('followUpDate', event.target.value)}
                  error={errors.followUpDate}
                  optional
                  disabled={isSubmitting}
                />
                <TextAreaField
                  label="Address"
                  value={form.address}
                  onChange={(event) => setField('address', event.target.value)}
                  error={errors.address}
                  placeholder="Street, city, state, PIN"
                  optional
                  disabled={isSubmitting}
                  rows={3}
                />
                <TextAreaField
                  label="Notes"
                  value={form.notes}
                  onChange={(event) => setField('notes', event.target.value)}
                  error={errors.notes}
                  placeholder="Anything the team should know about this account"
                  optional
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>
            </div>
          </CardBody>

          <CardFooter>
            <Button
              variant="secondary"
              onClick={() => navigate(isEdit ? `/customers/${id}` : '/customers')}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add customer'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </>
  );
}
