import { useEffect, useState } from 'react';
import { api, currentUser, logout } from '../lib/api';

/* ---------- shared bits ---------- */
const card: React.CSSProperties = { background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--line)' };
const field: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px', fontSize: 14, width: '100%' };
const lbl: React.CSSProperties = { fontSize: 12, color: 'var(--ink-2)', marginBottom: 6, display: 'block' };
function Badge({ text, c, bg }: { text: string; c: string; bg: string }) {
  return <span style={{ fontSize: 12, fontWeight: 600, color: c, background: bg, padding: '4px 10px', borderRadius: 999 }}>{text}</span>;
}
function btn(kind: 'primary' | 'ghost' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = { height: 40, padding: '0 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
  if (kind === 'primary') return { ...base, border: 'none', background: 'var(--brand)', color: '#fff' };
  if (kind === 'danger') return { ...base, border: '1px solid #FADBDB', background: '#fff', color: 'var(--danger)' };
  return { ...base, border: '1px solid var(--line)', background: '#fff', color: 'var(--ink)' };
}
const LEAVE_LABEL: Record<string, string> = { sick: 'ลาป่วย', personal: 'ลากิจ', vacation: 'พักร้อน' };

/* ---------- dashboard ---------- */
function DashboardView() {
  const [leave, setLeave] = useState(0);
  const [hire, setHire] = useState(0);
  useEffect(() => {
    api<unknown[]>('/leave/pending').then((r) => setLeave(r.length)).catch(() => {});
    api<unknown[]>('/hire/pending').then((r) => setHire(r.length)).catch(() => {});
  }, []);
  const stat = (label: string, val: number, color: string) => (
    <div style={{ ...card, padding: 18 }}><div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>{label}</div><div style={{ fontSize: 26, fontWeight: 700, color }}>{val}</div></div>
  );
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 16 }}>
        {stat('รออนุมัติการลา', leave, 'var(--warn)')}
        {stat('รออนุมัติเริ่มงาน', hire, 'var(--info)')}
        {stat('งานค้างรวม', leave + hire, 'var(--ink)')}
      </div>
      <div style={{ ...card, padding: 20, marginTop: 16, color: 'var(--ink-2)', fontSize: 14 }}>
        ยินดีต้อนรับสู่คอนโซล HR — เลือกเมนูด้านซ้ายเพื่อจัดการพนักงาน อนุมัติคำขอ เงินเดือน และการเชื่อมต่อ LINE ของหน่วยงาน
      </div>
    </div>
  );
}

