import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const card: React.CSSProperties = { background: 'var(--surface)', borderRadius: 18 };
const field: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px', fontSize: 14, width: '100%' };
const lbl: React.CSSProperties = { fontSize: 12, color: 'var(--ink-2)', margin: '0 0 6px', display: 'block' };

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
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 420, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>โปรไฟล์ของฉัน</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, color: 'var(--ink-3)', cursor: 'pointer' }}>×</button>
        </div>

        {msg && <div style={{ background: msg.ok ? 'var(--brand-tint)' : 'var(--danger-tint)', color: msg.ok ? 'var(--brand-700)' : 'var(--danger)', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{msg.text}</div>}

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>ข้อมูลส่วนตัว</div>
        <label style={lbl}>ชื่อ-นามสกุล</label>
        <input value={p?.name ?? ''} onChange={(e) => p && setP({ ...p, name: e.target.value })} style={{ ...field, marginBottom: 14 }} />
        <label style={lbl}>อีเมล</label>
        <input value={p?.email ?? ''} onChange={(e) => p && setP({ ...p, email: e.target.value })} type="email" style={{ ...field, marginBottom: 16 }} />
        <button onClick={saveProfile} disabled={busy} style={{ height: 42, padding: '0 20px', border: 'none', borderRadius: 10, background: 'var(--brand)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>บันทึกโปรไฟล์</button>

        <div style={{ height: 1, background: 'var(--line)', margin: '22px 0' }} />

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>เปลี่ยนรหัสผ่าน</div>
        <label style={lbl}>รหัสผ่านเดิม</label>
        <input value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} type="password" style={{ ...field, marginBottom: 14 }} />
        <label style={lbl}>รหัสผ่านใหม่ (≥6 ตัว)</label>
        <input value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} type="password" style={{ ...field, marginBottom: 16 }} />
        <button onClick={changePw} disabled={busy || !pw.next} style={{ height: 42, padding: '0 20px', border: '1px solid var(--brand)', borderRadius: 10, background: '#fff', color: 'var(--brand-700)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>เปลี่ยนรหัสผ่าน</button>
      </div>
    </div>
  );
}
