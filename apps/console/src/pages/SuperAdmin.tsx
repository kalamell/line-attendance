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
const card = 'bg-surface rounded-[18px]';
const field = 'w-full border border-line rounded-[10px] py-[11px] px-[13px] text-sm';
const lbl = 'block text-xs text-ink-2 mb-1.5';
function Badge({ text, c, bg }: { text: string; c: string; bg: string }) { return <span className="text-xs font-semibold py-1 px-2.5 rounded-full" style={{ color: c, background: bg }}>{text}</span>; }
function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return <div className={`${card} p-[18px]`}><div className="text-xs text-ink-2 mb-2">{label}</div><div className="text-[26px] font-bold" style={{ color: color ?? 'var(--ink)' }}>{value}</div></div>;
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
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(15,23,32,0.45)] flex items-center justify-center z-50">
      <div onClick={(e) => e.stopPropagation()} className={`${card} w-[400px] p-6`}>
        <div className="text-[16px] font-bold mb-1">เพิ่มผู้ดูแล — {tenant.name}</div>
        {temp ? (
          <div>
            <div className="text-[13px] text-ink-2 my-3">สร้างบัญชีแอดมินแล้ว ส่งรหัสชั่วคราวนี้ให้ผู้ดูแล (แสดงครั้งเดียว):</div>
            <div className={`${card} border border-line p-3.5 mb-4`}>
              <div className="text-[13px]"><b>อีเมล:</b> {temp.email}</div>
              <div className="text-[13px]"><b>รหัสชั่วคราว:</b> <code className="bg-bg py-0.5 px-2 rounded-md">{temp.tempPassword}</code></div>
            </div>
            <button onClick={onClose} className="w-full h-11 border-none rounded-[11px] bg-brand text-white font-semibold cursor-pointer">เสร็จสิ้น</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-3.5">
            <label className={lbl}>ชื่อ-นามสกุล</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={`${field} mb-3.5`} />
            <label className={lbl}>อีเมล</label>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${field} mb-5`} />
            <div className="flex gap-2.5">
              <button type="submit" disabled={busy} className="flex-1 h-11 border-none rounded-[11px] bg-brand text-white font-semibold cursor-pointer">{busy ? 'กำลังสร้าง…' : 'สร้างแอดมิน'}</button>
              <button type="button" onClick={onClose} className="h-11 px-[18px] border border-line rounded-[11px] bg-white text-ink-2 font-semibold cursor-pointer">ยกเลิก</button>
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
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(15,23,32,0.45)] flex items-center justify-center z-50">
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className={`${card} w-[420px] p-6`}>
        <div className="text-[16px] font-bold mb-4">แก้ไขหน่วยงาน</div>
        {err && <div className="bg-danger-tint text-danger rounded-[10px] py-[9px] px-[13px] text-[13px] mb-3.5">{err}</div>}
        <label className={lbl}>ชื่อหน่วยงาน</label>
        <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={`${field} mb-3.5`} />
        <label className={lbl}>รหัส (subdomain)</label>
        <input required pattern="[a-z0-9][a-z0-9-]{1,62}" value={f.subdomain} onChange={(e) => setF({ ...f, subdomain: e.target.value })} className={`${field} mb-3.5`} />
        <div className="flex gap-3 mb-5">
          <div className="flex-1"><label className={lbl}>แพ็กเกจ</label><select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value as Tenant['plan'] })} className={field}><option value="trial">Trial</option><option value="starter">Starter</option><option value="pro">Pro</option></select></div>
          <div className="flex-1"><label className={lbl}>สถานะ</label><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Tenant['status'] })} className={field}><option value="active">ใช้งานอยู่</option><option value="trial">ทดลองใช้</option><option value="suspended">ระงับ</option></select></div>
        </div>
        <div className="flex gap-2.5">
          <button type="submit" disabled={busy} className="flex-1 h-11 border-none rounded-[11px] bg-brand text-white font-semibold cursor-pointer">{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          <button type="button" onClick={onClose} className="h-11 px-[18px] border border-line rounded-[11px] bg-white text-ink-2 font-semibold cursor-pointer">ยกเลิก</button>
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
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(15,23,32,0.45)] flex items-center justify-center z-[60]">
      <div onClick={(e) => e.stopPropagation()} className={`${card} w-[400px] p-6`}>
        <div className="text-[16px] font-bold text-danger mb-2.5">{title}</div>
        <div className="text-[13px] text-ink-2 leading-[1.6] mb-4">{message}</div>
        {err && <div className="bg-danger-tint text-danger rounded-[10px] py-[9px] px-[13px] text-[13px] mb-3.5">{err}</div>}
        {confirmWord && (<>
          <label className={lbl}>พิมพ์ “<b>{confirmWord}</b>” เพื่อยืนยัน</label>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} className={`${field} mb-[18px]`} />
        </>)}
        <div className="flex gap-2.5">
          <button onClick={go} disabled={!ready || busy} className="flex-1 h-11 border-none rounded-[11px] text-white font-semibold" style={{ background: ready ? 'var(--danger)' : '#E7A9A9', cursor: ready ? 'pointer' : 'not-allowed' }}>{busy ? 'กำลังลบ…' : 'ลบถาวร'}</button>
          <button onClick={onClose} className="h-11 px-[18px] border border-line rounded-[11px] bg-white text-ink-2 font-semibold cursor-pointer">ยกเลิก</button>
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
      <div className="flex items-center mb-[22px]">
        <div className="flex-1 text-[18px] font-bold">หน่วยงานทั้งหมด</div>
        <button onClick={() => setShowCreate((v) => !v)} className="h-11 px-5 border-none rounded-xl bg-brand text-white text-sm font-semibold cursor-pointer flex items-center gap-2 shadow-[0_6px_16px_rgba(6,199,85,0.28)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>สร้างหน่วยงาน
        </button>
      </div>
      <div className="grid grid-cols-4 gap-4 mb-[22px]">
        <Stat label="หน่วยงานทั้งหมด" value={tenants.length} />
        <Stat label="ใช้งานอยู่" value={tenants.filter((t) => t.status === 'active').length} color="var(--brand-700)" />
        <Stat label="ทดลองใช้" value={tenants.filter((t) => t.status === 'trial').length} color="var(--warn)" />
        <Stat label="แพ็กเกจ Pro" value={tenants.filter((t) => t.plan === 'pro').length} color="var(--info)" />
      </div>
      {showCreate && (
        <form onSubmit={create} className={`${card} border-[1.5px] border-brand p-[22px] mb-[22px]`}>
          <div className="text-[15px] font-bold mb-4">สร้างหน่วยงานใหม่</div>
          <div className="grid grid-cols-3 gap-3.5 mb-[18px]">
            <div><label className={lbl}>ชื่อหน่วยงาน</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} /></div>
            <div><label className={lbl}>รหัส (subdomain)</label><input required pattern="[a-z0-9][a-z0-9-]{1,62}" value={form.subdomain} onChange={(e) => setForm({ ...form, subdomain: e.target.value })} className={field} /></div>
            <div><label className={lbl}>แพ็กเกจ</label><select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className={field}><option value="trial">Trial</option><option value="starter">Starter</option><option value="pro">Pro</option></select></div>
          </div>
          <label className={lbl}>อีเมลแอดมินคนแรก</label>
          <input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} className={`${field} mb-5`} />
          <button type="submit" disabled={busy} className="h-11 px-[22px] border-none rounded-[11px] bg-brand text-white font-semibold cursor-pointer">{busy ? 'กำลังสร้าง…' : 'สร้างหน่วยงาน'}</button>
        </form>
      )}
      <div className={`${card} pt-2 px-5 pb-3`}>
        <table className="w-full border-collapse">
          <thead><tr className="text-left text-ink-3 text-xs"><th className="p-2.5">หน่วยงาน</th><th className="p-2.5">แพ็กเกจ</th><th className="p-2.5">สถานะ</th><th className="p-2.5 text-right"></th></tr></thead>
          <tbody>
            {tenants.map((t, i) => (
              <tr key={t.id} className="border-t border-[#F2F3F5]">
                <td className="p-3"><div className="flex items-center gap-3"><span className="w-10 h-10 rounded-[11px] text-[15px] font-bold flex items-center justify-center" style={{ background: AV[i % 4].bg, color: AV[i % 4].color }}>{t.name[0]}</span><div><div className="text-sm font-semibold">{t.name}</div><div className="text-xs text-ink-3">{t.subdomain}.poszee.com</div></div></div></td>
                <td className="p-3"><Badge text={PLAN[t.plan].label} c={PLAN[t.plan].c} bg={PLAN[t.plan].bg} /></td>
                <td className="p-3"><Badge text={STATUS[t.status].label} c={STATUS[t.status].c} bg={STATUS[t.status].bg} /></td>
                <td className="p-3 text-right">
                  <div className="inline-flex gap-1.5">
                    <button onClick={() => setAddFor(t)} className="h-8 px-3 border border-line rounded-[9px] bg-white text-xs font-semibold cursor-pointer">+ แอดมิน</button>
                    <button onClick={() => setEditFor(t)} className="h-8 px-3 border border-line rounded-[9px] bg-white text-xs font-semibold cursor-pointer">แก้ไข</button>
                    <button onClick={() => setDelFor(t)} title="ลบหน่วยงาน" className="h-8 w-8 border border-[#F3D4D4] rounded-[9px] bg-white text-danger cursor-pointer inline-flex items-center justify-center"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" /></svg></button>
                  </div>
                </td>
              </tr>
            ))}
            {tenants.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-ink-3">ยังไม่มีหน่วยงาน</td></tr>}
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
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(15,23,32,0.45)] flex items-center justify-center z-50">
      <form onClick={(e) => e.stopPropagation()} onSubmit={save} className={`${card} w-[400px] p-6`}>
        <div className="text-[16px] font-bold mb-1">แก้ไขผู้ดูแล</div>
        <div className="text-xs text-ink-3 mb-4">{admin.tenantName}</div>
        {err && <div className="bg-danger-tint text-danger rounded-[10px] py-[9px] px-[13px] text-[13px] mb-3.5">{err}</div>}
        <label className={lbl}>ชื่อ-นามสกุล</label>
        <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={`${field} mb-3.5`} />
        <label className={lbl}>อีเมล</label>
        <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={`${field} mb-3.5`} />
        <label className="flex items-center gap-2 text-[13px] mb-[18px] cursor-pointer">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> เปิดใช้งานบัญชี
        </label>
        {temp ? (
          <div className={`${card} border border-line p-3 mb-4 text-[13px]`}>รหัสชั่วคราวใหม่: <code className="bg-bg py-0.5 px-2 rounded-md">{temp}</code><div className="text-ink-3 text-xs mt-1">ส่งให้ผู้ดูแล (แสดงครั้งเดียว)</div></div>
        ) : (
          <button type="button" onClick={resetPw} disabled={busy} className="w-full h-10 border border-line rounded-[10px] bg-white font-semibold text-[13px] cursor-pointer mb-4">รีเซ็ตรหัสผ่าน</button>
        )}
        <div className="flex gap-2.5">
          <button type="submit" disabled={busy} className="flex-1 h-11 border-none rounded-[11px] bg-brand text-white font-semibold cursor-pointer">{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          <button type="button" onClick={onClose} className="h-11 px-[18px] border border-line rounded-[11px] bg-white text-ink-2 font-semibold cursor-pointer">ปิด</button>
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
      <div className="text-[18px] font-bold mb-[22px]">ผู้ดูแลระบบหน่วยงาน</div>
      <div className={`${card} pt-2 px-5 pb-3`}>
        <table className="w-full border-collapse">
          <thead><tr className="text-left text-ink-3 text-xs"><th className="p-2.5">ชื่อ</th><th className="p-2.5">อีเมล</th><th className="p-2.5">หน่วยงาน</th><th className="p-2.5">สถานะ</th><th className="p-2.5 text-right"></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#F2F3F5]">
                <td className="p-3 text-sm font-semibold">{r.name}</td>
                <td className="p-3 text-[13px] text-ink-2">{r.email ?? '—'}</td>
                <td className="p-3 text-[13px]">{r.tenantName}</td>
                <td className="p-3">{r.active ? <Badge text="ใช้งาน" c="var(--brand-700)" bg="var(--brand-tint)" /> : <Badge text="ปิดใช้งาน" c="var(--ink-3)" bg="#F0F2F4" />}</td>
                <td className="p-3 text-right">
                  <div className="inline-flex gap-1.5">
                    <button onClick={() => setEditFor(r)} className="h-8 px-3 border border-line rounded-[9px] bg-white text-xs font-semibold cursor-pointer">แก้ไข</button>
                    <button onClick={() => setDelFor(r)} title="ลบผู้ดูแล" className="h-8 w-8 border border-[#F3D4D4] rounded-[9px] bg-white text-danger cursor-pointer inline-flex items-center justify-center"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" /></svg></button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-ink-3">ยังไม่มีผู้ดูแล</td></tr>}
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
      <div className="text-[18px] font-bold mb-[22px]">แพ็กเกจ & สถานะ</div>
      <div className={`${card} pt-2 px-5 pb-3`}>
        <table className="w-full border-collapse">
          <thead><tr className="text-left text-ink-3 text-xs"><th className="p-2.5">หน่วยงาน</th><th className="p-2.5">แพ็กเกจ</th><th className="p-2.5">สถานะ</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-[#F2F3F5]">
                <td className="p-3 text-sm font-semibold">{t.name}<div className="text-xs text-ink-3 font-normal">{t.subdomain}.poszee.com</div></td>
                <td className="p-3"><select value={t.plan} onChange={(e) => patch(t.id, { plan: e.target.value as Tenant['plan'] })} className={`${field} w-[130px]`}><option value="trial">Trial</option><option value="starter">Starter</option><option value="pro">Pro</option></select></td>
                <td className="p-3"><select value={t.status} onChange={(e) => patch(t.id, { status: e.target.value as Tenant['status'] })} className={`${field} w-[150px]`}><option value="active">ใช้งานอยู่</option><option value="trial">ทดลองใช้</option><option value="suspended">ระงับ</option></select></td>
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
      <div className="text-[18px] font-bold mb-[22px]">บันทึกระบบ (Audit)</div>
      <div className={`${card} pt-2 px-5 pb-3`}>
        <table className="w-full border-collapse">
          <thead><tr className="text-left text-ink-3 text-xs"><th className="p-2.5">การกระทำ</th><th className="p-2.5">อ้างอิง</th><th className="p-2.5">เวลา</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#F2F3F5]">
                <td className="p-3 text-[13px] font-semibold">{r.action}</td>
                <td className="p-3 text-xs text-ink-3">{r.entity} · {r.entityId?.slice(0, 8)}</td>
                <td className="p-3 text-[13px] text-ink-2">{new Date(r.createdAt).toLocaleString('th-TH')}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-ink-3">ยังไม่มีบันทึก</td></tr>}
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
    <div className="flex h-screen overflow-hidden">
      <aside className="w-[244px] shrink-0 bg-sidebar py-[22px] px-4 flex flex-col">
        <div className="flex items-center gap-[11px] pt-0 px-1.5 pb-[22px]">
          <div className="w-[38px] h-[38px] rounded-[11px] bg-brand flex items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg></div>
          <div><div className="text-[15px] font-bold text-white">TimeLine</div><div className="text-[11px] text-brand font-semibold">SaaS Platform</div></div>
        </div>
        <div className="flex flex-col gap-1">
          {NAV.map((n) => (
            <button key={n.key} onClick={() => setView(n.key)} className="flex items-center gap-3 w-full border-none font-medium text-sm py-[11px] px-3.5 rounded-[11px] cursor-pointer text-left" style={{ background: view === n.key ? 'rgba(6,199,85,0.16)' : 'transparent', color: view === n.key ? '#fff' : '#9AA6B2' }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={view === n.key ? '#06C755' : '#9AA6B2'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={n.d} /></svg>{n.label}
            </button>
          ))}
        </div>
        <div className="mt-auto flex items-center gap-2.5 py-3 px-2 border-t border-[rgba(255,255,255,0.08)]">
          <div className="w-[34px] h-[34px] rounded-[10px] bg-brand text-white text-[13px] font-bold flex items-center justify-center">{me?.name?.[0] ?? 'S'}</div>
          <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold text-white">{me?.name ?? 'Super Admin'}</div><div className="text-[11px] text-[#6B7683]">platform owner</div></div>
          <button onClick={() => setShowProfile(true)} title="โปรไฟล์ของฉัน" className="border-none bg-[rgba(255,255,255,0.08)] text-[#9AA6B2] rounded-lg p-1.5 cursor-pointer flex"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /></svg></button>
          <button onClick={logout} title="ออกจากระบบ" className="border-none bg-[rgba(255,255,255,0.08)] text-[#9AA6B2] rounded-lg p-1.5 cursor-pointer flex"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></svg></button>
        </div>
      </aside>
      {showProfile && <MyProfile onClose={() => setShowProfile(false)} />}

      <main className="flex-1 overflow-y-auto py-7 px-8 relative">
        {toast && <div className="fixed top-5 right-7 bg-brand-tint border border-[#C9F0DA] rounded-xl py-3 px-4 text-brand-700 font-semibold text-[13px] z-[60]">{toast}</div>}
        {view === 'tenants' && <TenantsView toast={showToast} />}
        {view === 'admins' && <AdminsView toast={showToast} />}
        {view === 'billing' && <BillingView toast={showToast} />}
        {view === 'audit' && <AuditView />}
      </main>
    </div>
  );
}
