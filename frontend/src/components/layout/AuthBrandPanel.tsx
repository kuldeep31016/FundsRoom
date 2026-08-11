import {
  IconBolt,
  IconBox,
  IconBrand,
  IconChart,
  IconReport,
  IconShield,
  IconTruck,
  IconUsers,
} from '../ui/icons';

/**
 * The marketing half of the sign-in and registration screens.
 *
 * Shared between both so the product identity is identical on each, and so the
 * copy lives in exactly one place.
 */

const FEATURES = [
  {
    Icon: IconUsers,
    tint: 'tint-violet',
    title: 'Customer CRM',
    text: 'Manage leads, customers and follow-ups',
  },
  {
    Icon: IconBox,
    tint: 'tint-blue',
    title: 'Inventory Management',
    text: 'Real-time stock tracking, alerts and valuation',
  },
  {
    Icon: IconTruck,
    tint: 'tint-green',
    title: 'Sales & Dispatch',
    text: 'Create challans, dispatch orders, track everything',
  },
  {
    Icon: IconReport,
    tint: 'tint-amber',
    title: 'Accounts & Reports',
    text: 'Financial reports, stock reports and insights',
  },
];

const STATS = [
  { Icon: IconUsers, value: '4', label: 'User Roles' },
  { Icon: IconShield, value: '100%', label: 'Secure' },
  { Icon: IconBolt, value: 'Real-time', label: 'Updates' },
  { Icon: IconChart, value: 'Audited', label: 'Inventory' },
];

export function AuthBrandPanel({
  headline,
  highlight,
  lede,
}: {
  headline?: string;
  highlight?: string;
  lede?: string;
} = {}) {
  return (
    <section className="auth-brand">
      <header className="auth-brand__head">
        <span className="auth-brand__mark">
          <IconBrand width={26} height={26} />
        </span>
        <div>
          <div className="auth-brand__name">
            ERP <em>+ CRM</em>
          </div>
          <div className="auth-brand__tagline">Operate. Manage. Grow.</div>
        </div>
        <span className="auth-brand__version">v1.0.0</span>
      </header>

      <h1 className="auth-brand__headline">
        {headline ?? 'Run your entire business with'} <span>{highlight ?? 'one connected system'}</span>
      </h1>

      <p className="auth-brand__lede">
        {lede ??
          'Manage customers, inventory, sales, warehouse and finance operations from a single, unified platform.'}
      </p>

      <div className="auth-features">
        {FEATURES.map(({ Icon, tint, title, text }) => (
          <div className="auth-feature" key={title}>
            <span className={`auth-feature__icon ${tint}`}>
              <Icon width={20} height={20} />
            </span>
            <div>
              <div className="auth-feature__title">{title}</div>
              <div className="auth-feature__text">{text}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="auth-stats">
        {STATS.map(({ Icon, value, label }) => (
          <div className="auth-stat" key={label}>
            <span className="auth-stat__icon">
              <Icon width={17} height={17} />
            </span>
            <div>
              <div className="auth-stat__value">{value}</div>
              <div className="auth-stat__label">{label}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
