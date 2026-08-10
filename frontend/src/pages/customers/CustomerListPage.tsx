import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApiResource, useDebouncedValue } from '../../hooks/useApiResource';
import {
  CUSTOMER_STATUS_VARIANT,
  CUSTOMER_TYPE_VARIANT,
  formatDate,
  formatRelativeDueDate,
  isOverdue,
  titleCase,
} from '../../lib/format';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  Pagination,
  PageHeader,
  SearchInput,
  TableSkeleton,
} from '../../components/ui';
import { CUSTOMER_STATUSES, CUSTOMER_TYPES, type Customer } from '../../types/api';

const PAGE_SIZE = 10;

export function CustomerListPage() {
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(searchInput);

  const page = Number(searchParams.get('page') ?? '1');
  const status = searchParams.get('status') ?? '';
  const type = searchParams.get('type') ?? '';

  const params = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      status: status || undefined,
      type: type || undefined,
    }),
    [page, debouncedSearch, status, type],
  );

  const { data, meta, isLoading, error, refetch } = useApiResource<Customer[]>('/customers', params);

  /** Merge a filter change into the URL and reset to the first page. */
  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    setSearchParams(next, { replace: true });
  }

  function changePage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(nextPage));
    setSearchParams(next);
  }

  const hasActiveFilters = Boolean(debouncedSearch || status || type);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Leads and accounts across retail, wholesale and distribution"
        actions={
          can('customers:write') ? (
            <Link className="btn btn--primary" to="/customers/new">
              + Add customer
            </Link>
          ) : null
        }
      />

      <Card>
        <div className="toolbar">
          <SearchInput
            value={searchInput}
            onChange={(value) => {
              setSearchInput(value);
              updateFilter('search', value);
            }}
            placeholder="Search name, business, mobile, email or GST…"
            aria-label="Search customers"
          />

          <select
            className="select toolbar__filter"
            value={status}
            onChange={(event) => updateFilter('status', event.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {CUSTOMER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {titleCase(value)}
              </option>
            ))}
          </select>

          <select
            className="select toolbar__filter"
            value={type}
            onChange={(event) => updateFilter('type', event.target.value)}
            aria-label="Filter by customer type"
          >
            <option value="">All types</option>
            {CUSTOMER_TYPES.map((value) => (
              <option key={value} value={value}>
                {titleCase(value)}
              </option>
            ))}
          </select>

          {hasActiveFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput('');
                setSearchParams(new URLSearchParams(), { replace: true });
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>

        <CardBody flush>
          {isLoading && !data ? (
            <TableSkeleton rows={PAGE_SIZE} columns={5} />
          ) : error ? (
            <ErrorState title="Could not load customers" message={error.message} onRetry={refetch} />
          ) : !data || data.length === 0 ? (
            hasActiveFilters ? (
              <EmptyState
                icon="⌕"
                title="No customers match your filters"
                message="Try a different search term or clear the filters to see everything."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearchInput('');
                      setSearchParams(new URLSearchParams(), { replace: true });
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon="☺"
                title="No customers yet"
                message="Add your first customer to start tracking leads and follow-ups."
                action={
                  can('customers:write') ? (
                    <Link className="btn btn--primary" to="/customers/new">
                      + Add customer
                    </Link>
                  ) : null
                }
              />
            )
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Follow-up</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <div className="table__primary">
                          <Link to={`/customers/${customer.id}`}>{customer.name}</Link>
                        </div>
                        <div className="table__secondary">{customer.businessName ?? '—'}</div>
                      </td>
                      <td>
                        <div>{customer.mobile}</div>
                        <div className="table__secondary">{customer.email ?? '—'}</div>
                      </td>
                      <td>
                        <Badge variant={CUSTOMER_TYPE_VARIANT[customer.customerType]}>
                          {titleCase(customer.customerType)}
                        </Badge>
                      </td>
                      <td>
                        <Badge variant={CUSTOMER_STATUS_VARIANT[customer.status]}>
                          {titleCase(customer.status)}
                        </Badge>
                      </td>
                      <td className="nowrap">
                        {customer.followUpDate ? (
                          <>
                            <div>{formatDate(customer.followUpDate)}</div>
                            <div
                              className="table__secondary"
                              style={
                                isOverdue(customer.followUpDate)
                                  ? { color: 'var(--color-danger-fg)', fontWeight: 550 }
                                  : undefined
                              }
                            >
                              {formatRelativeDueDate(customer.followUpDate)}
                            </div>
                          </>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </td>
                      <td>
                        <div className="table__actions">
                          <Link className="btn btn--secondary btn--sm" to={`/customers/${customer.id}`}>
                            View
                          </Link>
                          {can('customers:write') ? (
                            <Link
                              className="btn btn--ghost btn--sm"
                              to={`/customers/${customer.id}/edit`}
                            >
                              Edit
                            </Link>
                          ) : null}
                        </div>
                      </td>
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
            onPageChange={changePage}
            isLoading={isLoading}
          />
        ) : null}
      </Card>
    </>
  );
}
