import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApiResource, useDebouncedValue } from '../../hooks/useApiResource';
import { MOVEMENT_TYPE_VARIANT, formatDateTime, formatNumber } from '../../lib/format';
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
import { MOVEMENT_TYPES, type StockMovement } from '../../types/api';

const PAGE_SIZE = 15;

const REFERENCE_LABELS: Record<string, string> = {
  MANUAL: 'Manual adjustment',
  CHALLAN: 'Sales challan',
  PRODUCT_OPENING: 'Opening stock',
};

export function StockMovementsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(searchInput);

  const page = Number(searchParams.get('page') ?? '1');
  const movementType = searchParams.get('movementType') ?? '';
  const referenceType = searchParams.get('referenceType') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';

  const params = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      movementType: movementType || undefined,
      referenceType: referenceType || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [page, debouncedSearch, movementType, referenceType, from, to],
  );

  const { data, meta, isLoading, error, refetch } = useApiResource<StockMovement[]>(
    '/stock/movements',
    params,
  );

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

  const hasActiveFilters = Boolean(
    debouncedSearch || movementType || referenceType || from || to,
  );

  function clearFilters() {
    setSearchInput('');
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  return (
    <>
      <PageHeader
        title="Stock movements"
        subtitle="The complete, append-only audit trail of every stock change"
      />

      <Card>
        <div className="toolbar">
          <SearchInput
            value={searchInput}
            onChange={(value) => {
              setSearchInput(value);
              updateFilter('search', value);
            }}
            placeholder="Search product, SKU or reason…"
            aria-label="Search stock movements"
          />

          <select
            className="select toolbar__filter"
            value={movementType}
            onChange={(event) => updateFilter('movementType', event.target.value)}
            aria-label="Filter by movement type"
          >
            <option value="">All types</option>
            {MOVEMENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {value === 'IN' ? 'IN — received' : 'OUT — issued'}
              </option>
            ))}
          </select>

          <select
            className="select toolbar__filter"
            value={referenceType}
            onChange={(event) => updateFilter('referenceType', event.target.value)}
            aria-label="Filter by source"
          >
            <option value="">All sources</option>
            {Object.entries(REFERENCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
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
            <ErrorState
              title="Could not load stock movements"
              message={error.message}
              onRetry={refetch}
            />
          ) : !data || data.length === 0 ? (
            <EmptyState
              icon="⇅"
              title={hasActiveFilters ? 'No movements match your filters' : 'No stock movements yet'}
              message={
                hasActiveFilters
                  ? 'Try a different search term or date range.'
                  : 'Movements are recorded when stock is received, issued or dispatched on a challan.'
              }
              action={
                hasActiveFilters ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Product</th>
                    <th>Type</th>
                    <th className="table__num">Change</th>
                    <th className="table__num">Balance</th>
                    <th>Reason</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((movement) => (
                    <tr key={movement.id}>
                      <td className="nowrap text-muted">{formatDateTime(movement.createdAt)}</td>
                      <td>
                        <div className="table__primary">
                          <Link to={`/products/${movement.productId}`}>{movement.productName}</Link>
                        </div>
                        <div className="table__secondary mono">{movement.productSku}</div>
                      </td>
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
                        {movement.referenceType ? (
                          <div className="table__secondary">
                            {REFERENCE_LABELS[movement.referenceType] ?? movement.referenceType}
                          </div>
                        ) : null}
                      </td>
                      <td className="text-muted nowrap">{movement.createdByName ?? '—'}</td>
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