/* ---------- staff ---------- */
function StaffView() {
  const [rows, setRows] = useState<{ id: string; name: string; department?: string; position?: string; role: string; employeeCode?: string; active: boolean }[]>([]);
  useEffect(() => { api<typeof rows>('/employees').then(setRows).catch(() => {}); }, []);
  return (
    <div style={{ ...card, padding: '8px 20px 12px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 12 }}>
          <th style={{ padding: 10 }}>พนักงาน</th><th style={{ padding: 10 }}>แผนก</th><th style={{ padding: 10 }}>บทบาท</th><th style={{ padding: 10 }}>สถานะ</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: '1px solid #F2F3F5' }}>
              <td style={{ padding: 12 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.employeeCode ?? '—'} · {r.position ?? ''}</div></td>
              <td style={{ padding: 12, fontSize: 13, color: 'var(--ink-2)' }}>{r.department ?? '—'}</td>
              <td style={{ padding: 12, fontSize: 13 }}>{r.role}</td>
              <td style={{ padding: 12 }}>{r.active ? <Badge text="ทำงาน" c="var(--brand-700)" bg="var(--brand-tint)" /> : <Badge text="รอเริ่มงาน" c="var(--ink-3)" bg="#F0F2F4" />}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>ยังไม่มีพนักงาน</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- approvals: leave + hire ---------- */
function LeaveView() {
  const [rows, setRows] = useState<{ id: string; type: string; startDate: string; endDate: string; days: string; reason?: string }[]>([]);
  const load = () => api<typeof rows>('/leave/pending').then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);
  const decide = async (id: string, approve: boolean) => { await api(`/leave/${id}/decision`, { method: 'POST', body: JSON.stringify({ approve }) }); load(); };
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12 }}>เส้นทางอนุมัติ: <b>หัวหน้างาน</b></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ ...card, padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{LEAVE_LABEL[r.type] ?? r.type} · {r.days} วัน</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.startDate} → {r.endDate} · {r.reason ?? ''}</div>
            </div>
            <button onClick={() => decide(r.id, true)} style={btn('primary')}>อนุมัติ</button>
            <button onClick={() => decide(r.id, false)} style={btn('danger')}>ปฏิเสธ</button>
          </div>
        ))}
        {rows.length === 0 && <div style={{ ...card, padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>ไม่มีคำขอลาค้างอนุมัติ</div>}
      </div>
    </div>
  );
}
function HireView() {
  const [rows, setRows] = useState<{ id: string; name: string; position?: string; department?: string; appliedAt: string; docsComplete: boolean }[]>([]);
  const load = () => api<typeof rows>('/hire/pending').then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);
  const decide = async (id: string, approve: boolean) => { await api(`/hire/${id}/decision`, { method: 'POST', body: JSON.stringify({ approve }) }); load(); };
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12 }}>ผู้อนุมัติ: <b>ฝ่ายบุคคล (HR)</b> · ตรวจเอกสาร/PII ก่อนกำหนดวันเริ่มงาน</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ ...card, padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.position ?? ''} · {r.department ?? ''} · ยื่นเมื่อ {r.appliedAt} · {r.docsComplete ? 'เอกสารครบ' : 'เอกสารไม่ครบ'}</div>
            </div>
            <button onClick={() => decide(r.id, true)} style={btn('primary')}>อนุมัติเริ่มงาน</button>
            <button onClick={() => decide(r.id, false)} style={btn('danger')}>ปฏิเสธ</button>
          </div>
        ))}
        {rows.length === 0 && <div style={{ ...card, padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>ไม่มีคำขอเริ่มงานค้างอนุมัติ</div>}
      </div>
    </div>
  );
}

