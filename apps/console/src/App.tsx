import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { isAuthed, currentUser, logout, login } from './lib/api';

function LoginScreen({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('owner@poszee.com');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(email, password);
      onDone();
    } catch {
      setErr('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'IBM Plex Sans Thai, system-ui, sans-serif' }}>
      <form onSubmit={submit} style={{ width: 340, padding: 28, border: '1px solid #ECEEF1', borderRadius: 16, boxShadow: '0 8px 24px rgba(17,24,39,0.06)' }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Poszee Console</div>
        <div style={{ fontSize: 13, color: '#5B6167', marginBottom: 20 }}>เข้าสู่ระบบสำหรับผู้ดูแล</div>
        <label style={{ fontSize: 12, color: '#5B6167' }}>อีเมล</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
          style={{ width: '100%', height: 42, border: '1px solid #ECEEF1', borderRadius: 10, padding: '0 12px', margin: '6px 0 14px', fontSize: 14 }} />
        <label style={{ fontSize: 12, color: '#5B6167' }}>รหัสผ่าน</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
          style={{ width: '100%', height: 42, border: '1px solid #ECEEF1', borderRadius: 10, padding: '0 12px', margin: '6px 0 14px', fontSize: 14 }} />
        {err && <div style={{ color: '#D93838', fontSize: 12, marginBottom: 12 }}>{err}</div>}
        <button type="submit" disabled={busy}
          style={{ width: '100%', height: 46, border: 'none', borderRadius: 12, background: '#06C755', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
          {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  );
}

export function App() {
  const [authed, setAuthed] = useState(isAuthed());
  const { pathname } = useLocation();

  if (!authed) return <LoginScreen onDone={() => setAuthed(true)} />;

  const me = currentUser();
  const tab = (to: string, label: string) => (
    <Link to={to} style={{ padding: '8px 14px', borderRadius: 10, textDecoration: 'none', fontWeight: 600, color: pathname.startsWith(to) ? '#04933D' : '#5B6167', background: pathname.startsWith(to) ? '#E8F9EF' : 'transparent' }}>
      {label}
    </Link>
  );

  return (
    <div style={{ fontFamily: 'IBM Plex Sans Thai, system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
        <strong style={{ fontSize: 18 }}>Poszee Console</strong>
        <nav style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          {tab('/super', 'Super Admin')}
          {tab('/hr', 'HR')}
          <span style={{ fontSize: 12, color: '#9AA0A6', marginLeft: 8 }}>{me?.name} ({me?.role})</span>
          <button onClick={logout} style={{ border: '1px solid #ECEEF1', background: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>ออก</button>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
