import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api-client';
import { useApiResource } from '../../hooks/useApiResource';
import {
  compact,
  hasErrors,
  maxLength,
  nonNegativeInteger,
  nonNegativeNumber,
  required,
  validSku,
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
  TextField,
} from '../../components/ui';
import type { Product } from '../../types/api';

interface FormState {
  name: string;
  sku: string;
  category: string;
  unitPrice: string;
  currentStock: string;
  minStockAlert: string;
  location: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  sku: '',
  category: '',
  unitPrice: '',
  currentStock: '0',
  minStockAlert: '0',
  location: '',
};

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const { data: existing, isLoading, error: loadError, refetch } = useApiResource<Product>(
    isEdit ? `/products/${id}` : null,
  );

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors<FormState>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setForm({
      name: existing.name,
      sku: existing.sku,
      category: existing.category,
      unitPrice: String(existing.unitPrice),
      currentStock: String(existing.currentStock),
      minStockAlert: String(existing.minStockAlert),
      location: existing.location ?? '',
    });
  }, [existing]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate(): boolean {
    const next = compact<FormState>({
      name: required(form.name, 'Product name') ?? maxLength(form.name, 150, 'Product name'),
      sku: validSku(form.sku),
      category: required(form.category, 'Category') ?? maxLength(form.category, 80, 'Category'),
      unitPrice: nonNegativeNumber(form.unitPrice, 'Unit price'),
      // Opening stock is only editable at creation time.
      currentStock: isEdit ? undefined : nonNegativeInteger(form.currentStock, 'Opening stock'),
      minStockAlert: nonNegativeInteger(form.minStockAlert, 'Minimum stock alert'),
      location: maxLength(form.location, 120, 'Location'),
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

    setIsSubmitting(true);
    try {
      if (isEdit) {
        // `currentStock` is deliberately excluded: stock only moves through the
        // stock-movement endpoint so the ledger stays complete.
        const { data } = await api.patch<Product>(`/products/${id}`, {
          name: form.name.trim(),
          sku: form.sku.trim().toUpperCase(),
          category: form.category.trim(),
          unitPrice: Number(form.unitPrice),
          minStockAlert: Number(form.minStockAlert),
          location: form.location.trim() || null,
        });
        toast.success('Product updated', `${data.name} has been saved.`);
        navigate(`/products/${id}`);
      } else {
        const { data } = await api.post<Product>('/products', {
          name: form.name.trim(),
          sku: form.sku.trim().toUpperCase(),
          category: form.category.trim(),
          unitPrice: Number(form.unitPrice),
          currentStock: Number(form.currentStock),
          minStockAlert: Number(form.minStockAlert),
          ...(form.location.trim() ? { location: form.location.trim() } : {}),
        });
        toast.success('Product added', `${data.name} (${data.sku}) is now in the catalogue.`);
        navigate(`/products/${data.id}`);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        const fieldErrors = error.fieldErrors;
        // A duplicate SKU comes back as a 409 without field details.
        if (error.code === 'DUPLICATE_SKU') fieldErrors.sku = 'This SKU is already in use';
        setErrors(fieldErrors);
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
        <LoadingState message="Loading product…" />
      </Card>
    );
  }

  if (isEdit && loadError) {
    return (
      <Card>
        <ErrorState
          title={loadError.status === 404 ? 'Product not found' : 'Could not load product'}
          message={loadError.message}
          onRetry={loadError.status === 404 ? undefined : refetch}
        />
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit product' : 'Add product'}
        subtitle={
          isEdit
            ? 'Update catalogue details. Stock is changed through stock movements, not here.'
            : 'Add an item to the catalogue with its opening stock.'
        }
        breadcrumbs={
          <>
            <Link to="/products">Products</Link>
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
                  label="Product name"
                  value={form.name}
                  onChange={(event) => setField('name', event.target.value)}
                  error={errors.name}
                  placeholder="e.g. Sunlight Detergent Powder 1kg"
                  required
                  autoFocus
                  disabled={isSubmitting}
                />
                <TextField
                  label="SKU / code"
                  value={form.sku}
                  onChange={(event) => setField('sku', event.target.value.toUpperCase())}
                  error={errors.sku}
                  hint="Unique. Letters, digits, dot, underscore or hyphen."
                  placeholder="DET-SUN-1KG"
                  className="mono"
                  required
                  disabled={isSubmitting}
                />
                <TextField
                  label="Category"
                  value={form.category}
                  onChange={(event) => setField('category', event.target.value)}
                  error={errors.category}
                  placeholder="e.g. Detergents"
                  required
                  disabled={isSubmitting}
                />
                <TextField
                  label="Location / warehouse"
                  value={form.location}
                  onChange={(event) => setField('location', event.target.value)}
                  error={errors.location}
                  placeholder="e.g. Warehouse A - Rack 1"
                  optional
                  disabled={isSubmitting}
                />
                <TextField
                  label="Unit price (₹)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.unitPrice}
                  onChange={(event) => setField('unitPrice', event.target.value)}
                  error={errors.unitPrice}
                  placeholder="0.00"
                  required
                  disabled={isSubmitting}
                />
                <TextField
                  label="Minimum stock alert quantity"
                  type="number"
                  step="1"
                  min="0"
                  value={form.minStockAlert}
                  onChange={(event) => setField('minStockAlert', event.target.value)}
                  error={errors.minStockAlert}
                  hint="The product is flagged as low when stock reaches this level."
                  required
                  disabled={isSubmitting}
                />

                {isEdit ? (
                  <div className="field field--full">
                    <Alert variant="info" title="Stock is managed separately">
                      Current stock is {existing?.currentStock ?? 0} units. To change it, record a
                      stock movement so the change is captured in the audit ledger with a reason.
                    </Alert>
                  </div>
                ) : (
                  <TextField
                    label="Opening stock"
                    type="number"
                    step="1"
                    min="0"
                    value={form.currentStock}
                    onChange={(event) => setField('currentStock', event.target.value)}
                    error={errors.currentStock}
                    hint="Recorded as an IN movement so the ledger explains the balance."
                    required
                    disabled={isSubmitting}
                  />
                )}
              </div>
            </div>
          </CardBody>

          <CardFooter>
            <Button
              variant="secondary"
              onClick={() => navigate(isEdit ? `/products/${id}` : '/products')}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add product'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </>
  );
}
