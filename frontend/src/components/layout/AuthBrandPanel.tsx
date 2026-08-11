import { IconBox, IconReport, IconTruck, IconUsers } from '../ui/icons';

/**
 * The left-hand identity and value panel shared by sign-in and registration.
 *
 * Kept in one place so both screens present the same product story; only the
 * headline text differs between them.
 */

const FEATURES = [
  { Icon: IconUsers, title: 'Customer CRM', text: 'Leads, accounts and follow-ups in one pipeline' },
  { Icon: IconBox, title: 'Inventory', text: 'Live stock levels with an audited movement ledger' },
  { Icon: IconTruck, title: 'Sales & Dispatch', text: 'Challans that deduct stock transactionally' },
  { Icon: IconReport, title: 'Accounts & Reports', text: 'Read-only visibility across every module' },
];

export function AuthBrandPanel({
  headline = 'Run your operation from',
  highlight = 'one connected system',
  lede = 'Customers, inventory and dispatch for a wholesale distribution business — with stock levels that stay honest.',
}: {
  headline?: string;
  highlight?: string;
  lede?: string;
}) {
  return (
    <aside className="auth-brand">
      {/* A soft curved edge in place of a hard vertical rule between the two
          panels. viewBox uses a 0–100 height so the path scales with the
          column regardless of viewport height. */}
      <svg
        className="auth-brand__wave"
        viewBox="0 0 40 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0,0 H24 C 10,16 10,30 24,42 C 34,50 34,54 24,62 C 10,72 10,84 24,100 H0 Z"
          fill="currentColor"
        />
        {/* A visible stroke along the curve itself — the two paper tones are
            close enough that the fill alone reads as a straight edge. */}
        <path
          d="M24,0 C 10,16 10,30 24,42 C 34,50 34,54 24,62 C 10,72 10,84 24,100"
          fill="none"
          stroke="var(--rule)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <header className="auth-brand__head">
        <span className="auth-brand__mark">EC</span>
        <span className="auth-brand__name">ERP &amp; CRM Operations</span>
      </header>

      <div>
        <h1 className="auth-brand__headline">
          {headline} <em>{highlight}</em>
        </h1>
        <p className="auth-brand__lede" style={{ marginTop: 'var(--space-4)' }}>
          {lede}
        </p>
      </div>

      <div className="auth-features">
        {FEATURES.map(({ Icon, title, text }) => (
          <div className="auth-feature" key={title}>
            <span className="auth-feature__icon">
              <Icon width={18} height={18} />
            </span>
            <div>
              <div className="auth-feature__title">{title}</div>
              <div className="auth-feature__text">{text}</div>
            </div>
          </div>
        ))}
      </div>

      <p className="auth-brand__foot">Internal use only · v1.0.0</p>
    </aside>
  );
}
