import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api-client';
import { useApiResource } from '../../hooks/useApiResource';
import { formatCurrency, formatNumber } from '../../lib/format';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  TextAreaField,
} from '../../components/ui';
import { EntityPicker } from '../../components/ui/EntityPicker';
import type { Challan, Customer, Product } from '../../types/api';

interface LineItem {
  /** Local row key so React can track rows before a product is chosen. */
  key: string;
  product: Product | null;
  quantity: string;
}

let nextKey = 1;
function newLine(): LineItem {
  nextKey += 1;
  return { key: `line-${nextKey}`, product: null, quantity: '1' };
}

export function ChallanCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const presetCustomerId = searchParams.get('customerId');

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [lines, setLines] = useState<LineItem[]>([newLine()]);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [shortfalls, setShortfalls] = useState<
    Array<{ productName: string; sku: string; requestedQuantity: number; availableStock: number }>
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);

  // Deep link from a customer page pre-selects that customer.
  const { data: presetCustomer } = useApiResource<Customer>(
    presetCustomerId ? `/customers/${presetCustomerId}` : null,
  );
  useEffect(() => {
    if (presetCustomer) setCustomer(presetCustomer);
  }, [presetCustomer]);

  const totals = useMemo(() => {
    let quantity = 0;
    let amount = 0;
    for (const line of lines) {
      const parsed = Number(line.quantity);
      if (!line.product || !Number.isInteger(parsed) || parsed <= 0) continue;
      quantity += parsed;
      amount += parsed * line.product.unitPrice;
    }
    return { quantity, amount: Math.round(amount * 100) / 100 };
  }, [lines]);

  /** Quantities across duplicated rows are merged by the API, so preview that here. */
  const mergedQuantityByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) {
      const parsed = Number(line.quantity);
      if (!line.product || !Number.isInteger(parsed) || parsed <= 0) continue;
      map.set(line.product.id, (map.get(line.product.id) ?? 0) + parsed);
    }
    return map;
  }, [lines]);

  const hasInsufficientStock = lines.some((line) => {
    if (!line.product) return false;
    const requested = mergedQuantityByProduct.get(line.product.id) ?? 0;
    return requested > line.product.currentStock;
  });

  function updateLine(key: string, patch: Partial<LineItem>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    setErrors((current) => ({ ...current, items: '' }));
    setShortfalls([]);
  }

  function removeLine(key: string) {
    setLines((current) => (current.length === 1 ? [newLine()] : current.filter((l) => l.key !== key)));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!customer) next.customerId = 'Select a customer';

    const filled = lines.filter((line) => line.product !== null);
    if (filled.length === 0) {
      next.items = 'Add at least one product';
    } else {
      for (const line of filled) {
        const parsed = Number(line.quantity);
        if (!line.quantity.trim() || Number.isNaN(parsed)) {
          next.items = 'Every line needs a quantity';
          break;
        }
        if (!Number.isInteger(parsed)) {
          next.items = 'Quantities must be whole numbers';
          break;
        }
        if (parsed <= 0) {
          next.items = 'Quantities must be greater than zero';
          break;
        }
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(status: 'DRAFT' | 'CONFIRMED') {
    setFormError(null);
    setShortfalls([]);
    if (!validate()) {
      setFormError('Please correct the highlighted fields.');
      return;
    }

    const items = lines
      .filter((line) => line.product !== null)
      .map((line) => ({ productId: line.product!.id, quantity: Number(line.quantity) }));

    setIsSubmitting(true);
    try {
      const { data } = await api.post<Challan>('/challans', {
        customerId: customer!.id,
        items,
        status,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });

      toast.success(
        status === 'CONFIRMED' ? 'Challan confirmed' : 'Draft saved',
        status === 'CONFIRMED'
          ? `${data.challanNumber} created and stock deducted.`
          : `${data.challanNumber} saved. Stock is unchanged until you confirm it.`,
      );
      navigate(`/challans/${data.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        if (error.code === 'INSUFFICIENT_STOCK') {
          const meta = error.meta as
            | {
                shortfalls?: Array<{
                  productName: string;
                  sku: string;
                  requestedQuantity: number;
                  availableStock: number;
                }>;
              }
            | undefined;
          setShortfalls(meta?.shortfalls ?? []);
        }
        const fieldErrors = error.fieldErrors;
        if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      } else {
        setFormError('Unexpected error. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
      setPendingConfirm(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Create sales challan"
        subtitle="Select a customer, add products and quantities, then save as a draft or confirm immediately."
        breadcrumbs={
          <>
            <Link to="/challans">Sales challans</Link>
            <span aria-hidden="true">/</span>
            <span>New</span>
          </>
        }
      />

      <form onSubmit={(event: FormEvent) => event.preventDefault()} noValidate>
        <div className="stack">
          {formError ? (
            <Alert variant="danger" title="Could not save this challan">
              <div>{formError}</div>
              {shortfalls.length > 0 ? (
                <ul className="alert__list">
                  {shortfalls.map((shortfall) => (
                    <li key={shortfall.sku}>
                      <strong>{shortfall.productName}</strong> ({shortfall.sku}) — requested{' '}
                      {formatNumber(shortfall.requestedQuantity)}, only{' '}
                      {formatNumber(shortfall.availableStock)} available
                    </li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          ) : null}

          <Card>
            <CardHeader title="Customer" subtitle="Who is this dispatch for?" />
            <CardBody>
              <div className="form-grid">
                <EntityPicker<Customer>
                  label="Customer"
                  path="/customers"
                  value={customer}
                  onChange={(value) => {
                    setCustomer(value);
                    setErrors((current) => ({ ...current, customerId: '' }));
                  }}
                  getLabel={(item) => `${item.name}${item.businessName ? ` — ${item.businessName}` : ''}`}
                  renderOption={(item) => (
                    <span>
                      <strong>{item.name}</strong>
                      <span className="text-subtle text-xs">
                        {' '}
                        {item.businessName ? `${item.businessName} · ` : ''}
                        {item.mobile}
                      </span>
                    </span>
                  )}
                  placeholder="Search by name, business, mobile or GST…"
                  error={errors.customerId}
                  required
                  disabled={isSubmitting}
                  emptyMessage="No customers found. Try another search term."
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Products"
              subtitle="Add one row per product. Repeating a product merges the quantities."
              actions={
                <Button size="sm" onClick={() => setLines((current) => [...current, newLine()])} disabled={isSubmitting}>
                  + Add product
                </Button>
              }
            />
            <CardBody>
              {errors.items ? (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <Alert variant="danger">{errors.items}</Alert>
                </div>
              ) : null}

              {lines.length === 0 ? (
                <EmptyState
                  icon="▣"
                  title="No products added"
                  message="Add at least one product to this challan."
                  action={
                    <Button variant="primary" onClick={() => setLines([newLine()])}>
                      + Add product
                    </Button>
                  }
                />
              ) : (
                <div className="line-items">
                  {lines.map((line, index) => {
                    const parsed = Number(line.quantity);
                    const isValidQuantity = Number.isInteger(parsed) && parsed > 0;
                    const merged = line.product
                      ? (mergedQuantityByProduct.get(line.product.id) ?? 0)
                      : 0;
                    const isShort = Boolean(line.product && merged > line.product.currentStock);
                    const lineTotal =
                      line.product && isValidQuantity ? line.product.unitPrice * parsed : 0;

                    return (
                      <div className="line-item" key={line.key}>
                        <div>
                          <EntityPicker<Product>
                            label={`Product ${index + 1}`}
                            path="/products"
                            params={{ isActive: 'true' }}
                            value={line.product}
                            onChange={(product) => updateLine(line.key, { product })}
                            getLabel={(item) => `${item.name} (${item.sku})`}
                            renderOption={(item) => (
                              <span>
                                <strong>{item.name}</strong>
                                <span className="text-subtle text-xs">
                                  {' '}
                                  {item.sku} · {formatCurrency(item.unitPrice)} ·{' '}
                                  {formatNumber(item.currentStock)} in stock
                                </span>
                              </span>
                            )}
                            placeholder="Search by name, SKU or category…"
                            disabled={isSubmitting}
                            fullWidth
                            emptyMessage="No products found."
                          />
                          {line.product ? (
                            <div
                              className={`line-item__stock ${
                                isShort
                                  ? 'line-item__stock--short'
                                  : line.product.isLowStock
                                    ? 'line-item__stock--low'
                                    : ''
                              }`}
                            >
                              {formatNumber(line.product.currentStock)} in stock ·{' '}
                              {formatCurrency(line.product.unitPrice)} each
                              {isShort ? ` · short by ${formatNumber(merged - line.product.currentStock)}` : ''}
                            </div>
                          ) : null}
                        </div>

                        <div className="field">
                          <label className="field__label" htmlFor={`qty-${line.key}`}>
                            Quantity
                          </label>
                          <input
                            id={`qty-${line.key}`}
                            type="number"
                            min="1"
                            step="1"
                            className={`input ${isShort ? 'has-error' : ''}`}
                            value={line.quantity}
                            onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                            disabled={isSubmitting}
                          />
                        </div>

                        <div className="line-item__total">
                          <div className="field__label">Line total</div>
                          {formatCurrency(lineTotal)}
                        </div>

                        <div className="line-item__remove">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLine(line.key)}
                            disabled={isSubmitting}
                            aria-label={`Remove product ${index + 1}`}
                          >
                            ✕
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>

            <div className="totals-bar">
              <div className="totals-bar__item">
                <div className="totals-bar__label">Total quantity</div>
                <div className="totals-bar__value">{formatNumber(totals.quantity)}</div>
              </div>
              <div className="totals-bar__item">
                <div className="totals-bar__label">Total value</div>
                <div className="totals-bar__value">{formatCurrency(totals.amount)}</div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Notes" subtitle="Optional instructions recorded on the challan" />
            <CardBody>
              <TextAreaField
                label="Notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="e.g. Deliver before noon. Driver: Ramesh."
                optional
                rows={3}
                disabled={isSubmitting}
              />
            </CardBody>
          </Card>

          {hasInsufficientStock ? (
            <Alert variant="warning" title="Not enough stock to confirm">
              One or more lines request more units than are currently available. You can still save
              this as a <strong>draft</strong> — drafts never touch stock — but confirming will be
              rejected until stock is replenished.
            </Alert>
          ) : null}

          <Card>
            <CardBody>
              <div className="row row--between row--wrap" style={{ gap: 'var(--space-3)' }}>
                <p className="text-sm text-muted" style={{ maxWidth: '60ch' }}>
                  <strong>Draft</strong> saves the document without changing inventory.{' '}
                  <strong>Confirm</strong> deducts stock immediately and writes an OUT movement for
                  every line — in a single transaction, so it either all succeeds or nothing changes.
                </p>
                <div className="row" style={{ gap: 'var(--space-2)' }}>
                  <Button variant="secondary" onClick={() => navigate('/challans')} disabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button variant="secondary" onClick={() => void submit('DRAFT')} isLoading={isSubmitting}>
                    Save as draft
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      if (validate()) setPendingConfirm(true);
                      else setFormError('Please correct the highlighted fields.');
                    }}
                    disabled={isSubmitting || hasInsufficientStock}
                  >
                    Save &amp; confirm
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </form>

      {pendingConfirm ? (
        <ConfirmDialog
          title="Confirm this challan?"
          message={
            <>
              Confirming will immediately deduct{' '}
              <strong>{formatNumber(totals.quantity)} units</strong> from stock for{' '}
              <strong>{customer?.name}</strong> and record a stock movement for every line. This
              cannot be undone directly — you would need to cancel the challan to return the stock.
            </>
          }
          confirmLabel="Yes, confirm and deduct stock"
          cancelLabel="Go back"
          isSubmitting={isSubmitting}
          onCancel={() => setPendingConfirm(false)}
          onConfirm={() => void submit('CONFIRMED')}
        />
      ) : null}
    </>
  );
}
