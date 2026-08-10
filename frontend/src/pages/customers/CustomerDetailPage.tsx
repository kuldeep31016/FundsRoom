import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api-client';
import { useApiResource } from '../../hooks/useApiResource';
import {
  CUSTOMER_STATUS_VARIANT,
  CUSTOMER_TYPE_VARIANT,
  formatDate,
  formatDateTime,
  formatRelativeDueDate,
  isOverdue,
  titleCase,
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
  TextAreaField,
  TextField,
} from '../../components/ui';
import type { Challan, Customer, FollowUp } from '../../types/api';
import { CHALLAN_STATUS_VARIANT, formatCurrency, formatNumber } from '../../lib/format';

const FOLLOW_UP_PAGE_SIZE = 5;

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const toast = useToast();

  const [followUpPage, setFollowUpPage] = useState(1);
  const [isAddingNote, setIsAddingNote] = useState(false);

  const {
    data: customer,
    isLoading,
    error,
    refetch: refetchCustomer,
  } = useApiResource<Customer>(id ? `/customers/${id}` : null);

  const {
    data: followUps,
    meta: followUpMeta,
    isLoading: isLoadingFollowUps,
    error: followUpError,
    refetch: refetchFollowUps,
  } = useApiResource<FollowUp[]>(id ? `/customers/${id}/follow-ups` : null, {
    page: followUpPage,
    limit: FOLLOW_UP_PAGE_SIZE,
  });

  const { data: challans } = useApiResource<Challan[]>(
    id && can('challans:read') ? '/challans' : null,
    { customerId: id, limit: 5 },
  );

  if (isLoading && !customer) {
    return (
      <Card>
        <LoadingState message="Loading customer…" />
      </Card>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader
          title="Customer"
          breadcrumbs={
            <>
              <Link to="/customers">Customers</Link>
              <span aria-hidden="true">/</span>
              <span>Not found</span>
            </>
          }
        />
        <Card>
          <ErrorState
            title={error.status === 404 ? 'Customer not found' : 'Could not load customer'}
            message={
              error.status === 404
                ? 'This customer may have been removed, or the link is incorrect.'
                : error.message
            }
            onRetry={error.status === 404 ? undefined : refetchCustomer}
          />
        </Card>
      </>
    );
  }

  if (!customer) return null;

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={customer.businessName ?? 'No business name recorded'}
        breadcrumbs={
          <>
            <Link to="/customers">Customers</Link>
            <span aria-hidden="true">/</span>
            <span>{customer.name}</span>
          </>
        }
        actions={
          <>
            {can('customers:followup:write') ? (
              <Button variant="secondary" onClick={() => setIsAddingNote(true)}>
                + Add follow-up note
              </Button>
            ) : null}
            {can('customers:write') ? (
              <Link className="btn btn--primary" to={`/customers/${customer.id}/edit`}>
                Edit customer
              </Link>
            ) : null}
          </>
        }
      />

      <div className="stack">
        {customer.followUpDate && isOverdue(customer.followUpDate) ? (
          <Alert variant="warning" title="Follow-up overdue">
            This customer was due to be contacted on {formatDate(customer.followUpDate)} (
            {formatRelativeDueDate(customer.followUpDate)}).
          </Alert>
        ) : null}

        <Card>
          <CardHeader
            title="Account details"
            actions={
              <>
                <Badge variant={CUSTOMER_TYPE_VARIANT[customer.customerType]}>
                  {titleCase(customer.customerType)}
                </Badge>
                <Badge variant={CUSTOMER_STATUS_VARIANT[customer.status]}>
                  {titleCase(customer.status)}
                </Badge>
              </>
            }
          />
          <CardBody>
            <div className="detail-grid">
              <DetailItem label="Mobile">{customer.mobile}</DetailItem>
              <DetailItem label="Email">{customer.email}</DetailItem>
              <DetailItem label="Business name">{customer.businessName}</DetailItem>
              <DetailItem label="GST number">
                {customer.gstNumber ? <span className="mono">{customer.gstNumber}</span> : null}
              </DetailItem>
              <DetailItem label="Next follow-up">
                {customer.followUpDate ? (
                  <>
                    {formatDate(customer.followUpDate)}{' '}
                    <span
                      className="text-xs"
                      style={
                        isOverdue(customer.followUpDate)
                          ? { color: 'var(--color-danger-fg)', fontWeight: 550 }
                          : { color: 'var(--color-text-subtle)' }
                      }
                    >
                      ({formatRelativeDueDate(customer.followUpDate)})
                    </span>
                  </>
                ) : null}
              </DetailItem>
              <DetailItem label="Added by">{customer.createdByName}</DetailItem>
              <DetailItem label="Created">{formatDateTime(customer.createdAt)}</DetailItem>
              <DetailItem label="Last updated">{formatDateTime(customer.updatedAt)}</DetailItem>
            </div>

            {customer.address || customer.notes ? (
              <div className="detail-grid" style={{ marginTop: 'var(--space-5)' }}>
                <DetailItem label="Address">
                  {customer.address ? (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{customer.address}</span>
                  ) : null}
                </DetailItem>
                <DetailItem label="Notes">
                  {customer.notes ? (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{customer.notes}</span>
                  ) : null}
                </DetailItem>
              </div>
            ) : null}
          </CardBody>
        </Card>

        {/* Follow-up activity ------------------------------------------------ */}
        <Card>
          <CardHeader
            title="Follow-up history"
            subtitle="Every contact logged against this customer, newest first"
            actions={
              can('customers:followup:write') ? (
                <Button size="sm" onClick={() => setIsAddingNote(true)}>
                  + Add note
                </Button>
              ) : null
            }
          />
          <CardBody>
            {isLoadingFollowUps && !followUps ? (
              <LoadingState message="Loading follow-ups…" />
            ) : followUpError ? (
              <ErrorState message={followUpError.message} onRetry={refetchFollowUps} />
            ) : !followUps || followUps.length === 0 ? (
              <EmptyState
                icon="✎"
                title="No follow-ups logged yet"
                message="Record calls, visits and emails here to keep the whole team informed."
                action={
                  can('customers:followup:write') ? (
                    <Button variant="primary" onClick={() => setIsAddingNote(true)}>
                      Add the first note
                    </Button>
                  ) : null
                }
              />
            ) : (
              <div className="timeline">
                {followUps.map((followUp) => (
                  <div className="timeline__item" key={followUp.id}>
                    <span className="timeline__dot" aria-hidden="true" />
                    <div className="timeline__meta">
                      <strong>{followUp.createdByName ?? 'Unknown user'}</strong>
                      <span aria-hidden="true">·</span>
                      <span>{formatDateTime(followUp.createdAt)}</span>
                      {followUp.followUpDate ? (
                        <Badge variant="info">Next: {formatDate(followUp.followUpDate)}</Badge>
                      ) : null}
                    </div>
                    <p className="timeline__note">{followUp.note}</p>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
          {followUpMeta && followUpMeta.total > FOLLOW_UP_PAGE_SIZE ? (
            <Pagination
              page={followUpMeta.page}
              totalPages={followUpMeta.totalPages}
              total={followUpMeta.total}
              limit={followUpMeta.limit}
              onPageChange={setFollowUpPage}
              isLoading={isLoadingFollowUps}
            />
          ) : null}
        </Card>

        {/* Related challans -------------------------------------------------- */}
        {can('challans:read') ? (
          <Card>
            <CardHeader
              title="Recent challans"
              subtitle="Dispatch documents raised for this customer"
              actions={
                <Link className="btn btn--secondary btn--sm" to={`/challans?customerId=${customer.id}`}>
                  View all
                </Link>
              }
            />
            <CardBody flush>
              {!challans || challans.length === 0 ? (
                <EmptyState
                  icon="▤"
                  title="No challans for this customer"
                  message="Challans raised for this account will be listed here."
                  action={
                    can('challans:write') ? (
                      <Link className="btn btn--primary" to={`/challans/new?customerId=${customer.id}`}>
                        Create challan
                      </Link>
                    ) : null
                  }
                />
              ) : (
                <div className="table-wrap">
                  <table className="table" style={{ minWidth: 560 }}>
                    <thead>
                      <tr>
                        <th>Challan no.</th>
                        <th>Status</th>
                        <th className="table__num">Qty</th>
                        <th className="table__num">Value</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {challans.map((challan) => (
                        <tr key={challan.id}>
                          <td className="mono">
                            <Link to={`/challans/${challan.id}`}>{challan.challanNumber}</Link>
                          </td>
                          <td>
                            <Badge variant={CHALLAN_STATUS_VARIANT[challan.status]}>
                              {titleCase(challan.status)}
                            </Badge>
                          </td>
                          <td className="table__num">{formatNumber(challan.totalQuantity)}</td>
                          <td className="table__num">{formatCurrency(challan.totalAmount)}</td>
                          <td className="nowrap text-muted">{formatDate(challan.createdAt)}</td>
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

      {isAddingNote && id ? (
        <AddFollowUpDialog
          customerId={id}
          onClose={() => setIsAddingNote(false)}
          onSaved={() => {
            setIsAddingNote(false);
            setFollowUpPage(1);
            refetchFollowUps();
            refetchCustomer();
            toast.success('Follow-up added', 'The note has been saved to this customer.');
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------------- */

function AddFollowUpDialog({
  customerId,
  onClose,
  onSaved,
}: {
  customerId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [errors, setErrors] = useState<{ note?: string; followUpDate?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!note.trim()) {
      setErrors({ note: 'Note is required' });
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post(`/customers/${customerId}/follow-ups`, {
        note: note.trim(),
        ...(followUpDate ? { followUpDate } : {}),
      });
      onSaved();
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
      title="Add follow-up note"
      onClose={isSubmitting ? () => undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} isLoading={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save note'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="stack stack--sm">
          {formError ? <Alert variant="danger">{formError}</Alert> : null}

          <TextAreaField
            label="What happened?"
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setErrors((current) => ({ ...current, note: undefined }));
            }}
            error={errors.note}
            placeholder="e.g. Called to confirm the monthly order. Wants delivery on the 5th."
            required
            autoFocus
            rows={4}
            disabled={isSubmitting}
          />

          <TextField
            label="Next follow-up date"
            type="date"
            value={followUpDate}
            onChange={(event) => setFollowUpDate(event.target.value)}
            error={errors.followUpDate}
            hint="Setting this also updates the customer's next follow-up date."
            optional
            disabled={isSubmitting}
          />
        </div>
      </form>
    </Modal>
  );
}
