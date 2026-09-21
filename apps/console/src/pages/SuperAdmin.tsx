import { useEffect, useState } from 'react';
import { api, currentUser, logout } from '../lib/api';
import { MyProfile } from '../components/MyProfile';

type Tenant = { id: string; name: string; subdomain: string; plan: 'trial' | 'starter' | 'pro'; status: 'active' | 'trial' | 'suspended'; createdAt: string };
type Admin = { id: string; name: string; email: string | null; tenantId: string; tenantName: string; active: boolean };
type Audit = { id: string; action: string; entity: string | null; entityId: string | null; tenantId: string | null; createdAt: string };

const PLAN: Record<string, { c: string; bg: string; label: string }> = {
  pro: { c: 'var(--info)', bg: 'var(--info-tint)', label: 'Pro' },
  starter: { c: 'var(--brand-700)', bg: 'var(--brand-tint)', label: 'Starter' },
  trial: { c: 'var(--warn)', bg: 'var(--warn-tint)', label: 'Trial' },
};
const STATUS: Record<string, { c: string; bg: string; label: string }> = {
  active: { c: 'var(--brand-700)', bg: 'var(--brand-tint)', label: 'ใช้งานอยู่' },
  trial: { c: 'var(--warn)', bg: 'var(--warn-tint)', label: 'ทดลองใช้' },
  suspended: { c: 'var(--danger)', bg: 'var(--danger-tint)', label: 'ระงับ' },
};
const AV = [{ bg: '#EAF1FE', color: '#1D6FE0' }, { bg: 'var(--brand-tint)', color: 'var(--brand-700)' }, { bg: 'var(--warn-tint)', color: 'var(--warn)' }, { bg: 'var(--danger-tint)', color: 'var(--danger)' }];
const card: React.CSSProperties = { background: 'var(--surface)', borderRadius: 18 };
const field: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px', fontSize: 14, width: '100%' };
const lbl: React.CSSProperties = { fontSize: 12, color: 'var(--ink-2)', marginBottom: 6, display: 'block' };
function Badge({ text, c, bg }: { text: string; c: string; bg: string }) { return <span style={{ fontSize: 12, fontWeight: 600, color: c, background: bg, padding: '4px 10px', borderRadius: 999 }}>{text}</span>; }
function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return <div style={{ ...card, padding: 18 }}><div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>{label}</div><div style={{ fontSize: 26, fontWeight: 700, color: color ?? 'var(--ink)' }}>{value}</div></div>;
}

