import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { initialsOf, titleCase } from '../../lib/format';
import { Button, ConfirmDialog } from '../ui';
import type { Permission } from '../../types/api';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Item is hidden unless the signed-in role holds this permission. */
  permission: Permission;
  end?: boolean;
}

const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: '▦', permission: 'dashboard:read', end: true }],
  },
  {
    label: 'Sales & CRM',
    items: [
      { to: '/customers', label: 'Customers', icon: '☺', permission: 'customers:read' },
      { to: '/challans', label: 'Sales Challans', icon: '▤', permission: 'challans:read' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { to: '/products', label: 'Products', icon: '▣', permission: 'products:read' },
      { to: '/stock', label: 'Stock Movements', icon: '⇅', permission: 'stock:read' },
    ],
  },
  {
    label: 'Administration',
    items: [{ to: '/users', label: 'Users', icon: '⚙', permission: 'users:read' }],
  },
];

export function AppLayout() {
  const { user, logout, can } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isConfirmingLogout, setIsConfirmingLogout] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => can(item.permission)),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="app-shell">
      {isSidebarOpen ? (
        <div className="sidebar__backdrop" onClick={() => setIsSidebarOpen(false)} aria-hidden="true" />
      ) : null}

      <aside className={`sidebar ${isSidebarOpen ? 'is-open' : ''}`}>
        <div className="sidebar__brand">
          <div className="sidebar__logo" aria-hidden="true">
            EC
          </div>
          <div className="sidebar__brand-text">
            <div className="sidebar__title">ERP + CRM</div>
            <div className="sidebar__subtitle">Operations Portal</div>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label="Main navigation">
          {visibleSections.map((section) => (
            <div key={section.label}>
              <div className="sidebar__section-label">{section.label}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `sidebar__link ${isActive ? 'is-active' : ''}`}
                >
                  <span className="sidebar__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__footer">
          Signed in as <strong>{user ? titleCase(user.role) : ''}</strong>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <Button
            variant="ghost"
            size="sm"
            className="topbar__menu-button"
            onClick={() => setIsSidebarOpen((open) => !open)}
            aria-label="Toggle navigation menu"
            aria-expanded={isSidebarOpen}
          >
            ☰
          </Button>

          <div className="topbar__spacer" />

          <div className="topbar__user">
            <div className="topbar__user-meta">
              <div className="topbar__user-name">{user?.name}</div>
              <div className="topbar__user-role">{user ? titleCase(user.role) : ''}</div>
            </div>
            <div className="avatar" aria-hidden="true">
              {user ? initialsOf(user.name) : '?'}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setIsConfirmingLogout(true)}>
              Sign out
            </Button>
          </div>
        </header>

        <main className="app-content">
          <Outlet />
        </main>
      </div>

      {isConfirmingLogout ? (
        <ConfirmDialog
          title="Sign out?"
          message="You will need to sign in again to continue working."
          confirmLabel="Sign out"
          onCancel={() => setIsConfirmingLogout(false)}
          onConfirm={() => {
            setIsConfirmingLogout(false);
            logout();
            toast.info('Signed out', 'Your session has ended.');
          }}
        />
      ) : null}
    </div>
  );
}
