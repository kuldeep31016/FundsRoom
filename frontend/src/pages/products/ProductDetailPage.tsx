import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api-client';
import { useApiResource } from '../../hooks/useApiResource';
import {
  MOVEMENT_TYPE_VARIANT,
  formatCurrency,
  formatDateTime,
  formatNumber,
} from '../../lib/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DetailItem,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  PageHeader,
  Pagination,
  SelectField,
  Stat,
  TextAreaField,
  TextField,
} from '../../components/ui';
import { MOVEMENT_TYPES, type Product, type StockMovement } from '../../types/api';

const HISTORY_PAGE_SIZE = 10;

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const toast = useToast();

  const [historyPage, setHistoryPage] = useState(1);
  const [isAdjusting, setIsAdjusting] = useState(false);

  const {
    data: product,
    isLoading,
    error,
    refetch: refetchProduct,
  } = useApiResource<Product>(id ? `/products/${id}` : null);

  const {
    data: movements,
    meta,
    isLoading: isLoadingHistory,
    error: historyError,
    refetch: refetchHistory,
  } = useApiResource<StockMovement[]>(id ? `/products/${id}/stock-movements` : null, {
    page: historyPage,
    limit: HISTORY_PAGE_SIZE,
  });

  if (isLoading && !product) {
    return (
      <Card>
        <LoadingState message="Loading product…" />
      </Card>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader
          title="Product"
          breadcrumbs={
            <>
              <Link to="/products">Products</Link>
              <span aria-hidden="true">/</span>
              <span>Not found</span>
            </>
          }
        />
        <Card>
          <ErrorState
            title={error.status === 404 ? 'Product not found' : 'Could not load product'}
            message={
              error.status === 404
                ? 'This product may have been removed, or the link is incorrect.'
                : error.message
            }
            onRetry={error.status === 404 ? undefined : refetchProduct}
          />
        </Card>
      </>
    );
  }

  if (!product) return null;

  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={
          <>
            <span className="mono">{product.sku}</span> · {product.category}
          </>
        }
        breadcrumbs={
          <>
            <Link to="/products">Products</Link>
            <span aria-hidden="true">/</span>
            <span>{product.name}</span>
          </>
        }
        actions={
          <>
            {can('stock:write') ? (
              <Button variant="secondary" onClick={() => setIsAdjusting(true)}>
                ⇅ Record stock movement
              </Button>
            ) : null}
            {can('products:write') ? (
              <Link className="btn btn--primary" to={`/products/${product.id}/edit`}>
                Edit product
              </Link>
            ) : null}
          </>
        }
      />

      <div className="stack">
        {product.isLowStock ? (
          <Alert
            variant={product.currentStock === 0 ? 'danger' : 'warning'}
            title={product.currentStock === 0 ? 'Out of stock' : 'Low stock'}
          >
            Current stock is {formatNumber(product.currentStock)} units, at or below the alert
            quantity of {formatNumber(product.minStockAlert)}.
            {can('stock:write') ? ' Record an IN movement to replenish it.' : ''}
          </Alert>
        ) : null}

        {!product.isActive ? (
          <Alert variant="warning" title="Inactive product">
            This product is marked inactive and cannot be added to new challans.
          </Alert>
        ) : null}

        <div className="stat-grid">
          <Stat
            label="Current stock"
            value={formatNumber(product.currentStock)}
            meta={product.isLowStock ? 'At or below the alert level' : 'Healthy'}
          />
          <Stat label="Minimum alert" value={formatNumber(product.minStockAlert)} />
          <Stat label="Unit price" value={formatCurrency(product.unitPrice)} />
          <Stat label="Stock value" value={formatCurrency(product.stockValue)} />
        </div>

        <Card>
          <CardHeader title="Product details" />
          <CardBody>
            <div className="detail-grid">
              <DetailItem label="Name">{product.name}</DetailItem>
              <DetailItem label="SKU / code">
                <span className="mono">{product.sku}</span>
              </DetailItem>
              <DetailItem label="Category">{product.category}</DetailItem>
              <DetailItem label="Location / warehouse">{product.location}</DetailItem>
              <DetailItem label="Status">
                <Badge variant={product.isActive ? 'success' : 'neutral'}>
                  {product.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </DetailItem>
              <DetailItem label="Created">{formatDateTime(product.createdAt)}</DetailItem>
              <DetailItem label="Last updated">{formatDateTime(product.updatedAt)}</DetailItem>
            </div>
          </CardBody>
        </Card>

        {/* Stock movement history ------------------------------------------- */}
        <Card>
          <CardHeader
            title="Stock movement history"
            subtitle="Every change to this product's stock, newest first"
            actions={
              can('stock:write') ? (
                <Button size="sm" onClick={() => setIsAdjusting(true)}>
                  ⇅ Record movement
                </Button>
              ) : null
            }
          />
          <CardBody flush>
            {isLoadingHistory && !movements ? (
              <LoadingState message="Loading history…" />
            ) : historyError ? (
              <ErrorState message={historyError.message} onRetry={refetchHistory} />
            ) : !movements || movements.length === 0 ? (
              <EmptyState
                icon="⇅"
                title="No stock movements recorded"
                message="Movements appear here when stock is received, issued or dispatched on a challan."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Type</th>
                      <th className="table__num">Change</th>
                      <th className="table__num">Balance</th>
                      <th>Reason</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((movement) => (
                      <tr key={movement.id}>
                        <td className="nowrap text-muted">{formatDateTime(movement.createdAt)}</td>
                        <td>
                          <Badge variant={MOVEMENT_TYPE_VARIANT[movement.movementType]}>
                            {movement.movementType}
                          </Badge>
                        </td>
                        <td className="table__num font-medium">
                          {movement.quantityChange > 0 ? '+' : ''}
                          {formatNumber(movement.quantityChange)}
                        </td>
                        <td className="table__num text-muted">
                          {formatNumber(movement.stockBefore)} → {formatNumber(movement.stockAfter)}
                        </td>
                        <td>
                          <div>{movement.reason}</div>
                          {movement.referenceType && movement.referenceType !== 'MANUAL' ? (
                            <div className="table__secondary">{movement.referenceType}</div>
                          ) : null}
                        </td>
                        <td className="text-muted">{movement.createdByName ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
          {meta ? (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              limit={meta.limit}
              onPageChange={setHistoryPage}
              isLoading={isLoadingHistory}
            />
          ) : null}
        </Card>
      </div>

      {isAdjusting && id ? (
        <StockMovementDialog
          product={product}
          onClose={() => setIsAdjusting(false)}
          onSaved={(newStock) => {
            setIsAdjusting(false);
            setHistoryPage(1);
            refetchProduct();
            refetchHistory();
            toast.success('Stock updated', `${product.name} now has ${formatNumber(newStock)} units.`);
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------------- */

function StockMovementDialog({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: (newStock: number) => void;
}) {
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ quantity?: string; reason?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedQuantity = Number(quantity);
  const isValidQuantity = Number.isInteger(parsedQuantity) && parsedQuantity > 0;
  const projected = isValidQuantity
    ? movementType === 'IN'
      ? product.currentStock + parsedQuantity
      : product.currentStock - parsedQuantity
    : product.currentStock;
  const wouldGoNegative = projected < 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const next: { quantity?: string; reason?: string } = {};
    if (!quantity.trim()) next.quantity = 'Quantity is required';
    else if (!Number.isInteger(parsedQuantity)) next.quantity = 'Quantity must be a whole number';
    else if (parsedQuantity <= 0) next.quantity = 'Quantity must be greater than zero';
    if (!reason.trim()) next.reason = 'Reason is required';

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setIsSubmitting(true);
    try {
      const { data } = await api.post<{ currentStock: number }>('/stock/movements', {
        productId: product.id,
        movementType,
        quantity: parsedQuantity,
        reason: reason.trim(),
      });
      onSaved(data.currentStock);
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

  return (
    <Modal
      title="Record stock movement"
      onClose={isSubmitting ? () => undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            disabled={wouldGoNegative}
          >
            {isSubmitting ? 'Saving…' : 'Record movement'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="stack stack--sm">
          {formError ? <Alert variant="danger">{formError}</Alert> : null}

          <p>
            <strong>{product.name}</strong> currently has{' '}
            <strong>{formatNumber(product.currentStock)}</strong> units in stock.
          </p>

          <SelectField
            label="Movement type"
            value={movementType}
            onChange={(event) => setMovementType(event.target.value as 'IN' | 'OUT')}
            options={MOVEMENT_TYPES.map((value) => ({
              value,
              label: value === 'IN' ? 'IN — stock received' : 'OUT — stock issued',
            }))}
            required
            disabled={isSubmitting}
          />

          <TextField
            label="Quantity"
            type="number"
            step="1"
            min="1"
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value);
              setErrors((current) => ({ ...current, quantity: undefined }));
            }}
            error={errors.quantity}
            placeholder="0"
            required
            autoFocus
            disabled={isSubmitting}
          />

          <TextAreaField
            label="Reason"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setErrors((current) => ({ ...current, reason: undefined }));
            }}
            error={errors.reason}
            placeholder="e.g. Purchase order PO-1042 received / Damaged in transit"
            required
            rows={2}
            disabled={isSubmitting}
          />

          {wouldGoNegative ? (
            <Alert variant="danger" title="Not enough stock">
              This would take stock to {formatNumber(projected)}. Stock cannot go negative — reduce
              the quantity to {formatNumber(product.currentStock)} or fewer.
            </Alert>
          ) : isValidQuantity ? (
            <Alert variant="info">
              Stock will change from {formatNumber(product.currentStock)} to{' '}
              <strong>{formatNumber(projected)}</strong>.
            </Alert>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}
