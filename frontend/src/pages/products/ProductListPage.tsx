import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApiResource, useDebouncedValue } from '../../hooks/useApiResource';
import { formatCurrency, formatNumber } from '../../lib/format';
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
import type { Product } from '../../types/api';

const PAGE_SIZE = 10;

export function ProductListPage() {
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(searchInput);

  const page = Number(searchParams.get('page') ?? '1');
  const category = searchParams.get('category') ?? '';
  const lowStock = searchParams.get('lowStock') === 'true';

  const params = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      category: category || undefined,
      lowStock: lowStock ? 'true' : undefined,
      sortBy: 'name',
      sortOrder: 'asc',
    }),
    [page, debouncedSearch, category, lowStock],
  );

  const { data, meta, isLoading, error, refetch } = useApiResource<Product[]>('/products', params);
  const { data: categories } = useApiResource<string[]>('/products/categories');

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

  const hasActiveFilters = Boolean(debouncedSearch || category || lowStock);

  function clearFilters() {
    setSearchInput('');
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Catalogue, pricing and live stock levels"
        actions={
          can('products:write') ? (
            <Link className="btn btn--primary" to="/products/new">
              + Add product
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
            placeholder="Search name, SKU or category…"
            aria-label="Search products"
          />

          <select
            className="select toolbar__filter"
            value={category}
            onChange={(event) => updateFilter('category', event.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {(categories ?? []).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <Button
            variant={lowStock ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => updateFilter('lowStock', lowStock ? '' : 'true')}
            aria-pressed={lowStock}
          >
            {lowStock ? '✓ ' : ''}Low stock only
          </Button>

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
            <ErrorState title="Could not load products" message={error.message} onRetry={refetch} />
          ) : !data || data.length === 0 ? (
            hasActiveFilters ? (
              <EmptyState
                icon="⌕"
                title="No products match your filters"
                message="Try a different search term or clear the filters."
                action={
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon="▣"
                title="No products yet"
                message="Add your first product to start tracking stock."
                action={
                  can('products:write') ? (
                    <Link className="btn btn--primary" to="/products/new">
                      + Add product
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
                    <th>Product</th>
                    <th>Category</th>
                    <th>Location</th>
                    <th className="table__num">Unit price</th>
                    <th className="table__num">In stock</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div className="product-cell">
                          {product.imageUrl ? (
                            <img className="product-thumb" src={product.imageUrl} alt="" />
                          ) : (
                            <div className="product-thumb product-thumb--empty" aria-hidden="true">
                              ▣
                            </div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div className="table__primary">
                              <Link to={`/products/${product.id}`}>{product.name}</Link>
                              {!product.isActive ? (
                                <>
                                  {' '}
                                  <Badge variant="neutral">Inactive</Badge>
                                </>
                              ) : null}
                            </div>
                            <div className="table__secondary mono">{product.sku}</div>
                          </div>
                        </div>
                      </td>
                      <td>{product.category}</td>
                      <td className="text-muted">{product.location ?? '—'}</td>
                      <td className="table__num">{formatCurrency(product.unitPrice)}</td>
                      <td className="table__num">
                        {product.isLowStock ? (
                          <Badge variant={product.currentStock === 0 ? 'danger' : 'warning'}>
                            {formatNumber(product.currentStock)}
                            {product.currentStock === 0 ? ' · out of stock' : ' · low'}
                          </Badge>
                        ) : (
                          <span className="font-medium">{formatNumber(product.currentStock)}</span>
                        )}
                        <div className="table__secondary">alert at {formatNumber(product.minStockAlert)}</div>
                      </td>
                      <td>
                        <div className="table__actions">
                          <Link className="btn btn--secondary btn--sm" to={`/products/${product.id}`}>
                            View
                          </Link>
                          {can('products:write') ? (
                            <Link className="btn btn--ghost btn--sm" to={`/products/${product.id}/edit`}>
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
