import { query } from '../../db/pool';
import { serializeChallan, serializeCustomer, serializeProduct } from '../../utils/serializers';
import type { ChallanRecord, CustomerRecord, ProductRecord } from '../../types/domain';

/**
 * A single aggregated payload for the dashboard. Computing it server-side keeps
 * the landing screen to one round trip instead of six list calls.
 */
export async function getSummary() {
  const [counters, challanTotals, lowStock, upcomingFollowUps, recentChallans, stockValue] =
    await Promise.all([
      query<{
        customers: number;
        active_customers: number;
        leads: number;
        products: number;
        low_stock: number;
      }>(`
        SELECT
          (SELECT count(*) FROM customers)::bigint                                    AS customers,
          (SELECT count(*) FROM customers WHERE status = 'ACTIVE')::bigint            AS active_customers,
          (SELECT count(*) FROM customers WHERE status = 'LEAD')::bigint              AS leads,
          (SELECT count(*) FROM products WHERE is_active)::bigint                     AS products,
          (SELECT count(*) FROM products
             WHERE is_active AND current_stock <= min_stock_alert)::bigint            AS low_stock
      `),

      query<{
        total: number;
        draft: number;
        confirmed: number;
        cancelled: number;
        confirmed_amount: number;
        confirmed_quantity: number;
      }>(`
        SELECT
          count(*)::bigint                                                        AS total,
          count(*) FILTER (WHERE status = 'DRAFT')::bigint                        AS draft,
          count(*) FILTER (WHERE status = 'CONFIRMED')::bigint                    AS confirmed,
          count(*) FILTER (WHERE status = 'CANCELLED')::bigint                    AS cancelled,
          COALESCE(sum(total_amount)   FILTER (WHERE status = 'CONFIRMED'), 0)    AS confirmed_amount,
          COALESCE(sum(total_quantity) FILTER (WHERE status = 'CONFIRMED'), 0)::bigint AS confirmed_quantity
        FROM challans
      `),

      query<ProductRecord>(`
        SELECT id, name, sku, category, unit_price, current_stock, min_stock_alert,
               location, is_active, created_by, created_at, updated_at
          FROM products
         WHERE is_active AND current_stock <= min_stock_alert
         ORDER BY (current_stock - min_stock_alert) ASC, name ASC
         LIMIT 8
      `),

      query<CustomerRecord>(`
        SELECT id, name, mobile, email, business_name, gst_number, customer_type, address,
               status, follow_up_date, notes, created_by, created_at, updated_at
          FROM customers
         WHERE follow_up_date IS NOT NULL
           AND status <> 'INACTIVE'
           AND follow_up_date <= (CURRENT_DATE + INTERVAL '7 days')
         ORDER BY follow_up_date ASC
         LIMIT 8
      `),

      query<ChallanRecord>(`
        SELECT c.id, c.challan_number, c.customer_id, c.status, c.total_quantity, c.total_amount,
               c.notes, c.created_by, c.confirmed_by, c.confirmed_at, c.cancelled_by,
               c.cancelled_at, c.cancellation_reason, c.created_at, c.updated_at,
               cu.name AS customer_name, cu.business_name AS customer_business_name,
               cu.mobile AS customer_mobile, u.name AS created_by_name,
               (SELECT count(*) FROM challan_items i WHERE i.challan_id = c.id) AS item_count
          FROM challans c
          JOIN customers cu ON cu.id = c.customer_id
          LEFT JOIN users u ON u.id = c.created_by
         ORDER BY c.created_at DESC
         LIMIT 6
      `),

      query<{ value: number }>(
        'SELECT COALESCE(sum(current_stock * unit_price), 0) AS value FROM products WHERE is_active',
      ),
    ]);

  const counts = counters.rows[0];
  const challans = challanTotals.rows[0];

  return {
    customers: {
      total: counts?.customers ?? 0,
      active: counts?.active_customers ?? 0,
      leads: counts?.leads ?? 0,
    },
    products: {
      total: counts?.products ?? 0,
      lowStock: counts?.low_stock ?? 0,
      stockValue: Number((stockValue.rows[0]?.value ?? 0).toFixed(2)),
    },
    challans: {
      total: challans?.total ?? 0,
      draft: challans?.draft ?? 0,
      confirmed: challans?.confirmed ?? 0,
      cancelled: challans?.cancelled ?? 0,
      confirmedAmount: Number((challans?.confirmed_amount ?? 0).toFixed(2)),
      confirmedQuantity: challans?.confirmed_quantity ?? 0,
    },
    lowStockProducts: lowStock.rows.map(serializeProduct),
    upcomingFollowUps: upcomingFollowUps.rows.map(serializeCustomer),
    recentChallans: recentChallans.rows.map((row) => serializeChallan(row)),
  };
}
