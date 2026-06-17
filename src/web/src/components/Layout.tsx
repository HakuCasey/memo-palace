import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { applyTheme, type Theme } from '../theme';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/memory', label: 'Memory' },
  { to: '/collection', label: 'Collection' },
  { to: '/observation', label: 'Observation' },
  { to: '/evolution', label: 'Evolution' },
];

const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
  },
  sidebar: {
    width: 220,
    background: 'var(--bg-sidebar)',
    borderRight: '1px solid var(--border)',
    padding: '20px 0',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
  },
  logo: {
    color: 'var(--text-accent)',
    fontSize: 18,
    fontWeight: 700 as const,
    padding: '0 20px 20px',
    borderBottom: '1px solid var(--border)',
    marginBottom: 12,
    letterSpacing: 1,
  },
  navLink: {
    display: 'block',
    padding: '10px 20px',
    color: 'var(--text-secondary)',
    textDecoration: 'none',
    fontSize: 14,
    transition: 'all 0.15s',
  },
  navLinkActive: {
    color: 'var(--text-primary)',
    background: '#1f6feb33',
    borderLeft: '3px solid var(--text-accent)',
  },
  main: {
    flex: 1,
    padding: 24,
    overflow: 'auto',
  },
  spacer: {
    flex: 1,
  },
  toggleArea: {
    padding: '12px 20px',
    borderTop: '1px solid var(--border)',
    marginTop: 8,
  },
  toggleBtn: {
    width: '100%',
    padding: '6px 12px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text-primary)',
    fontSize: 12,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
} as const;

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(
    (document.documentElement.dataset.theme as Theme) || 'light'
  );

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <div style={styles.toggleArea}>
      <button type="button" style={styles.toggleBtn} onClick={toggle}>
        Theme: {theme === 'light' ? 'Light' : 'Dark'}
      </button>
    </div>
  );
}

export default function Layout() {
  return (
    <div style={styles.container}>
      <nav style={styles.sidebar}>
        <div style={styles.logo}>MemoPalace</div>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) =>
              isActive
                ? { ...styles.navLink, ...styles.navLinkActive }
                : styles.navLink
            }
          >
            {item.label}
          </NavLink>
        ))}
        <div style={styles.spacer} />
        <ThemeToggle />
      </nav>
      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