/* ---------- Add-admin modal ---------- */
function AddAdminModal({ tenant, onClose, onDone }: { tenant: Tenant; onClose: () => void; onDone: (msg: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<{ email: string; tempPassword: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const r = await api<{ email: string; tempPassword: string }>(`/tenants/${tenant.id}/admins`, { method: 'POST', body: JSON.stringify({ name, email }) });
      setTemp(r);
      onDone(`เพิ่มแอดมินให้ ${tenant.name} แล้ว`);
    } finally { setBusy(false); }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 400, padding: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>เพิ่มผู้ดูแล — {tenant.name}</div>
        {temp ? (
          <div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', margin: '12px 0' }}>สร้างบัญชีแอดมินแล้ว ส่งรหัสชั่วคราวนี้ให้ผู้ดูแล (แสดงครั้งเดียว):</div>
            <div style={{ ...card, border: '1px solid var(--line)', padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 13 }}><b>อีเมล:</b> {temp.email}</div>
              <div style={{ fontSize: 13 }}><b>รหัสชั่วคราว:</b> <code style={{ background: 'var(--bg)', padding: '2px 8px', borderRadius: 6 }}>{temp.tempPassword}</code></div>
            </div>
            <button onClick={onClose} style={{ width: '100%', height: 44, border: 'none', borderRadius: 11, background: 'var(--brand)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>เสร็จสิ้น</button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ marginTop: 14 }}>
            <label style={lbl}>ชื่อ-นามสกุล</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} style={{ ...field, marginBottom: 14 }} />
            <label style={lbl}>อีเมล</label>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...field, marginBottom: 20 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={busy} style={{ flex: 1, height: 44, border: 'none', borderRadius: 11, background: 'var(--brand)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>{busy ? 'กำลังสร้าง…' : 'สร้างแอดมิน'}</button>
              <button type="button" onClick={onClose} style={{ height: 44, padding: '0 18px', border: '1px solid var(--line)', borderRadius: 11, background: '#fff', color: 'var(--ink-2)', fontWeight: 600, cursor: 'pointer' }}>ยกเลิก</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ---------- Edit-tenant modal ---------- */
function EditTenantModal({ tenant, onClose, onDone }: { tenant: Tenant; onClose: () => void; onDone: (msg: string) => void }) {
  const [f, setF] = useState({ name: tenant.name, subdomain: tenant.subdomain, plan: tenant.plan, status: tenant.status });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api(`/tenants/${tenant.id}`, { method: 'PATCH', body: JSON.stringify(f) });
      onDone(`บันทึกข้อมูล ${f.name} แล้ว`); onClose();
    } catch { setErr('บันทึกไม่สำเร็จ (subdomain อาจซ้ำ)'); } finally { setBusy(false); }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} style={{ ...card, width: 420, padding: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>แก้ไขหน่วยงาน</div>
        {err && <div style={{ background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 10, padding: '9px 13px', fontSize: 13, marginBottom: 14 }}>{err}</div>}
        <label style={lbl}>ชื่อหน่วยงาน</label>
        <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ ...field, marginBottom: 14 }} />
        <label style={lbl}>รหัส (subdomain)</label>
        <input required pattern="[a-z0-9][a-z0-9-]{1,62}" value={f.subdomain} onChange={(e) => setF({ ...f, subdomain: e.target.value })} style={{ ...field, marginBottom: 14 }} />
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1 }}><label style={lbl}>แพ็กเกจ</label><select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value as Tenant['plan'] })} style={field}><option value="trial">Trial</option><option value="starter">Starter</option><option value="pro">Pro</option></select></div>
          <div style={{ flex: 1 }}><label style={lbl}>สถานะ</label><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Tenant['status'] })} style={field}><option value="active">ใช้งานอยู่</option><option value="trial">ทดลองใช้</option><option value="suspended">ระงับ</option></select></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" disabled={busy} style={{ flex: 1, height: 44, border: 'none', borderRadius: 11, background: 'var(--brand)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          <button type="button" onClick={onClose} style={{ height: 44, padding: '0 18px', border: '1px solid var(--line)', borderRadius: 11, background: '#fff', color: 'var(--ink-2)', fontWeight: 600, cursor: 'pointer' }}>ยกเลิก</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Confirm-delete modal (type name to confirm) ---------- */
