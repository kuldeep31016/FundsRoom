import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api-client';
import { useApiResource } from '../../hooks/useApiResource';
import {
  CHALLAN_STATUS_VARIANT,
  formatCurrency,
  formatDateTime,
  formatNumber,
  titleCase,
} from '../../lib/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DetailItem,
  ErrorState,
  LoadingState,
  PageHeader,
  TextAreaField,
} from '../../components/ui';
import type { Challan, StockMovement } from '../../types/api';

export function ChallanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const toast = useToast();

  const [action, setAction] = useState<'confirm' | 'cancel' | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [shortfalls, setShortfalls] = useState<
    Array<{ productName: string; sku: string; requestedQuantity: number; availableStock: number }>
  >([]);

  const { data: challan, isLoading, error, refetch } = useApiResource<Challan>(
    id ? `/challans/${id}` : null,
  );

  // Movements raised by this challan (deduction on confirm, restore on cancel).
  const { data: movements, refetch: refetchMovements } = useApiResource<StockMovement[]>(
    id && can('stock:read') ? '/stock/movements' : null,
    { referenceType: 'CHALLAN', limit: 100 },
  );

  const relatedMovements = (movements ?? []).filter((movement) => movement.referenceId === id);

  async function downloadPdf() {
    setIsDownloading(true);
    try {
      await api.download(`/challans/${id}/pdf`, `${challan?.challanNumber ?? 'challan'}.pdf`);
      toast.success('Challan downloaded', `${challan?.challanNumber} saved as a PDF.`);
    } catch (err) {
      toast.error(
        'Download failed',
        err instanceof ApiError ? err.message : 'Could not generate the PDF. Please try again.',
      );
    } finally {
      setIsDownloading(false);
    }
  }

  async function runAction(kind: 'confirm' | 'cancel') {
    setActionError(null);
    setShortfalls([]);
    setIsSubmitting(true);
    try {
      if (kind === 'confirm') {
        const { data } = await api.post<Challan>(`/challans/${id}/confirm`);
        toast.success('Challan confirmed', `${data.challanNumber} dispatched and stock deducted.`);
      } else {
        const { data } = await api.post<Challan>(`/challans/${id}/cancel`, {
          ...(cancelReason.trim() ? { reason: cancelReason.trim() } : {}),
        });
        toast.success(
          'Challan cancelled',
          challan?.status === 'CONFIRMED'
            ? `${data.challanNumber} cancelled and stock returned to inventory.`
            : `${data.challanNumber} cancelled.`,
        );
      }
      setAction(null);
      setCancelReason('');
      refetch();
      refetchMovements();
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message);
        if (err.code === 'INSUFFICIENT_STOCK') {
          const meta = err.meta as
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
        // Keep the dialog open so the operator can read the reason.
      } else {
        setActionError('Unexpected error. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading && !challan) {
    return (
      <Card>
        <LoadingState message="Loading challan…" />
      </Card>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader
          title="Challan"
          breadcrumbs={
            <>
              <Link to="/challans">Sales challans</Link>
              <span aria-hidden="true">/</span>
              <span>Not found</span>
            </>
          }
        />
        <Card>
          <ErrorState
            title={error.status === 404 ? 'Challan not found' : 'Could not load challan'}
            message={
              error.status === 404
                ? 'This challan may have been removed, or the link is incorrect.'
                : error.message
            }
            onRetry={error.status === 404 ? undefined : refetch}
          />
        </Card>
      </>
    );
  }

  if (!challan) return null;

  const isDraft = challan.status === 'DRAFT';
  const isConfirmed = challan.status === 'CONFIRMED';
  const isCancelled = challan.status === 'CANCELLED';

  return (
    <>
      <PageHeader
        title={challan.challanNumber}
        subtitle={
          <>
            {challan.customer?.name}
            {challan.customer?.businessName ? ` · ${challan.customer.businessName}` : ''}
          </>
        }
        breadcrumbs={
          <>
            <Link to="/challans">Sales challans</Link>
            <span aria-hidden="true">/</span>
            <span>{challan.challanNumber}</span>
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={downloadPdf} isLoading={isDownloading}>
              {isDownloading ? 'Preparing…' : '↓ Download PDF'}
            </Button>
            {isDraft && can('challans:cancel') ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setActionError(null);
                  setAction('cancel');
                }}
              >
                Cancel challan
              </Button>
            ) : null}
            {isConfirmed && can('challans:cancel') ? (
              <Button
                variant="danger"
                onClick={() => {
                  setActionError(null);
                  setAction('cancel');
                }}
              >
                Cancel &amp; return stock
              </Button>
            ) : null}
            {isDraft && can('challans:confirm') ? (
              <Button
                variant="primary"
                onClick={() => {
                  setActionError(null);
                  setAction('confirm');
                }}
              >
                Confirm &amp; deduct stock
              </Button>
            ) : null}
          </>
        }
      />

      <div className="stack">
        {isDraft ? (
          <Alert variant="warning" title="Draft — stock has not been deducted">
            This challan is a draft. Inventory is unchanged until it is confirmed.
          </Alert>
        ) : null}
        {isCancelled ? (
          <Alert variant="info" title="Cancelled">
            Cancelled by {challan.cancelledByName ?? 'unknown user'} on{' '}
            {formatDateTime(challan.cancelledAt)}.
            {challan.cancellationReason ? ` Reason: ${challan.cancellationReason}` : ''}
          </Alert>
        ) : null}

        <Card>
          <CardHeader
            title="Challan details"
            actions={
              <Badge variant={CHALLAN_STATUS_VARIANT[challan.status]}>
                {titleCase(challan.status)}
              </Badge>
            }
          />
          <CardBody>
            <div className="detail-grid">
              <DetailItem label="Challan number">
                <span className="mono">{challan.challanNumber}</span>
              </DetailItem>
              <DetailItem label="Customer">
                {can('customers:read') && challan.customerId ? (
                  <Link to={`/customers/${challan.customerId}`}>{challan.customer?.name}</Link>
                ) : (
                  challan.customer?.name
                )}
              </DetailItem>
              <DetailItem label="Customer mobile">{challan.customer?.mobile}</DetailItem>
              <DetailItem label="Status">
                <Badge variant={CHALLAN_STATUS_VARIANT[challan.status]}>
                  {titleCase(challan.status)}
                </Badge>
              </DetailItem>
              <DetailItem label="Total quantity">{formatNumber(challan.totalQuantity)}</DetailItem>
              <DetailItem label="Total value">{formatCurrency(challan.totalAmount)}</DetailItem>
              <DetailItem label="Created by">{challan.createdByName}</DetailItem>
              <DetailItem label="Created on">{formatDateTime(challan.createdAt)}</DetailItem>
              {challan.confirmedAt ? (
                <DetailItem label="Confirmed">
                  {formatDateTime(challan.confirmedAt)}
                  {challan.confirmedByName ? ` by ${challan.confirmedByName}` : ''}
                </DetailItem>
              ) : null}
              {challan.cancelledAt ? (
                <DetailItem label="Cancelled">
                  {formatDateTime(challan.cancelledAt)}
                  {challan.cancelledByName ? ` by ${challan.cancelledByName}` : ''}
                </DetailItem>
              ) : null}
            </div>

            {challan.notes ? (
              <div style={{ marginTop: 'var(--space-5)' }}>
                <DetailItem label="Notes">
                  <span style={{ whiteSpace: 'pre-wrap' }}>{challan.notes}</span>
                </DetailItem>
              </div>
            ) : null}
          </CardBody>
        </Card>

        {/* Line items ------------------------------------------------------- */}
        <Card>
          <CardHeader
            title="Products"
            subtitle="Values shown are the product snapshot captured when this challan was raised — later edits to the catalogue never change this document."
          />
          <CardBody flush>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product (as dispatched)</th>
                    <th>Category</th>
                    <th>Location</th>
                    <th className="table__num">Unit price</th>
                    <th className="table__num">Quantity</th>
                    <th className="table__num">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {(challan.items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="table__primary">
                          {can('products:read') ? (
                            <Link to={`/products/${item.productId}`}>{item.productName}</Link>
                          ) : (
                            item.productName
                          )}
                        </div>
                        <div className="table__secondary mono">{item.productSku}</div>
                      </td>
                      <td className="text-muted">{item.productCategory ?? '—'}</td>
                      <td className="text-muted">{item.productLocation ?? '—'}</td>
                      <td className="table__num">{formatCurrency(item.unitPrice)}</td>
                      <td className="table__num font-medium">{formatNumber(item.quantity)}</td>
                      <td className="table__num">{formatCurrency(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>

          <div className="totals-bar">
            <div className="totals-bar__item">
              <div className="totals-bar__label">Total quantity</div>
              <div className="totals-bar__value">{formatNumber(challan.totalQuantity)}</div>
            </div>
            <div className="totals-bar__item">
              <div className="totals-bar__label">Total value</div>
              <div className="totals-bar__value">{formatCurrency(challan.totalAmount)}</div>
            </div>
          </div>
        </Card>

        {/* Stock impact ----------------------------------------------------- */}
        {can('stock:read') ? (
          <Card>
            <CardHeader
              title="Stock impact"
              subtitle="Movements this challan has posted to the inventory ledger"
            />
            <CardBody flush>
              {relatedMovements.length === 0 ? (
                <div style={{ padding: 'var(--space-5)' }}>
                  <p className="text-sm text-muted">
                    No stock movements yet — a draft challan does not affect inventory.
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table" style={{ minWidth: 620 }}>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Product</th>
                        <th>Type</th>
                        <th className="table__num">Change</th>
                        <th className="table__num">Balance</th>
                        <th>By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatedMovements.map((movement) => (
                        <tr key={movement.id}>
                          <td className="nowrap text-muted">{formatDateTime(movement.createdAt)}</td>
                          <td>
                            <div className="table__primary">{movement.productName}</div>
                            <div className="table__secondary mono">{movement.productSku}</div>
                          </td>
                          <td>
                            <Badge variant={movement.movementType === 'IN' ? 'success' : 'danger'}>
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
                          <td className="text-muted">{movement.createdByName ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        ) : null}
      </div>

      {/* Confirm dialog ----------------------------------------------------- */}
      {action === 'confirm' ? (
        <ConfirmDialog
          title="Confirm this challan?"
          message={
            <>
              This will deduct <strong>{formatNumber(challan.totalQuantity)} units</strong> from
              stock across {challan.items?.length ?? 0} product
              {(challan.items?.length ?? 0) === 1 ? '' : 's'} and record an OUT movement for each
              line. If any line has insufficient stock, nothing will change.
            </>
          }
          confirmLabel="Confirm and deduct stock"
          cancelLabel="Go back"
          isSubmitting={isSubmitting}
          onCancel={() => setAction(null)}
          onConfirm={() => void runAction('confirm')}
        >
          {actionError ? (
            <Alert variant="danger" title="Confirmation failed">
              <div>{actionError}</div>
              {shortfalls.length > 0 ? (
                <ul className="alert__list">
                  {shortfalls.map((shortfall) => (
                    <li key={shortfall.sku}>
                      <strong>{shortfall.productName}</strong> ({shortfall.sku}) — need{' '}
                      {formatNumber(shortfall.requestedQuantity)}, have{' '}
                      {formatNumber(shortfall.availableStock)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          ) : null}
        </ConfirmDialog>
      ) : null}

      {/* Cancel dialog ------------------------------------------------------ */}
      {action === 'cancel' ? (
        <ConfirmDialog
          title="Cancel this challan?"
          message={
            isConfirmed ? (
              <>
                This challan is confirmed. Cancelling will return{' '}
                <strong>{formatNumber(challan.totalQuantity)} units</strong> to stock and record an
                IN movement for every line. This cannot be undone.
              </>
            ) : (
              <>
                This draft will be marked as cancelled. Inventory is unaffected because a draft
                never deducted stock.
              </>
            )
          }
          confirmLabel={isConfirmed ? 'Cancel and return stock' : 'Cancel challan'}
          cancelLabel="Keep challan"
          variant="danger"
          isSubmitting={isSubmitting}
          onCancel={() => {
            setAction(null);
            setCancelReason('');
          }}
          onConfirm={() => void runAction('cancel')}
        >
          <TextAreaField
            label="Reason"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="e.g. Customer cancelled the order"
            optional
            rows={2}
            disabled={isSubmitting}
          />
          {actionError ? <Alert variant="danger">{actionError}</Alert> : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
