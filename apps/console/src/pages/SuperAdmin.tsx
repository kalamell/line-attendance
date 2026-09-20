import { useEffect, useState } from 'react';
import { api, currentUser, logout } from '../lib/api';

type Tenant = {
  id: string;
  name: string;
  subdomain: string;
  plan: 'trial' | 'starter' | 'pro';
  status: 'active' | 'trial' | 'suspended';
  createdAt: string;
};

const AVATARS = [
  { bg: '#EAF1FE', color: '#1D6FE0' },
  { bg: 'var(--brand-tint)', color: 'var(--brand-700)' },
  { bg: 'var(--warn-tint)', color: 'var(--warn)' },
  { bg: 'var(--danger-tint)', color: 'var(--danger)' },
];
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

function NavItem({ label, active, icon }: { label: string; active?: boolean; icon: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 11, fontSize: 14, fontWeight: 500, cursor: active ? 'default' : 'pointer', color: active ? '#fff' : '#9AA6B2', background: active ? 'rgba(6,199,85,0.16)' : 'transparent' }}>
      {icon}<span>{label}</span>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 18 }}>
      <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color ?? 'var(--ink)' }}>{value}</div>
    </div>
  );
}

export function SuperAdminPage() {
  const me = currentUser();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', subdomain: '', plan: 'trial', adminEmail: '' });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setTenants(await api<Tenant[]>('/tenants'));
    } catch (e) {
      setErr(String(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api('/tenants', { method: 'POST', body: JSON.stringify(form) });
      setShowCreate(false);
      setForm({ name: '', subdomain: '', plan: 'trial', adminEmail: '' });
      setToast('สร้างหน่วยงานใหม่แล้ว · ส่งคำเชิญให้แอดมินทาง LINE/อีเมล');
      setTimeout(() => setToast(null), 3500);
      await load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  const active = tenants.filter((t) => t.status === 'active').length;
  const trial = tenants.filter((t) => t.status === 'trial').length;
  const pro = tenants.filter((t) => t.plan === 'pro').length;

  const field: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px', fontSize: 14, width: '100%' };
  const lbl: React.CSSProperties = { fontSize: 12, color: 'var(--ink-2)', marginBottom: 6, display: 'block' };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* sidebar */}
      <aside style={{ width: 244, flexShrink: 0, background: 'var(--sidebar)', padding: '22px 16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 6px 22px' }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
          </div>
          <div><div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>TimeLine</div><div style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}>SaaS Platform</div></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <NavItem label="หน่วยงาน" active icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#06C755" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" /></svg>} />
          <NavItem label="ผู้ดูแลระบบ" icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#9AA6B2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>} />
          <NavItem label="แพ็กเกจ & บิล" icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#9AA6B2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>} />
          <NavItem label="บันทึกระบบ (Audit)" icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#9AA6B2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M9 15h6" /></svg>} />
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--brand)', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{me?.name?.[0] ?? 'S'}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{me?.name ?? 'Super Admin'}</div><div style={{ fontSize: 11, color: '#6B7683' }}>platform owner</div></div>
          <button onClick={logout} title="ออกจากระบบ" style={{ border: 'none', background: 'rgba(255,255,255,0.08)', color: '#9AA6B2', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></svg>
          </button>
        </div>
      </aside>

      {/* main */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: 72, flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', padding: '0 28px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>หน่วยงานทั้งหมด</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>สร้างและจัดการหน่วยงานผู้เช่า (tenant) บนแพลตฟอร์ม</div>
          </div>
          <button onClick={() => setShowCreate((v) => !v)}
            style={{ height: 44, padding: '0 20px', border: 'none', borderRadius: 12, background: 'var(--brand)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 6px 16px rgba(6,199,85,0.28)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            สร้างหน่วยงาน
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {toast && (
            <div style={{ background: 'var(--brand-tint)', border: '1px solid #C9F0DA', borderRadius: 12, padding: '12px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--brand-700)', fontWeight: 600, fontSize: 13 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand-700)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>{toast}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 16, marginBottom: 22 }}>
            <Stat label="หน่วยงานทั้งหมด" value={tenants.length} />
            <Stat label="ใช้งานอยู่" value={active} color="var(--brand-700)" />
            <Stat label="ทดลองใช้" value={trial} color="var(--warn)" />
            <Stat label="แพ็กเกจ Pro" value={pro} color="var(--info)" />
          </div>

          {showCreate && (
            <form onSubmit={create} style={{ background: 'var(--surface)', border: '1.5px solid var(--brand)', borderRadius: 18, padding: 22, marginBottom: 22 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>สร้างหน่วยงานใหม่</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14, marginBottom: 18 }}>
                <div><label style={lbl}>ชื่อหน่วยงาน</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="บริษัท เอบีซี จำกัด" style={field} /></div>
                <div><label style={lbl}>รหัสหน่วยงาน (subdomain)</label><input required pattern="[a-z0-9][a-z0-9-]{1,62}" value={form.subdomain} onChange={(e) => setForm({ ...form, subdomain: e.target.value })} placeholder="abc" style={field} /></div>
                <div><label style={lbl}>แพ็กเกจ</label><select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} style={field}><option value="trial">Trial (30 วัน)</option><option value="starter">Starter</option><option value="pro">Pro</option></select></div>
              </div>
              <label style={lbl}>อีเมลแอดมินคนแรก (ส่งคำเชิญ)</label>
              <input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} placeholder="admin@company.co.th" style={{ ...field, marginBottom: 20 }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" disabled={busy} style={{ height: 44, padding: '0 22px', border: 'none', borderRadius: 11, background: 'var(--brand)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{busy ? 'กำลังสร้าง…' : 'สร้างหน่วยงาน + ส่งคำเชิญ'}</button>
                <button type="button" onClick={() => setShowCreate(false)} style={{ height: 44, padding: '0 22px', border: '1px solid var(--line)', borderRadius: 11, background: '#fff', color: 'var(--ink-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>ยกเลิก</button>
              </div>
            </form>
          )}

          {err && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

          <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '8px 20px 12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 12 }}>
                  <th style={{ padding: 10, fontWeight: 600 }}>หน่วยงาน</th>
                  <th style={{ padding: 10, fontWeight: 600 }}>แพ็กเกจ</th>
                  <th style={{ padding: 10, fontWeight: 600 }}>สถานะ</th>
                  <th style={{ padding: 10, fontWeight: 600 }}>สร้างเมื่อ</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t, i) => {
                  const av = AVATARS[i % 4];
                  const p = PLAN[t.plan];
                  const s = STATUS[t.status];
                  return (
                    <tr key={t.id} style={{ borderTop: '1px solid #F2F3F5' }}>
                      <td style={{ padding: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ width: 40, height: 40, borderRadius: 11, background: av.bg, color: av.color, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.name[0]}</span>
                          <div><div style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t.subdomain}.poszee.com</div></div>
                        </div>
                      </td>
                      <td style={{ padding: 12 }}><span style={{ fontSize: 12, fontWeight: 600, color: p.c, background: p.bg, padding: '4px 10px', borderRadius: 999 }}>{p.label}</span></td>
                      <td style={{ padding: 12 }}><span style={{ fontSize: 12, fontWeight: 600, color: s.c, background: s.bg, padding: '4px 10px', borderRadius: 999 }}>{s.label}</span></td>
                      <td style={{ padding: 12, fontSize: 13, color: 'var(--ink-2)' }}>{new Date(t.createdAt).toLocaleDateString('th-TH')}</td>
                    </tr>
                  );
                })}
                {tenants.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>ยังไม่มีหน่วยงาน — กด “สร้างหน่วยงาน”</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, paddingLeft: 4, color: 'var(--ink-3)', fontSize: 12 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            ข้อมูลแต่ละหน่วยงานแยกกัน (tenant isolation) · Super Admin เห็นเฉพาะข้อมูลภาพรวม ไม่เห็น PII พนักงาน (PDPA)
          </div>
        </div>
      </main>
    </div>
  );
}
