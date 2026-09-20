import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { isAuthed, login } from './lib/api';

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

  const field: React.CSSProperties = {
    width: '100%', height: 44, border: '1px solid var(--line)', borderRadius: 12,
    padding: '0 14px', margin: '6px 0 16px', fontSize: 14,
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={submit} style={{ width: 360, background: 'var(--surface)', padding: 32, borderRadius: 20, boxShadow: '0 12px 40px rgba(17,24,39,0.10)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>TimeLine</div>
            <div style={{ fontSize: 11, color: 'var(--brand-700)', fontWeight: 600 }}>SaaS Console</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 20 }}>เข้าสู่ระบบสำหรับผู้ดูแล</div>
        <label style={{ fontSize: 12, color: 'var(--ink-2)' }}>อีเมล</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required style={field} />
        <label style={{ fontSize: 12, color: 'var(--ink-2)' }}>รหัสผ่าน</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required style={field} />
        {err && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{err}</div>}
        <button type="submit" disabled={busy}
          style={{ width: '100%', height: 48, border: 'none', borderRadius: 12, background: 'var(--brand)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: '0 8px 20px rgba(6,199,85,0.30)' }}>
          {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  );
}

export function App() {
  const [authed, setAuthed] = useState(isAuthed());
  if (!authed) return <LoginScreen onDone={() => setAuthed(true)} />;
  return <Outlet />;
}
