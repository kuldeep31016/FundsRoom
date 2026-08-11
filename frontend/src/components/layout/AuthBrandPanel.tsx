import {
  IconBolt,
  IconBox,
  IconChart,
  IconReport,
  IconShield,
  IconSpark,
  IconTruck,
  IconUsers,
} from '../ui/icons';

/**
 * The left-hand identity and value panel shared by sign-in and registration.
 *
 * Kept in one place so both screens present the same product story; only the
 * headline text differs between them.
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
  headline = 'Run your entire business with',
  highlight = 'one connected system',
  lede = 'Manage customers, inventory, sales, warehouse and finance operations from a single, unified platform.',
}: {
  headline?: string;
  highlight?: string;
  lede?: string;
} = {}) {
  return (
    <section className="auth-brand">
      {/* Decorative city skyline, anchored to the bottom-left corner. */}
      <svg className="auth-skyline" viewBox="0 0 340 140" fill="currentColor" aria-hidden="true">
        <rect x="0" y="70" width="28" height="70" />
        <rect x="32" y="40" width="24" height="100" />
        <rect x="60" y="88" width="20" height="52" />
        <rect x="84" y="20" width="30" height="120" />
        <rect x="118" y="60" width="22" height="80" />
        <rect x="144" y="50" width="26" height="90" />
        <rect x="174" y="94" width="18" height="46" />
        <rect x="196" y="30" width="28" height="110" />
        <rect x="228" y="66" width="20" height="74" />
        <rect x="252" y="46" width="24" height="94" />
        <rect x="280" y="82" width="20" height="58" />
        <rect x="304" y="18" width="30" height="122" />
      </svg>

      {/* Small round badge floating over the gradient. */}
      <span className="auth-orb" aria-hidden="true">
        <IconSpark width={20} height={20} />
      </span>

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
