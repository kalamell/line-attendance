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

  const field = 'w-full h-11 rounded-xl border border-line px-3.5 mt-1.5 mb-4 text-sm';

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={submit} className="w-[360px] bg-surface p-8 rounded-[20px] shadow-[0_12px_40px_rgba(17,24,39,0.10)]">
        <div className="flex items-center gap-2.5 mb-[18px]">
          <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
          </div>
          <div>
            <div className="text-[17px] font-bold">TimeLine</div>
            <div className="text-[11px] text-brand-700 font-semibold">SaaS Console</div>
          </div>
        </div>
        <div className="text-[13px] text-ink-2 mb-5">เข้าสู่ระบบสำหรับผู้ดูแล</div>
        <label className="text-xs text-ink-2">อีเมล</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className={field} />
        <label className="text-xs text-ink-2">รหัสผ่าน</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required className={field} />
        {err && <div className="text-danger text-xs mb-3">{err}</div>}
        <button type="submit" disabled={busy}
          className="w-full h-12 rounded-xl bg-brand text-white text-[15px] font-semibold cursor-pointer shadow-[0_8px_20px_rgba(6,199,85,0.30)] disabled:opacity-60">
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
