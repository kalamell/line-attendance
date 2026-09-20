import { Link, Outlet, useLocation } from 'react-router-dom';

export function App() {
  const { pathname } = useLocation();
  const tab = (to: string, label: string) => (
    <Link
      to={to}
      style={{
        padding: '8px 14px',
        borderRadius: 10,
        textDecoration: 'none',
        fontWeight: 600,
        color: pathname.startsWith(to) ? '#04933D' : '#5B6167',
        background: pathname.startsWith(to) ? '#E8F9EF' : 'transparent',
      }}
    >
      {label}
    </Link>
  );

  return (
    <div style={{ fontFamily: 'IBM Plex Sans Thai, system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
        <strong style={{ fontSize: 18 }}>Poszee Console</strong>
        <nav style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          {tab('/super', 'Super Admin')}
          {tab('/hr', 'HR')}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
