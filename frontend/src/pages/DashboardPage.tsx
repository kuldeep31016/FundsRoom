import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApiResource } from '../hooks/useApiResource';
import {
  CHALLAN_STATUS_VARIANT,
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeDueDate,
  isOverdue,
  titleCase,
} from '../lib/format';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Stat,
} from '../components/ui';
import type { DashboardSummary } from '../types/api';

export function DashboardPage() {
  const { user, can } = useAuth();
  const { data, isLoading, error, refetch } = useApiResource<DashboardSummary>('/dashboard/summary');

  const firstName = user?.name.split(' ')[0] ?? 'there';

  if (isLoading && !data) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Loading your workspace…" />
        <Card>
          <LoadingState message="Fetching the latest figures…" />
        </Card>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card>
          <ErrorState
            title="Could not load the dashboard"
            message={error.message}
            onRetry={refetch}
          />
        </Card>
      </>
    );
  }

  if (!data) return null;

  return (
    <>
      <PageHeader
        title={`Good to see you, ${firstName}`}
        subtitle={`You are signed in as ${titleCase(user?.role ?? '')}. Here is where the business stands right now.`}
      />

      <div className="stat-grid">
        <Stat
          label="Customers"
          value={formatNumber(data.customers.total)}
          meta={`${formatNumber(data.customers.active)} active · ${formatNumber(data.customers.leads)} leads`}
        />
        <Stat
          label="Active products"
          value={formatNumber(data.products.total)}
          meta={
            data.products.lowStock > 0 ? (
              <span style={{ color: 'var(--color-warning-fg)', fontWeight: 550 }}>
                {formatNumber(data.products.lowStock)} at or below the alert level
              </span>
            ) : (
              'All items above their alert level'
            )
          }
        />
        <Stat
          label="Inventory value"
          value={formatCurrency(data.products.stockValue)}
          meta="Current stock × unit price"
        />
        <Stat
          label="Challans"
          value={formatNumber(data.challans.total)}
          meta={`${formatNumber(data.challans.draft)} draft · ${formatNumber(data.challans.confirmed)} confirmed · ${formatNumber(data.challans.cancelled)} cancelled`}
        />
        <Stat
          label="Dispatched value"
          value={formatCurrency(data.challans.confirmedAmount)}
          meta={`${formatNumber(data.challans.confirmedQuantity)} units on confirmed challans`}
        />
      </div>

      <div className="grid-2">
        {/* Low stock watchlist -------------------------------------------- */}
        <Card>
          <CardHeader
            title="Low stock watchlist"
            subtitle="Products at or below their minimum alert quantity"
            actions={
              can('products:read') ? (
                <Link className="btn btn--secondary btn--sm" to="/products?lowStock=true">
                  View all
                </Link>
              ) : null
            }
          />
          <CardBody flush>
            {data.lowStockProducts.length === 0 ? (
              <EmptyState
                icon="✓"
                title="Stock levels are healthy"
                message="No product has fallen to its minimum alert quantity."
              />
            ) : (
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 480 }}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="table__num">In stock</th>
                      <th className="table__num">Alert at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lowStockProducts.map((product) => (
                      <tr key={product.id}>
                        <td>
                          <div className="table__primary">
                            {can('products:read') ? (
                              <Link to={`/products/${product.id}`}>{product.name}</Link>
                            ) : (
                              product.name
                            )}
                          </div>
                          <div className="table__secondary mono">{product.sku}</div>
                        </td>
                        <td className="table__num">
                          <Badge variant={product.currentStock === 0 ? 'danger' : 'warning'}>
                            {formatNumber(product.currentStock)}
                          </Badge>
                        </td>
                        <td className="table__num text-muted">{formatNumber(product.minStockAlert)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Follow-ups ------------------------------------------------------ */}
        <Card>
          <CardHeader
            title="Follow-ups due"
            subtitle="Customers to contact within the next 7 days"
            actions={
              can('customers:read') ? (
                <Link className="btn btn--secondary btn--sm" to="/customers">
                  View customers
                </Link>
              ) : null
            }
          />
          <CardBody flush>
            {data.upcomingFollowUps.length === 0 ? (
              <EmptyState
                icon="☺"
                title="Nothing due"
                message="No customer has a follow-up scheduled in the next week."
              />
            ) : (
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 480 }}>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Status</th>
                      <th>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.upcomingFollowUps.map((customer) => (
                      <tr key={customer.id}>
                        <td>
                          <div className="table__primary">
                            {can('customers:read') ? (
                              <Link to={`/customers/${customer.id}`}>{customer.name}</Link>
                            ) : (
                              customer.name
                            )}
                          </div>
                          <div className="table__secondary">
                            {customer.businessName ?? customer.mobile}
                          </div>
                        </td>
                        <td>
                          <Badge variant={customer.status === 'ACTIVE' ? 'success' : 'info'}>
                            {titleCase(customer.status)}
                          </Badge>
                        </td>
                        <td className="nowrap">
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Recent challans --------------------------------------------------- */}
      <Card className="stack" >
        <CardHeader
          title="Recent sales challans"
          subtitle="The latest documents raised across the team"
          actions={
            can('challans:read') ? (
              <Link className="btn btn--secondary btn--sm" to="/challans">
                View all
              </Link>
            ) : null
          }
        />
        <CardBody flush>
          {data.recentChallans.length === 0 ? (
            <EmptyState
              icon="▤"
              title="No challans yet"
              message="Sales challans raised by the team will appear here."
              action={
                can('challans:write') ? (
                  <Link className="btn btn--primary" to="/challans/new">
                    Create the first challan
                  </Link>
                ) : null
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Challan no.</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th className="table__num">Qty</th>
                    <th className="table__num">Value</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentChallans.map((challan) => (
                    <tr key={challan.id}>
                      <td className="mono">
                        <Link to={`/challans/${challan.id}`}>{challan.challanNumber}</Link>
                      </td>
                      <td>
                        <div className="table__primary">{challan.customer?.name}</div>
                        <div className="table__secondary">{challan.customer?.businessName ?? '—'}</div>
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
    </>
  );
}