/* ---------- payroll ---------- */
function PayrollView() {
  const [run, setRun] = useState<{ id: string; period: string; totalNet: string } | null>(null);
  const [rows, setRows] = useState<{ id: string; name: string; department?: string; gross: string; deductions: string; net: string; sentAt: string | null }[]>([]);
  async function load() {
    const runs = await api<{ id: string; period: string; totalNet: string }[]>('/payroll/runs').catch(() => []);
    if (!runs.length) return;
    setRun(runs[0]);
    setRows(await api<typeof rows>(`/payroll/runs/${runs[0].id}/payslips`).catch(() => []));
  }
  useEffect(() => { load(); }, []);
  const send = async (id: string) => { await api(`/payroll/payslips/${id}/send`, { method: 'POST' }); load(); };
  const sent = rows.filter((r) => r.sentAt).length;
  return (
    <div>
      <div style={{ ...card, padding: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 700 }}>งวด {run?.period ?? '—'}</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>สุทธิรวม ฿{run?.totalNet ?? '0'} · ส่งสลิปแล้ว {sent}/{rows.length}</div></div>
      </div>
      <div style={{ ...card, padding: '8px 20px 12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 12 }}>
            <th style={{ padding: 10 }}>พนักงาน</th><th style={{ padding: 10, textAlign: 'right' }}>รายได้</th><th style={{ padding: 10, textAlign: 'right' }}>หัก</th><th style={{ padding: 10, textAlign: 'right' }}>สุทธิ</th><th style={{ padding: 10, textAlign: 'right' }}>สลิป</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #F2F3F5' }}>
                <td style={{ padding: 12 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.department ?? ''}</div></td>
                <td style={{ padding: 12, textAlign: 'right', fontSize: 13, color: 'var(--brand-700)' }}>{r.gross}</td>
                <td style={{ padding: 12, textAlign: 'right', fontSize: 13, color: 'var(--danger)' }}>−{r.deductions}</td>
                <td style={{ padding: 12, textAlign: 'right', fontSize: 14, fontWeight: 700 }}>{r.net}</td>
                <td style={{ padding: 12, textAlign: 'right' }}>{r.sentAt ? <Badge text="✓ ส่งแล้ว" c="var(--brand-700)" bg="var(--brand-tint)" /> : <button onClick={() => send(r.id)} style={{ ...btn('ghost'), height: 32, borderColor: 'var(--brand)', color: 'var(--brand-700)' }}>ส่งสลิป</button>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>ยังไม่มีรอบเงินเดือน</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 12 }}>สลิปส่งเป็น PDF เข้ารหัสด้วยรหัสส่วนตัวของพนักงาน (PDPA)</div>
    </div>
  );
}

/* ---------- LINE settings ---------- */
function LineView() {
  const [f, setF] = useState({ loginChannelId: '', channelId: '', liffId: '', channelSecret: '', accessToken: '', features: { richMenu: true, notifyPush: true, sendSlip: true } });
  const [connected, setConnected] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function load() {
    const s = await api<{ loginChannelId: string | null; channelId: string | null; liffId: string | null; connected: boolean; features: { richMenu: boolean; notifyPush: boolean; sendSlip: boolean } }>('/line/settings').catch(() => null);
    if (s) { setConnected(s.connected); setF((p) => ({ ...p, loginChannelId: s.loginChannelId ?? '', channelId: s.channelId ?? '', liffId: s.liffId ?? '', features: s.features })); }
  }
  useEffect(() => { load(); }, []);
  async function save() {
    const body: Record<string, unknown> = { loginChannelId: f.loginChannelId, channelId: f.channelId, liffId: f.liffId, features: f.features };
    if (f.channelSecret) body.channelSecret = f.channelSecret;
    if (f.accessToken) body.accessToken = f.accessToken;
    await api('/line/settings', { method: 'PUT', body: JSON.stringify(body) });
    setF((p) => ({ ...p, channelSecret: '', accessToken: '' }));
    setMsg('บันทึกการเชื่อมต่อ LINE แล้ว'); setTimeout(() => setMsg(null), 3000); load();
  }
  async function test() {
    const r = await api<{ ok: boolean; reason?: string; botName?: string }>('/line/test', { method: 'POST' });
    setMsg(r.ok ? `เชื่อมต่อสำเร็จ · OA: ${r.botName}` : `ทดสอบไม่ผ่าน: ${r.reason}`); setTimeout(() => setMsg(null), 4000);
  }
  const Toggle = ({ k, label }: { k: 'richMenu' | 'notifyPush' | 'sendSlip'; label: string }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', cursor: 'pointer' }}>
      <input type="checkbox" checked={f.features[k]} onChange={(e) => setF({ ...f, features: { ...f.features, [k]: e.target.checked } })} />
      <span style={{ fontSize: 14 }}>{label}</span>
    </label>
  );
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ ...card, padding: 22, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Messaging API & LIFF (ต่อหน่วยงาน)</div>
          {connected ? <Badge text="● เชื่อมต่อแล้ว" c="var(--brand-700)" bg="var(--brand-tint)" /> : <Badge text="ยังไม่เชื่อมต่อ" c="var(--ink-3)" bg="#F0F2F4" />}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div><label style={lbl}>LINE Login Channel ID</label><input value={f.loginChannelId} onChange={(e) => setF({ ...f, loginChannelId: e.target.value })} style={field} /></div>
          <div><label style={lbl}>Messaging Channel ID</label><input value={f.channelId} onChange={(e) => setF({ ...f, channelId: e.target.value })} style={field} /></div>
          <div><label style={lbl}>Channel Secret {connected && <span style={{ color: 'var(--ink-3)' }}>(เว้นว่าง = คงเดิม)</span>}</label><input type="password" value={f.channelSecret} onChange={(e) => setF({ ...f, channelSecret: e.target.value })} placeholder="••••••••" style={field} /></div>
          <div><label style={lbl}>Channel Access Token {connected && <span style={{ color: 'var(--ink-3)' }}>(เว้นว่าง = คงเดิม)</span>}</label><input type="password" value={f.accessToken} onChange={(e) => setF({ ...f, accessToken: e.target.value })} placeholder="••••••••" style={field} /></div>
        </div>
        <label style={lbl}>LIFF ID</label>
        <input value={f.liffId} onChange={(e) => setF({ ...f, liffId: e.target.value })} style={{ ...field, marginBottom: 6 }} />
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Webhook: https://{location.host === 'hr.poszee.com' ? '<org>' : location.host}.poszee.com/api/line/webhook · credential ถูกเข้ารหัสก่อนจัดเก็บ</div>
      </div>

      <div style={{ ...card, padding: '4px 22px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, padding: '16px 0 4px' }}>ฟีเจอร์ LINE</div>
        <Toggle k="richMenu" label="Rich Menu (เมนูลัดในแชท)" />
        <Toggle k="notifyPush" label="แจ้งเตือนผ่าน LINE (เช็คอิน/อนุมัติ)" />
        <Toggle k="sendSlip" label="ส่งสลิปเงินเดือนทาง LINE (PDF เข้ารหัส)" />
      </div>

      {msg && <div style={{ ...card, padding: '12px 16px', marginBottom: 16, color: 'var(--brand-700)', fontWeight: 600, fontSize: 13, background: 'var(--brand-tint)', border: '1px solid #C9F0DA' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={save} style={{ ...btn('primary'), height: 46, padding: '0 22px', fontSize: 14 }}>บันทึกการเชื่อมต่อ</button>
        <button onClick={test} style={{ ...btn('ghost'), height: 46, padding: '0 22px', fontSize: 14, borderColor: 'var(--brand)', color: 'var(--brand-700)' }}>ทดสอบการเชื่อมต่อ</button>
      </div>
    </div>
  );
}

/* ---------- shell ---------- */
const NAV = [
  { key: 'dashboard', label: 'แดชบอร์ด' },
  { key: 'staff', label: 'พนักงาน' },
  { key: 'hire', label: 'อนุมัติเริ่มงาน' },
  { key: 'leave', label: 'อนุมัติการลา' },
  { key: 'payroll', label: 'เงินเดือน' },
  { key: 'line', label: 'การเชื่อมต่อ LINE' },
] as const;
const TITLES: Record<string, string> = { dashboard: 'ภาพรวม', staff: 'พนักงาน', hire: 'อนุมัติเริ่มงาน', leave: 'อนุมัติการลา', payroll: 'เงินเดือน', line: 'การเชื่อมต่อ LINE' };

export function HrPage() {
  const me = currentUser();
  const [view, setView] = useState<string>('dashboard');
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <aside style={{ width: 244, flexShrink: 0, background: 'var(--surface)', borderRight: '1px solid var(--line)', padding: '22px 14px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 8px 22px' }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
          </div>
          <div><div style={{ fontSize: 15, fontWeight: 700 }}>TimeLine</div><div style={{ fontSize: 11, color: 'var(--brand-700)', fontWeight: 600 }}>HR Console</div></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map((n) => (
            <button key={n.key} onClick={() => setView(n.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none', background: view === n.key ? 'var(--brand-tint)' : 'transparent', color: view === n.key ? 'var(--brand-700)' : 'var(--ink-2)', fontWeight: 600, fontSize: 14, padding: '11px 14px', borderRadius: 11, cursor: 'pointer', textAlign: 'left' }}>
              {n.label}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 8px', borderTop: '1px solid var(--line)' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--brand-tint)', color: 'var(--brand-700)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{me?.name?.[0] ?? 'H'}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{me?.name ?? 'HR'}</div><div style={{ fontSize: 11, color: 'var(--ink-3)' }}>org admin</div></div>
          <button onClick={logout} title="ออกจากระบบ" style={{ border: '1px solid var(--line)', background: '#fff', color: 'var(--ink-3)', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></svg>
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: 72, flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', padding: '0 28px', fontSize: 18, fontWeight: 700 }}>{TITLES[view]}</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {view === 'dashboard' && <DashboardView />}
          {view === 'staff' && <StaffView />}
          {view === 'hire' && <HireView />}
          {view === 'leave' && <LeaveView />}
          {view === 'payroll' && <PayrollView />}
          {view === 'line' && <LineView />}
        </div>
      </main>
    </div>
  );
}
