import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApiResource, useDebouncedValue } from '../../hooks/useApiResource';
import {
  CHALLAN_STATUS_VARIANT,
  formatCurrency,
  formatDate,
  formatNumber,
  titleCase,
} from '../../lib/format';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  SearchInput,
  TableSkeleton,
} from '../../components/ui';
import { CHALLAN_STATUSES, type Challan } from '../../types/api';

const PAGE_SIZE = 10;

export function ChallanListPage() {
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(searchInput);

  const page = Number(searchParams.get('page') ?? '1');
  const status = searchParams.get('status') ?? '';
  const customerId = searchParams.get('customerId') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';

  const params = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      status: status || undefined,
      customerId: customerId || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [page, debouncedSearch, status, customerId, from, to],
  );

  const { data, meta, isLoading, error, refetch } = useApiResource<Challan[]>('/challans', params);

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

  const hasActiveFilters = Boolean(debouncedSearch || status || customerId || from || to);

  function clearFilters() {
    setSearchInput('');
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  return (
    <>
      <PageHeader
        title="Sales challans"
        subtitle="Dispatch documents. Confirming a challan deducts stock; cancelling a confirmed one returns it."
        actions={
          can('challans:write') ? (
            <Link className="btn btn--primary" to="/challans/new">
              + Create challan
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
            placeholder="Search challan number or customer…"
            aria-label="Search challans"
          />

          <select
            className="select toolbar__filter"
            value={status}
            onChange={(event) => updateFilter('status', event.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {CHALLAN_STATUSES.map((value) => (
              <option key={value} value={value}>
                {titleCase(value)}
              </option>
            ))}
          </select>

          <input
            type="date"
            className="input toolbar__filter"
            value={from}
            onChange={(event) => updateFilter('from', event.target.value)}
            aria-label="From date"
            max={to || undefined}
          />
          <input
            type="date"
            className="input toolbar__filter"
            value={to}
            onChange={(event) => updateFilter('to', event.target.value)}
            aria-label="To date"
            min={from || undefined}
          />

          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>

        <CardBody flush>
          {isLoading && !data ? (
            <TableSkeleton rows={PAGE_SIZE} columns={6} />
          ) : error ? (
            <ErrorState title="Could not load challans" message={error.message} onRetry={refetch} />
          ) : !data || data.length === 0 ? (
            hasActiveFilters ? (
              <EmptyState
                icon="⌕"
                title="No challans match your filters"
                message="Try a different search term, status or date range."
                action={
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon="▤"
                title="No challans yet"
                message="Create a challan to dispatch products to a customer."
                action={
                  can('challans:write') ? (
                    <Link className="btn btn--primary" to="/challans/new">
                      + Create challan
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
                    <th>Challan no.</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th className="table__num">Items</th>
                    <th className="table__num">Total qty</th>
                    <th className="table__num">Value</th>
                    <th>Created</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.map((challan) => (
                    <tr key={challan.id}>
                      <td className="mono">
                        <Link to={`/challans/${challan.id}`}>{challan.challanNumber}</Link>
                      </td>
                      <td>
                        <div className="table__primary">{challan.customer?.name ?? '—'}</div>
                        <div className="table__secondary">
                          {challan.customer?.businessName ?? challan.customer?.mobile ?? '—'}
                        </div>
                      </td>
                      <td>
                        <Badge variant={CHALLAN_STATUS_VARIANT[challan.status]}>
                          {titleCase(challan.status)}
                        </Badge>
                      </td>
                      <td className="table__num">{formatNumber(challan.itemCount ?? 0)}</td>
                      <td className="table__num font-medium">{formatNumber(challan.totalQuantity)}</td>
                      <td className="table__num">{formatCurrency(challan.totalAmount)}</td>
                      <td className="nowrap">
                        <div className="text-muted">{formatDate(challan.createdAt)}</div>
                        <div className="table__secondary">{challan.createdByName ?? '—'}</div>
                      </td>
                      <td>
                        <div className="table__actions">
                          <Link className="btn btn--secondary btn--sm" to={`/challans/${challan.id}`}>
                            View
                          </Link>
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
