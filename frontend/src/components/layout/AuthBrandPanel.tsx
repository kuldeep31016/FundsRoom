import { IconBox, IconReport, IconTruck, IconUsers } from '../ui/icons';

/**
 * The left-hand identity and value panel shared by sign-in and registration.
 *
 * Kept in one place so both screens present the same product story; only the
 * headline text differs between them.
 */

const FEATURES = [
  { Icon: IconUsers, title: 'Customer CRM', text: 'Leads, customers and follow-ups' },
  { Icon: IconBox, title: 'Inventory', text: 'Real-time stock and alerts' },
  { Icon: IconTruck, title: 'Sales & Dispatch', text: 'Challans and dispatch tracking' },
  { Icon: IconReport, title: 'Accounts & Reports', text: 'Financial and stock reports' },
];

export function AuthBrandPanel({
  headline = 'Run your entire business with',
  highlight = 'one connected system',
  lede = 'Manage customers, inventory, sales, warehouse and finance from a single platform.',
}: {
  headline?: string;
  highlight?: string;
  lede?: string;
} = {}) {
  return (
    <section className="auth-brand">
      <header className="auth-brand__head">
        <span className="auth-brand__mark">
          <IconBox width={22} height={22} />
        </span>
        <div>
          <div className="auth-brand__name">
            ERP <em>+ CRM</em>
          </div>
          <div className="auth-brand__tagline">Operate. Manage. Grow.</div>
        </div>
      </header>

      <h1 className="auth-brand__headline">
        {headline} <span>{highlight}</span>
      </h1>

      <p className="auth-brand__lede">{lede}</p>

      <div className="auth-features">
        {FEATURES.map(({ Icon, title, text }) => (
          <div className="auth-feature" key={title}>
            <span className="auth-feature__icon">
              <Icon width={19} height={19} />
            </span>
            <div>
              <div className="auth-feature__title">{title}</div>
              <div className="auth-feature__text">{text}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