function ConfirmDeleteModal({ title, message, confirmWord, onClose, onConfirm }: { title: string; message: string; confirmWord?: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = !confirmWord || typed.trim() === confirmWord;
  async function go() {
    if (!ready) return; setBusy(true); setErr(null);
    try { await onConfirm(); onClose(); }
    catch (e) {
      const raw = e instanceof Error ? e.message.replace(/^\d+\s*/, '') : '';
      let msg = raw;
      try { const j = JSON.parse(raw); if (j?.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message; } catch { /* not json */ }
      setErr(msg || 'ลบไม่สำเร็จ'); setBusy(false);
    }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 400, padding: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)', marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 16 }}>{message}</div>
        {err && <div style={{ background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 10, padding: '9px 13px', fontSize: 13, marginBottom: 14 }}>{err}</div>}
        {confirmWord && (<>
          <label style={lbl}>พิมพ์ “<b>{confirmWord}</b>” เพื่อยืนยัน</label>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} style={{ ...field, marginBottom: 18 }} />
        </>)}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={go} disabled={!ready || busy} style={{ flex: 1, height: 44, border: 'none', borderRadius: 11, background: ready ? 'var(--danger)' : '#E7A9A9', color: '#fff', fontWeight: 600, cursor: ready ? 'pointer' : 'not-allowed' }}>{busy ? 'กำลังลบ…' : 'ลบถาวร'}</button>
          <button onClick={onClose} style={{ height: 44, padding: '0 18px', border: '1px solid var(--line)', borderRadius: 11, background: '#fff', color: 'var(--ink-2)', fontWeight: 600, cursor: 'pointer' }}>ยกเลิก</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Tenants view ---------- */
function TenantsView({ toast }: { toast: (m: string) => void }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', subdomain: '', plan: 'trial', adminEmail: '' });
  const [busy, setBusy] = useState(false);
  const [addFor, setAddFor] = useState<Tenant | null>(null);
  const [editFor, setEditFor] = useState<Tenant | null>(null);
  const [delFor, setDelFor] = useState<Tenant | null>(null);
  const load = () => api<Tenant[]>('/tenants').then(setTenants).catch(() => {});
  useEffect(() => { load(); }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await api('/tenants', { method: 'POST', body: JSON.stringify(form) });
      setShowCreate(false); setForm({ name: '', subdomain: '', plan: 'trial', adminEmail: '' });
      toast('สร้างหน่วยงานใหม่แล้ว'); load();
    } finally { setBusy(false); }
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 22 }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>หน่วยงานทั้งหมด</div>
        <button onClick={() => setShowCreate((v) => !v)} style={{ height: 44, padding: '0 20px', border: 'none', borderRadius: 12, background: 'var(--brand)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 6px 16px rgba(6,199,85,0.28)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>สร้างหน่วยงาน
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 22 }}>
        <Stat label="หน่วยงานทั้งหมด" value={tenants.length} />
        <Stat label="ใช้งานอยู่" value={tenants.filter((t) => t.status === 'active').length} color="var(--brand-700)" />
        <Stat label="ทดลองใช้" value={tenants.filter((t) => t.status === 'trial').length} color="var(--warn)" />
        <Stat label="แพ็กเกจ Pro" value={tenants.filter((t) => t.plan === 'pro').length} color="var(--info)" />
      </div>
      {showCreate && (
        <form onSubmit={create} style={{ ...card, border: '1.5px solid var(--brand)', padding: 22, marginBottom: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>สร้างหน่วยงานใหม่</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 18 }}>
            <div><label style={lbl}>ชื่อหน่วยงาน</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={field} /></div>
            <div><label style={lbl}>รหัส (subdomain)</label><input required pattern="[a-z0-9][a-z0-9-]{1,62}" value={form.subdomain} onChange={(e) => setForm({ ...form, subdomain: e.target.value })} style={field} /></div>
            <div><label style={lbl}>แพ็กเกจ</label><select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} style={field}><option value="trial">Trial</option><option value="starter">Starter</option><option value="pro">Pro</option></select></div>
          </div>
          <label style={lbl}>อีเมลแอดมินคนแรก</label>
          <input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} style={{ ...field, marginBottom: 20 }} />
          <button type="submit" disabled={busy} style={{ height: 44, padding: '0 22px', border: 'none', borderRadius: 11, background: 'var(--brand)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>{busy ? 'กำลังสร้าง…' : 'สร้างหน่วยงาน'}</button>
        </form>
      )}
      <div style={{ ...card, padding: '8px 20px 12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 12 }}><th style={{ padding: 10 }}>หน่วยงาน</th><th style={{ padding: 10 }}>แพ็กเกจ</th><th style={{ padding: 10 }}>สถานะ</th><th style={{ padding: 10, textAlign: 'right' }}></th></tr></thead>
          <tbody>
            {tenants.map((t, i) => (
              <tr key={t.id} style={{ borderTop: '1px solid #F2F3F5' }}>
                <td style={{ padding: 12 }}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ width: 40, height: 40, borderRadius: 11, background: AV[i % 4].bg, color: AV[i % 4].color, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.name[0]}</span><div><div style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t.subdomain}.poszee.com</div></div></div></td>
                <td style={{ padding: 12 }}><Badge text={PLAN[t.plan].label} c={PLAN[t.plan].c} bg={PLAN[t.plan].bg} /></td>
                <td style={{ padding: 12 }}><Badge text={STATUS[t.status].label} c={STATUS[t.status].c} bg={STATUS[t.status].bg} /></td>
                <td style={{ padding: 12, textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <button onClick={() => setAddFor(t)} style={{ height: 32, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 9, background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ แอดมิน</button>
                    <button onClick={() => setEditFor(t)} style={{ height: 32, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 9, background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>แก้ไข</button>
                    <button onClick={() => setDelFor(t)} title="ลบหน่วยงาน" style={{ height: 32, width: 32, border: '1px solid #F3D4D4', borderRadius: 9, background: '#fff', color: 'var(--danger)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" /></svg></button>
                  </div>
                </td>
              </tr>
            ))}
            {tenants.length === 0 && <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>ยังไม่มีหน่วยงาน</td></tr>}
          </tbody>
        </table>
      </div>
      {addFor && <AddAdminModal tenant={addFor} onClose={() => setAddFor(null)} onDone={toast} />}
      {editFor && <EditTenantModal tenant={editFor} onClose={() => setEditFor(null)} onDone={(m) => { toast(m); load(); }} />}
      {delFor && <ConfirmDeleteModal title="ลบหน่วยงาน" confirmWord={delFor.name} message={`ลบ “${delFor.name}” และข้อมูลทั้งหมด (พนักงาน, การลงเวลา, เงินเดือน, ผู้ดูแล) อย่างถาวร — กู้คืนไม่ได้`} onClose={() => setDelFor(null)} onConfirm={async () => { await api(`/tenants/${delFor.id}`, { method: 'DELETE' }); toast(`ลบ ${delFor.name} แล้ว`); load(); }} />}
    </div>
  );
}

/* ---------- Edit-admin modal ---------- */
function EditAdminModal({ admin, onClose, onDone }: { admin: Admin; onClose: () => void; onDone: (msg: string) => void }) {
  const [f, setF] = useState({ name: admin.name, email: admin.email ?? '', active: admin.active });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [temp, setTemp] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api(`/admins/${admin.id}`, { method: 'PATCH', body: JSON.stringify(f) }); onDone(`บันทึกข้อมูล ${f.name} แล้ว`); onClose(); }
    catch { setErr('บันทึกไม่สำเร็จ'); } finally { setBusy(false); }
  }
  async function resetPw() {
    setBusy(true); setErr(null);
    try { const r = await api<{ tempPassword: string }>(`/admins/${admin.id}/reset-password`, { method: 'POST' }); setTemp(r.tempPassword); }
    catch { setErr('รีเซ็ตรหัสไม่สำเร็จ'); } finally { setBusy(false); }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={save} style={{ ...card, width: 400, padding: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>แก้ไขผู้ดูแล</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 16 }}>{admin.tenantName}</div>
        {err && <div style={{ background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 10, padding: '9px 13px', fontSize: 13, marginBottom: 14 }}>{err}</div>}
        <label style={lbl}>ชื่อ-นามสกุล</label>
        <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ ...field, marginBottom: 14 }} />
        <label style={lbl}>อีเมล</label>
        <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} style={{ ...field, marginBottom: 14 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 18, cursor: 'pointer' }}>
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> เปิดใช้งานบัญชี
        </label>
        {temp ? (
          <div style={{ ...card, border: '1px solid var(--line)', padding: 12, marginBottom: 16, fontSize: 13 }}>รหัสชั่วคราวใหม่: <code style={{ background: 'var(--bg)', padding: '2px 8px', borderRadius: 6 }}>{temp}</code><div style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 4 }}>ส่งให้ผู้ดูแล (แสดงครั้งเดียว)</div></div>
        ) : (
          <button type="button" onClick={resetPw} disabled={busy} style={{ width: '100%', height: 40, border: '1px solid var(--line)', borderRadius: 10, background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', marginBottom: 16 }}>รีเซ็ตรหัสผ่าน</button>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" disabled={busy} style={{ flex: 1, height: 44, border: 'none', borderRadius: 11, background: 'var(--brand)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          <button type="button" onClick={onClose} style={{ height: 44, padding: '0 18px', border: '1px solid var(--line)', borderRadius: 11, background: '#fff', color: 'var(--ink-2)', fontWeight: 600, cursor: 'pointer' }}>ปิด</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Admins view ---------- */
function AdminsView({ toast }: { toast: (m: string) => void }) {
  const [rows, setRows] = useState<Admin[]>([]);
  const [editFor, setEditFor] = useState<Admin | null>(null);
  const [delFor, setDelFor] = useState<Admin | null>(null);
  const load = () => api<Admin[]>('/admins').then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 22 }}>ผู้ดูแลระบบหน่วยงาน</div>
      <div style={{ ...card, padding: '8px 20px 12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 12 }}><th style={{ padding: 10 }}>ชื่อ</th><th style={{ padding: 10 }}>อีเมล</th><th style={{ padding: 10 }}>หน่วยงาน</th><th style={{ padding: 10 }}>สถานะ</th><th style={{ padding: 10, textAlign: 'right' }}></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #F2F3F5' }}>
                <td style={{ padding: 12, fontSize: 14, fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: 12, fontSize: 13, color: 'var(--ink-2)' }}>{r.email ?? '—'}</td>
                <td style={{ padding: 12, fontSize: 13 }}>{r.tenantName}</td>
                <td style={{ padding: 12 }}>{r.active ? <Badge text="ใช้งาน" c="var(--brand-700)" bg="var(--brand-tint)" /> : <Badge text="ปิดใช้งาน" c="var(--ink-3)" bg="#F0F2F4" />}</td>
                <td style={{ padding: 12, textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <button onClick={() => setEditFor(r)} style={{ height: 32, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 9, background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>แก้ไข</button>
                    <button onClick={() => setDelFor(r)} title="ลบผู้ดูแล" style={{ height: 32, width: 32, border: '1px solid #F3D4D4', borderRadius: 9, background: '#fff', color: 'var(--danger)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" /></svg></button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>ยังไม่มีผู้ดูแล</td></tr>}
          </tbody>
        </table>
      </div>
      {editFor && <EditAdminModal admin={editFor} onClose={() => setEditFor(null)} onDone={(m) => { toast(m); load(); }} />}
      {delFor && <ConfirmDeleteModal title="ลบผู้ดูแล" message={`ลบผู้ดูแล “${delFor.name}” (${delFor.tenantName})? หากเคยอนุมัติรายการในระบบ ระบบจะให้ปิดการใช้งานแทน`} onClose={() => setDelFor(null)} onConfirm={async () => { await api(`/admins/${delFor.id}`, { method: 'DELETE' }); toast(`ลบ ${delFor.name} แล้ว`); load(); }} />}
    </div>
  );
}

/* ---------- Billing / plan view ---------- */
function BillingView({ toast }: { toast: (m: string) => void }) {
  const [rows, setRows] = useState<Tenant[]>([]);
  const load = () => api<Tenant[]>('/tenants').then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);
  async function patch(id: string, body: Partial<Tenant>) {
    await api(`/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    toast('อัปเดตหน่วยงานแล้ว'); load();
  }
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 22 }}>แพ็กเกจ & สถานะ</div>
      <div style={{ ...card, padding: '8px 20px 12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 12 }}><th style={{ padding: 10 }}>หน่วยงาน</th><th style={{ padding: 10 }}>แพ็กเกจ</th><th style={{ padding: 10 }}>สถานะ</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} style={{ borderTop: '1px solid #F2F3F5' }}>
                <td style={{ padding: 12, fontSize: 14, fontWeight: 600 }}>{t.name}<div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 400 }}>{t.subdomain}.poszee.com</div></td>
                <td style={{ padding: 12 }}><select value={t.plan} onChange={(e) => patch(t.id, { plan: e.target.value as Tenant['plan'] })} style={{ ...field, width: 130 }}><option value="trial">Trial</option><option value="starter">Starter</option><option value="pro">Pro</option></select></td>
                <td style={{ padding: 12 }}><select value={t.status} onChange={(e) => patch(t.id, { status: e.target.value as Tenant['status'] })} style={{ ...field, width: 150 }}><option value="active">ใช้งานอยู่</option><option value="trial">ทดลองใช้</option><option value="suspended">ระงับ</option></select></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Audit view ---------- */
function AuditView() {
  const [rows, setRows] = useState<Audit[]>([]);
  useEffect(() => { api<Audit[]>('/audit').then(setRows).catch(() => {}); }, []);
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 22 }}>บันทึกระบบ (Audit)</div>
      <div style={{ ...card, padding: '8px 20px 12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 12 }}><th style={{ padding: 10 }}>การกระทำ</th><th style={{ padding: 10 }}>อ้างอิง</th><th style={{ padding: 10 }}>เวลา</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #F2F3F5' }}>
                <td style={{ padding: 12, fontSize: 13, fontWeight: 600 }}>{r.action}</td>
                <td style={{ padding: 12, fontSize: 12, color: 'var(--ink-3)' }}>{r.entity} · {r.entityId?.slice(0, 8)}</td>
                <td style={{ padding: 12, fontSize: 13, color: 'var(--ink-2)' }}>{new Date(r.createdAt).toLocaleString('th-TH')}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={3} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>ยังไม่มีบันทึก</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- shell ---------- */
const NAV = [
  { key: 'tenants', label: 'หน่วยงาน', d: 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4' },
  { key: 'admins', label: 'ผู้ดูแลระบบ', d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z' },
  { key: 'billing', label: 'แพ็กเกจ & บิล', d: 'M2 5h20v14H2zM2 10h20' },
  { key: 'audit', label: 'บันทึกระบบ (Audit)', d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M9 15h6' },
] as const;

export function SuperAdminPage() {
  const me = currentUser();
  const [view, setView] = useState<string>('tenants');
  const [showProfile, setShowProfile] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <aside style={{ width: 244, flexShrink: 0, background: 'var(--sidebar)', padding: '22px 16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 6px 22px' }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg></div>
          <div><div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>TimeLine</div><div style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}>SaaS Platform</div></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV.map((n) => (
            <button key={n.key} onClick={() => setView(n.key)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', border: 'none', background: view === n.key ? 'rgba(6,199,85,0.16)' : 'transparent', color: view === n.key ? '#fff' : '#9AA6B2', fontWeight: 500, fontSize: 14, padding: '11px 14px', borderRadius: 11, cursor: 'pointer', textAlign: 'left' }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={view === n.key ? '#06C755' : '#9AA6B2'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={n.d} /></svg>{n.label}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--brand)', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{me?.name?.[0] ?? 'S'}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{me?.name ?? 'Super Admin'}</div><div style={{ fontSize: 11, color: '#6B7683' }}>platform owner</div></div>
          <button onClick={() => setShowProfile(true)} title="โปรไฟล์ของฉัน" style={{ border: 'none', background: 'rgba(255,255,255,0.08)', color: '#9AA6B2', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /></svg></button>
          <button onClick={logout} title="ออกจากระบบ" style={{ border: 'none', background: 'rgba(255,255,255,0.08)', color: '#9AA6B2', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></svg></button>
        </div>
      </aside>
      {showProfile && <MyProfile onClose={() => setShowProfile(false)} />}

      <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', position: 'relative' }}>
        {toast && <div style={{ position: 'fixed', top: 20, right: 28, background: 'var(--brand-tint)', border: '1px solid #C9F0DA', borderRadius: 12, padding: '12px 16px', color: 'var(--brand-700)', fontWeight: 600, fontSize: 13, zIndex: 60 }}>{toast}</div>}
        {view === 'tenants' && <TenantsView toast={showToast} />}
        {view === 'admins' && <AdminsView toast={showToast} />}
        {view === 'billing' && <BillingView toast={showToast} />}
        {view === 'audit' && <AuditView />}
      </main>
    </div>
  );
}
