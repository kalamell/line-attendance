import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const card = 'bg-surface rounded-[18px]';
const field = 'w-full border border-line rounded-[10px] py-[11px] px-[13px] text-sm';
const lbl = 'block text-xs text-ink-2 mb-1.5';

export function MyProfile({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState<{ name: string; email: string } | null>(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ name: string; email: string | null }>('/me/profile')
      .then((d) => setP({ name: d.name ?? '', email: d.email ?? '' }))
      .catch(() => setP({ name: '', email: '' }));
  }, []);

  function flash(text: string, ok = true) { setMsg({ text, ok }); setTimeout(() => setMsg(null), 2800); }

  async function saveProfile() {
    if (!p) return; setBusy(true);
    try { await api('/me/profile', { method: 'PATCH', body: JSON.stringify({ name: p.name, email: p.email }) }); flash('บันทึกโปรไฟล์แล้ว'); }
    catch { flash('บันทึกไม่สำเร็จ', false); } finally { setBusy(false); }
  }
  async function changePw() {
    if (!pw.next) return; setBusy(true);
    try { await api('/me/password', { method: 'PATCH', body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }) }); setPw({ current: '', next: '' }); flash('เปลี่ยนรหัสผ่านแล้ว'); }
    catch { flash('รหัสผ่านเดิมไม่ถูกต้อง (ใหม่ต้อง ≥6 ตัว)', false); } finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(15,23,32,0.45)] flex items-center justify-center z-[80]">
      <div onClick={(e) => e.stopPropagation()} className={`${card} w-[420px] max-h-[90vh] overflow-y-auto p-6`}>
        <div className="flex items-center mb-[18px]">
          <div className="text-[17px] font-bold flex-1">โปรไฟล์ของฉัน</div>
          <button onClick={onClose} className="border-none bg-transparent text-[20px] text-ink-3 cursor-pointer">×</button>
        </div>

        {msg && <div className="rounded-[10px] py-2.5 px-3.5 text-[13px] font-semibold mb-4" style={{ background: msg.ok ? 'var(--brand-tint)' : 'var(--danger-tint)', color: msg.ok ? 'var(--brand-700)' : 'var(--danger)' }}>{msg.text}</div>}

        <div className="text-[13px] font-bold mb-3">ข้อมูลส่วนตัว</div>
        <label className={lbl}>ชื่อ-นามสกุล</label>
        <input value={p?.name ?? ''} onChange={(e) => p && setP({ ...p, name: e.target.value })} className={`${field} mb-3.5`} />
        <label className={lbl}>อีเมล</label>
        <input value={p?.email ?? ''} onChange={(e) => p && setP({ ...p, email: e.target.value })} type="email" className={`${field} mb-4`} />
        <button onClick={saveProfile} disabled={busy} className="h-[42px] px-5 border-none rounded-[10px] bg-brand text-white font-semibold text-sm cursor-pointer">บันทึกโปรไฟล์</button>

        <div className="h-px bg-line my-[22px]" />

        <div className="text-[13px] font-bold mb-3">เปลี่ยนรหัสผ่าน</div>
        <label className={lbl}>รหัสผ่านเดิม</label>
        <input value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} type="password" className={`${field} mb-3.5`} />
        <label className={lbl}>รหัสผ่านใหม่ (≥6 ตัว)</label>
        <input value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} type="password" className={`${field} mb-4`} />
        <button onClick={changePw} disabled={busy || !pw.next} className="h-[42px] px-5 border border-brand rounded-[10px] bg-white text-brand-700 font-semibold text-sm cursor-pointer">เปลี่ยนรหัสผ่าน</button>
      </div>
    </div>
  );
}
