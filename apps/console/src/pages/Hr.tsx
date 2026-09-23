import { useEffect, useRef, useState } from 'react';
import { api, currentUser, logout } from '../lib/api';
import { MyProfile } from '../components/MyProfile';

/* Leaflet (map picker) loaded lazily from CDN */
let leafletPromise: Promise<void> | null = null;
function loadLeaflet(): Promise<void> {
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
  return leafletPromise;
}

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
type Employee = { id: string; name: string; department?: string | null; position?: string | null; role: string; employeeCode?: string | null; email?: string | null; baseSalary?: string | null; active: boolean; lineUserId?: string | null; hasConsent?: boolean; officeId?: string | null; officeName?: string | null };
type EmpForm = { name: string; employeeCode: string; department: string; position: string; email: string; phone: string; baseSalary: string; role: string; officeId: string };
type OfficeOpt = { id: string; name: string };
const EMP_FIELDS: { key: keyof EmpForm; label: string; req?: boolean }[] = [
  { key: 'name', label: 'ชื่อ-นามสกุล', req: true },
  { key: 'employeeCode', label: 'รหัสพนักงาน' },
  { key: 'department', label: 'แผนก' },
  { key: 'position', label: 'ตำแหน่ง' },
  { key: 'email', label: 'อีเมล' },
  { key: 'phone', label: 'เบอร์โทร' },
  { key: 'baseSalary', label: 'เงินเดือน' },
  { key: 'role', label: 'บทบาท' },
];
const emptyEmp: EmpForm = { name: '', employeeCode: '', department: '', position: '', email: '', phone: '', baseSalary: '', role: 'employee', officeId: '' };

function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/* Add/edit modal */
function EmployeeModal({ initial, id, offices, onClose, onDone }: { initial: EmpForm; id?: string; offices: OfficeOpt[]; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState<EmpForm>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const body: Record<string, unknown> = { name: f.name, employeeCode: f.employeeCode, department: f.department, position: f.position, email: f.email, phone: f.phone, role: f.role, officeId: f.officeId };
    if (f.baseSalary) body.baseSalary = f.baseSalary;
    try {
      if (id) await api(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await api('/employees', { method: 'POST', body: JSON.stringify(body) });
      onDone(id ? 'บันทึกข้อมูลพนักงานแล้ว' : 'เพิ่มพนักงานแล้ว'); onClose();
    } catch { setErr('บันทึกไม่สำเร็จ'); } finally { setBusy(false); }
  }
  const inp = (k: keyof EmpForm, label: string, type = 'text') => (
    <div><label style={lbl}>{label}</label><input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} style={field} /></div>
  );
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} style={{ ...card, width: 460, padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{id ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน'}</div>
        {err && <div style={{ background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 10, padding: '9px 13px', fontSize: 13, marginBottom: 14 }}>{err}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>ชื่อ-นามสกุล *</label><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={field} /></div>
          {inp('employeeCode', 'รหัสพนักงาน')}
          {inp('department', 'แผนก')}
          {inp('position', 'ตำแหน่ง')}
          {inp('email', 'อีเมล', 'email')}
          {inp('phone', 'เบอร์โทร')}
          {inp('baseSalary', 'เงินเดือน (บาท)')}
          <div><label style={lbl}>บทบาท</label><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} style={field}><option value="employee">พนักงาน</option><option value="supervisor">หัวหน้างาน</option></select></div>
          <div><label style={lbl}>สถานที่ปฏิบัติงาน</label><select value={f.officeId} onChange={(e) => setF({ ...f, officeId: e.target.value })} style={field}><option value="">ทุกสถานที่</option>{offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" disabled={busy} style={{ ...btn('primary'), flex: 1, height: 44 }}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          <button type="button" onClick={onClose} style={{ ...btn('ghost'), height: 44 }}>ยกเลิก</button>
        </div>
      </form>
    </div>
  );
}

/* CSV import with column mapping */
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; failed: number } | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCSV(String(reader.result ?? ''));
      if (!rows.length) return;
      const hs = rows[0].map((h) => h.trim());
      setHeaders(hs); setData(rows.slice(1));
      // auto-guess mapping by header keywords
      const guess: Record<string, number> = {};
      const rules: Record<string, string[]> = { name: ['name', 'ชื่อ', 'พนักงาน'], employeeCode: ['code', 'รหัส', 'id', 'emp'], department: ['dep', 'แผนก', 'ฝ่าย'], position: ['pos', 'ตำแหน่ง'], email: ['mail', 'อีเมล'], phone: ['phone', 'tel', 'เบอร์', 'โทร'], baseSalary: ['salary', 'เงินเดือน', 'ฐาน'], role: ['role', 'บทบาท', 'สิทธิ'] };
      for (const fld of EMP_FIELDS) {
        const idx = hs.findIndex((h) => (rules[fld.key] ?? []).some((k) => h.toLowerCase().includes(k.toLowerCase())));
        guess[fld.key] = idx;
      }
      setMap(guess);
    };
    reader.readAsText(file);
  }

  async function doImport() {
    setBusy(true);
    try {
      const rows = data.map((r) => {
        const o: Record<string, string> = {};
        for (const fld of EMP_FIELDS) {
          const idx = map[fld.key];
          if (idx != null && idx >= 0) {
            let v = (r[idx] ?? '').trim();
            if (fld.key === 'role') v = /super|หัวหน้า/i.test(v) ? 'supervisor' : 'employee';
            o[fld.key] = v;
          }
        }
        return o;
      }).filter((o) => o.name);
      const res = await api<{ created: number; failed: number }>('/employees/import', { method: 'POST', body: JSON.stringify({ rows }) });
      setResult(res);
      onDone(`นำเข้าสำเร็จ ${res.created} รายการ${res.failed ? ` · ล้มเหลว ${res.failed}` : ''}`);
    } finally { setBusy(false); }
  }

  const mappedName = map.name != null && map.name >= 0;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 560, padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>นำเข้าพนักงานจาก CSV</div>
        {result ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ ...card, background: 'var(--brand-tint)', border: '1px solid #C9F0DA', padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, color: 'var(--brand-700)' }}>นำเข้าเสร็จสิ้น</div>
              <div style={{ fontSize: 14, marginTop: 6 }}>สำเร็จ {result.created} รายการ{result.failed ? ` · ล้มเหลว ${result.failed} รายการ` : ''}</div>
            </div>
            <button onClick={onClose} style={{ ...btn('primary'), width: '100%', height: 44 }}>เสร็จสิ้น</button>
          </div>
        ) : headers.length === 0 ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 14, lineHeight: 1.6 }}>เลือกไฟล์ CSV (แถวแรกเป็นหัวคอลัมน์) แล้วจับคู่คอลัมน์กับข้อมูลพนักงานในขั้นถัดไป</div>
            <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ ...field, padding: 10 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}><button onClick={onClose} style={{ ...btn('ghost'), height: 40 }}>ยกเลิก</button></div>
          </div>
        ) : (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 14 }}>พบ {data.length} แถว · จับคู่คอลัมน์ (ระบบเดาให้แล้ว ปรับได้)</div>
            <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
              {EMP_FIELDS.map((fld) => (
                <div key={fld.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 130, fontSize: 13, fontWeight: 600 }}>{fld.label}{fld.req && <span style={{ color: 'var(--danger)' }}> *</span>}</div>
                  <select value={map[fld.key] ?? -1} onChange={(e) => setMap({ ...map, [fld.key]: Number(e.target.value) })} style={{ ...field, flex: 1 }}>
                    <option value={-1}>— ไม่ใช้ —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `คอลัมน์ ${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {!mappedName && <div style={{ background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 10, padding: '9px 13px', fontSize: 13, marginBottom: 12 }}>ต้องจับคู่คอลัมน์ "ชื่อ-นามสกุล" ก่อน</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button disabled={!mappedName || busy} onClick={doImport} style={{ ...btn('primary'), flex: 1, height: 44, opacity: mappedName ? 1 : 0.5 }}>{busy ? 'กำลังนำเข้า…' : `นำเข้า ${data.length} รายการ`}</button>
              <button onClick={() => { setHeaders([]); setData([]); }} style={{ ...btn('ghost'), height: 44 }}>เลือกไฟล์ใหม่</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StaffView() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [offices, setOffices] = useState<OfficeOpt[]>([]);
  const [edit, setEdit] = useState<{ form: EmpForm; id?: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [del, setDel] = useState<Employee | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api<Employee[]>('/employees').then(setRows).catch(() => {});
  useEffect(() => { load(); api<OfficeOpt[]>('/attendance/office').then(setOffices).catch(() => {}); }, []);
  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(null), 3500); }
  function openEdit(r: Employee) {
    setEdit({ id: r.id, form: { ...emptyEmp, name: r.name, employeeCode: r.employeeCode ?? '', department: r.department ?? '', position: r.position ?? '', email: r.email ?? '', baseSalary: r.baseSalary ?? '', role: r.role === 'supervisor' ? 'supervisor' : 'employee', officeId: r.officeId ?? '' } });
  }
  async function remove(r: Employee) {
    try { await api(`/employees/${r.id}`, { method: 'DELETE' }); flash(`ลบ ${r.name} แล้ว`); }
    catch (e) { flash(e instanceof Error ? e.message.replace(/^\d+\s*/, '').replace(/^\{.*"message":"([^"]+)".*\}$/, '$1') : 'ลบไม่สำเร็จ'); }
    setDel(null); load();
  }
  async function unlinkLine(r: Employee) {
    try { await api(`/employees/${r.id}/unlink-line`, { method: 'POST' }); flash(`ยกเลิกการผูก LINE ของ ${r.name} แล้ว`); }
    catch { flash('ยกเลิกผูก LINE ไม่สำเร็จ'); }
    load();
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 10 }}>
        <div style={{ flex: 1, fontSize: 14, color: 'var(--ink-2)' }}>ทั้งหมด {rows.length} คน</div>
        <button onClick={() => setImporting(true)} style={{ ...btn('ghost'), height: 40 }}>นำเข้า CSV</button>
        <button onClick={() => setEdit({ form: { ...emptyEmp } })} style={{ ...btn('primary'), height: 40 }}>+ เพิ่มพนักงาน</button>
      </div>
      {msg && <div style={{ ...card, padding: '12px 16px', marginBottom: 16, color: 'var(--brand-700)', fontWeight: 600, fontSize: 13, background: 'var(--brand-tint)', border: '1px solid #C9F0DA' }}>{msg}</div>}
      <div style={{ ...card, padding: '8px 20px 12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 12 }}>
            <th style={{ padding: 10 }}>พนักงาน</th><th style={{ padding: 10 }}>แผนก</th><th style={{ padding: 10 }}>สถานที่</th><th style={{ padding: 10 }}>บทบาท</th><th style={{ padding: 10 }}>LINE</th><th style={{ padding: 10 }}>PDPA</th><th style={{ padding: 10 }}>สถานะ</th><th style={{ padding: 10, textAlign: 'right' }}></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #F2F3F5' }}>
                <td style={{ padding: 12 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.employeeCode ?? '—'} · {r.position ?? ''}</div></td>
                <td style={{ padding: 12, fontSize: 13, color: 'var(--ink-2)' }}>{r.department ?? '—'}</td>
                <td style={{ padding: 12, fontSize: 13, color: 'var(--ink-2)' }}>{r.officeName ?? <span style={{ color: 'var(--ink-3)' }}>ทุกที่</span>}</td>
                <td style={{ padding: 12, fontSize: 13 }}>{r.role === 'supervisor' ? 'หัวหน้างาน' : r.role === 'org_admin' ? 'ผู้ดูแล' : 'พนักงาน'}</td>
                <td style={{ padding: 12 }}>{r.lineUserId
                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Badge text="เชื่อมแล้ว" c="var(--brand-700)" bg="var(--brand-tint)" /><button onClick={() => unlinkLine(r)} title="ยกเลิกการผูก LINE" style={{ border: 'none', background: 'none', color: 'var(--ink-3)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>ยกเลิกผูก</button></span>
                  : <Badge text="ยังไม่เชื่อม" c="var(--ink-3)" bg="#F0F2F4" />}</td>
                <td style={{ padding: 12 }}>{r.hasConsent ? <Badge text="ยินยอมแล้ว" c="var(--brand-700)" bg="var(--brand-tint)" /> : <Badge text="รอยินยอม" c="var(--warn)" bg="var(--warn-tint)" />}</td>
                <td style={{ padding: 12 }}>{r.active ? <Badge text="ทำงาน" c="var(--brand-700)" bg="var(--brand-tint)" /> : <Badge text="ปิดใช้งาน" c="var(--ink-3)" bg="#F0F2F4" />}</td>
                <td style={{ padding: 12, textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <button onClick={() => openEdit(r)} style={{ ...btn('ghost'), height: 32, padding: '0 12px', fontSize: 12 }}>แก้ไข</button>
                    <button onClick={() => setDel(r)} style={{ ...btn('danger'), height: 32, padding: '0 12px', fontSize: 12 }}>ลบ</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>ยังไม่มีพนักงาน</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && <EmployeeModal initial={edit.form} id={edit.id} offices={offices} onClose={() => setEdit(null)} onDone={(m) => { flash(m); load(); }} />}
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={(m) => { flash(m); load(); }} />}
      {del && (
        <div onClick={() => setDel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 380, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)', marginBottom: 10 }}>ลบพนักงาน</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 18, lineHeight: 1.6 }}>ลบ "{del.name}"? หากมีประวัติในระบบ (ลงเวลา/ลา/เงินเดือน) ระบบจะปิดการใช้งานแทน</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => remove(del)} style={{ ...btn('danger'), flex: 1, height: 44, background: 'var(--danger)', color: '#fff', border: 'none' }}>ลบ</button>
              <button onClick={() => setDel(null)} style={{ ...btn('ghost'), height: 44 }}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
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
  const [f, setF] = useState({ loginChannelId: '', channelId: '', liffId: '', loginChannelSecret: '', channelSecret: '', accessToken: '', features: { richMenu: true, notifyPush: true, sendSlip: true } });
  const [connected, setConnected] = useState(false);
  const [hasLoginSecret, setHasLoginSecret] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function load() {
    const s = await api<{ loginChannelId: string | null; channelId: string | null; liffId: string | null; connected: boolean; hasLoginChannelSecret?: boolean; features: { richMenu: boolean; notifyPush: boolean; sendSlip: boolean } }>('/line/settings').catch(() => null);
    if (s) { setConnected(s.connected); setHasLoginSecret(!!s.hasLoginChannelSecret); setF((p) => ({ ...p, loginChannelId: s.loginChannelId ?? '', channelId: s.channelId ?? '', liffId: s.liffId ?? '', features: s.features })); }
  }
  useEffect(() => { load(); }, []);
  const [busy, setBusy] = useState(false);
  type Provision = { ok: boolean; liffId?: string; channelId?: string; created?: boolean; reason?: string };
  function flash(m: string, ms = 3500) { setMsg(m); setTimeout(() => setMsg(null), ms); }
  async function save() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { channelId: f.channelId, features: f.features };
      if (f.loginChannelId) body.loginChannelId = f.loginChannelId;
      if (f.liffId) body.liffId = f.liffId;
      if (f.loginChannelSecret) body.loginChannelSecret = f.loginChannelSecret;
      if (f.channelSecret) body.channelSecret = f.channelSecret;
      if (f.accessToken) body.accessToken = f.accessToken;
      // Response may carry an auto-provision result when a token was saved without a LIFF.
      const r = await api<{ liffId: string | null; provision?: Provision }>('/line/settings', { method: 'PUT', body: JSON.stringify(body) });
      setF((p) => ({ ...p, channelSecret: '', accessToken: '', loginChannelSecret: '' }));
      if (r.provision) flash(r.provision.ok ? `บันทึกแล้ว · ระบบสร้าง LIFF ให้อัตโนมัติ (${r.provision.liffId})` : `บันทึกแล้ว · สร้าง LIFF ไม่สำเร็จ: ${r.provision.reason}`, 5000);
      else flash('บันทึกการเชื่อมต่อ LINE แล้ว');
      load();
    } finally { setBusy(false); }
  }
  async function provision() {
    setBusy(true);
    try {
      const r = await api<Provision>('/line/provision-liff', { method: 'POST' });
      if (r.ok) flash(`${r.created ? 'สร้าง' : 'เชื่อม'} LIFF สำเร็จ · ${r.liffId}`, 5000);
      else flash(`สร้าง LIFF ไม่สำเร็จ: ${r.reason}`, 5000);
      load();
    } finally { setBusy(false); }
  }
  async function provisionMenu() {
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; richMenuId?: string; reason?: string }>('/line/provision-richmenu', { method: 'POST' });
      flash(r.ok ? `สร้าง Rich menu และตั้งเป็นค่าเริ่มต้นแล้ว` : `สร้าง Rich menu ไม่สำเร็จ: ${r.reason}`, 5000);
    } finally { setBusy(false); }
  }
  async function test() {
    const r = await api<{ ok: boolean; reason?: string; botName?: string }>('/line/test', { method: 'POST' });
    flash(r.ok ? `เชื่อมต่อสำเร็จ · OA: ${r.botName}` : `ทดสอบไม่ผ่าน: ${r.reason}`, 4000);
  }
  const Toggle = ({ k, label }: { k: 'richMenu' | 'notifyPush' | 'sendSlip'; label: string }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', cursor: 'pointer' }}>
      <input type="checkbox" checked={f.features[k]} onChange={(e) => setF({ ...f, features: { ...f.features, [k]: e.target.checked } })} />
      <span style={{ fontSize: 14 }}>{label}</span>
    </label>
  );
  const hint = (t: React.ReactNode) => <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 5, lineHeight: 1.5 }}>{t}</div>;
  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ ...card, padding: '14px 18px', marginBottom: 16, background: 'var(--brand-tint)', border: '1px solid #C9F0DA' }}>
        <div style={{ fontSize: 13, color: 'var(--brand-700)', lineHeight: 1.6 }}>
          เปิด <b>LINE Developers Console</b> (developers.line.biz) → เลือก <b>Provider</b> ของคุณ จะเห็น 2 แชนแนล: <b>LINE Login</b> (สำหรับให้พนักงานล็อกอิน/LIFF) และ <b>Messaging API</b> (บอตสำหรับส่งแจ้งเตือน/สลิป/rich menu) — คัดลอกค่าจากแต่ละแชนแนลมาตามช่องด้านล่าง
        </div>
      </div>

      {/* ---- LINE Login channel ---- */}
      <div style={{ ...card, padding: 22, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>1) LINE Login channel <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 13 }}>— สำหรับล็อกอิน + LIFF</span></div>
          {f.liffId && f.liffId.indexOf('abcdWXYZ') === -1 ? <Badge text="● พร้อมล็อกอิน" c="var(--brand-700)" bg="var(--brand-tint)" /> : <Badge text="ยังไม่พร้อม" c="var(--warn)" bg="var(--warn-tint)" />}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 16 }}>ต้องเป็นแชนแนลชนิด LINE Login ที่เปิด <b>Web app</b> ไว้ (แท็บ LINE Login → App types)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
          <div>
            <label style={lbl}>LINE Login Channel ID</label>
            <input value={f.loginChannelId} onChange={(e) => setF({ ...f, loginChannelId: e.target.value })} placeholder="เช่น 2001234567" style={field} />
            {hint(<>แชนแนล LINE Login → แท็บ <b>Basic settings</b> → หัวข้อ <b>Channel ID</b> (ตัวเลขล้วน)</>)}
          </div>
          <div>
            <label style={lbl}>LINE Login Channel Secret {hasLoginSecret && <span style={{ color: 'var(--ink-3)' }}>(เว้นว่าง = คงเดิม)</span>}</label>
            <input type="password" value={f.loginChannelSecret} onChange={(e) => setF({ ...f, loginChannelSecret: e.target.value })} placeholder="••••••••" style={field} />
            {hint(<>แชนแนลเดียวกัน → <b>Basic settings</b> → <b>Channel secret</b> · ใช้ให้ระบบสร้าง LIFF อัตโนมัติ</>)}
          </div>
        </div>
        <label style={lbl}>LIFF ID <span style={{ color: 'var(--ink-3)' }}>(ระบบสร้าง/เชื่อมให้อัตโนมัติ)</span></label>
        <input value={f.liffId} readOnly placeholder="— ระบบจะสร้างให้เมื่อกรอก Login Channel ID + Secret แล้วบันทึก —" style={{ ...field, marginBottom: 6, background: 'var(--bg)', color: 'var(--ink-2)' }} />
        {hint(<>ไม่ต้องสร้าง LIFF ใน LINE เอง — ระบบสร้างให้ที่ endpoint <b>https://hr.poszee.com/liff/</b> (scope openid+profile) และตั้ง Channel ID ให้เอง</>)}
      </div>

      {/* ---- Messaging API channel ---- */}
      <div style={{ ...card, padding: 22, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>2) Messaging API channel <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 13 }}>— บอต: แจ้งเตือน/สลิป/rich menu</span></div>
          {connected ? <Badge text="● เชื่อมต่อแล้ว" c="var(--brand-700)" bg="var(--brand-tint)" /> : <Badge text="ยังไม่เชื่อมต่อ" c="var(--ink-3)" bg="#F0F2F4" />}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 4 }}>
          <div>
            <label style={lbl}>Messaging Channel ID</label>
            <input value={f.channelId} onChange={(e) => setF({ ...f, channelId: e.target.value })} placeholder="เช่น 2001234567" style={field} />
            {hint(<>แชนแนล Messaging API → <b>Basic settings</b> → <b>Channel ID</b></>)}
          </div>
          <div>
            <label style={lbl}>Channel Secret {connected && <span style={{ color: 'var(--ink-3)' }}>(เว้นว่าง = คงเดิม)</span>}</label>
            <input type="password" value={f.channelSecret} onChange={(e) => setF({ ...f, channelSecret: e.target.value })} placeholder="••••••••" style={field} />
            {hint(<>Messaging API → <b>Basic settings</b> → <b>Channel secret</b> (ใช้ตรวจ webhook)</>)}
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Channel Access Token {connected && <span style={{ color: 'var(--ink-3)' }}>(เว้นว่าง = คงเดิม)</span>}</label>
            <input type="password" value={f.accessToken} onChange={(e) => setF({ ...f, accessToken: e.target.value })} placeholder="••••••••" style={field} />
            {hint(<>Messaging API → แท็บ <b>Messaging API</b> → <b>Channel access token (long-lived)</b> → กด Issue · ใช้ส่งข้อความ/สร้าง rich menu</>)}
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 12 }}>Webhook URL (ตั้งใน Messaging API → Webhook): <b>https://hr.poszee.com/api/line/webhook</b> · credential ทั้งหมดถูกเข้ารหัสก่อนจัดเก็บ</div>
      </div>

      <div style={{ ...card, padding: '4px 22px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, padding: '16px 0 4px' }}>ฟีเจอร์ LINE</div>
        <Toggle k="richMenu" label="Rich Menu (เมนูลัดในแชท)" />
        <Toggle k="notifyPush" label="แจ้งเตือนผ่าน LINE (เช็คอิน/อนุมัติ)" />
        <Toggle k="sendSlip" label="ส่งสลิปเงินเดือนทาง LINE (PDF เข้ารหัส)" />
      </div>

      {msg && <div style={{ ...card, padding: '12px 16px', marginBottom: 16, color: 'var(--brand-700)', fontWeight: 600, fontSize: 13, background: 'var(--brand-tint)', border: '1px solid #C9F0DA' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={save} disabled={busy} style={{ ...btn('primary'), height: 46, padding: '0 22px', fontSize: 14 }}>บันทึกการเชื่อมต่อ</button>
        <button onClick={test} disabled={busy} style={{ ...btn('ghost'), height: 46, padding: '0 22px', fontSize: 14, borderColor: 'var(--brand)', color: 'var(--brand-700)' }}>ทดสอบการเชื่อมต่อ</button>
        <button onClick={provision} disabled={busy} title="สร้าง/เชื่อม LIFF จาก Access Token ที่บันทึกไว้" style={{ ...btn('ghost'), height: 46, padding: '0 22px', fontSize: 14 }}>สร้าง LIFF อัตโนมัติ</button>
        <button onClick={provisionMenu} disabled={busy} title="สร้าง Rich menu และตั้งเป็นค่าเริ่มต้น" style={{ ...btn('ghost'), height: 46, padding: '0 22px', fontSize: 14 }}>สร้าง Rich menu</button>
      </div>
    </div>
  );
}

/* ---------- onboarding (new employees via LINE) ---------- */
type Contact = { id: string; lineUserId: string; displayName: string | null; pictureUrl: string | null; status: 'incoming' | 'flex_sent' | 'confirmed' | 'linked' | 'rejected'; linkedUserId: string | null; linkedUserName: string | null; updatedAt: string };
type Emp = { id: string; name: string; department: string | null; position: string | null; employeeCode: string | null; lineUserId: string | null };
const ONB_STATUS: Record<Contact['status'], { c: string; bg: string; label: string }> = {
  incoming: { c: 'var(--info)', bg: 'var(--info-tint)', label: 'เข้ามาใหม่' },
  flex_sent: { c: 'var(--warn)', bg: 'var(--warn-tint)', label: 'ส่งยืนยันแล้ว' },
  confirmed: { c: 'var(--brand-700)', bg: 'var(--brand-tint)', label: 'พนักงานยืนยันแล้ว' },
  linked: { c: 'var(--brand-700)', bg: 'var(--brand-tint)', label: 'จับคู่แล้ว' },
  rejected: { c: 'var(--ink-3)', bg: '#F0F2F4', label: 'ปฏิเสธ' },
};
function OnboardingView() {
  const [rows, setRows] = useState<Contact[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(null), 3500); }
  function load() {
    api<Contact[]>('/line/onboarding/manage').then(setRows).catch(() => {});
    api<Emp[]>('/employees').then(setEmps).catch(() => {});
  }
  useEffect(() => { load(); }, []);
  async function act(id: string, path: string, body?: unknown, ok?: string) {
    setBusy(id);
    try { await api(`/line/onboarding/manage/${id}/${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined }); if (ok) flash(ok); load(); }
    catch (e) { flash(e instanceof Error ? e.message.replace(/^\d+\s*/, '') : 'ทำรายการไม่สำเร็จ'); }
    finally { setBusy(null); }
  }
  const unlinked = emps.filter((e) => !e.lineUserId);
  const visible = rows.filter((r) => r.status !== 'linked'); // matched ones move to the staff list
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 16, lineHeight: 1.6 }}>
        พนักงานใหม่กดเมนู "เริ่มใช้งาน" ใน LINE → รายชื่อจะขึ้นที่นี่ → กด "ส่งยืนยันตัวตน" → เมื่อพนักงานกดยืนยัน → เลือกว่าเป็นพนักงานคนไหนแล้วกด "จับคู่" (จับคู่แล้วจะย้ายไปหน้าพนักงาน)
      </div>
      {msg && <div style={{ ...card, padding: '12px 16px', marginBottom: 16, color: 'var(--brand-700)', fontWeight: 600, fontSize: 13, background: 'var(--brand-tint)', border: '1px solid #C9F0DA' }}>{msg}</div>}
      <div style={{ ...card, padding: '8px 18px 12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 12 }}><th style={{ padding: 10 }}>ผู้ใช้ LINE</th><th style={{ padding: 10 }}>สถานะ</th><th style={{ padding: 10 }}>จับคู่กับพนักงาน</th><th style={{ padding: 10, textAlign: 'right' }}>การจัดการ</th></tr></thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {r.pictureUrl ? <img src={r.pictureUrl} alt="" style={{ width: 34, height: 34, borderRadius: '50%' }} /> : <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--brand-tint)', color: 'var(--brand-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{(r.displayName ?? '?')[0]}</div>}
                    <div><div style={{ fontSize: 14, fontWeight: 600 }}>{r.displayName ?? '(ไม่มีชื่อ)'}</div><div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{r.lineUserId.slice(0, 12)}…</div></div>
                  </div>
                </td>
                <td style={{ padding: 12 }}><Badge text={ONB_STATUS[r.status].label} c={ONB_STATUS[r.status].c} bg={ONB_STATUS[r.status].bg} /></td>
                <td style={{ padding: 12 }}>
                  {r.status === 'linked' ? <span style={{ fontSize: 13, fontWeight: 600 }}>{r.linkedUserName ?? <span style={{ color: 'var(--danger)' }}>(พนักงานถูกลบ)</span>}</span> : (
                    <select value={pick[r.id] ?? ''} onChange={(e) => setPick({ ...pick, [r.id]: e.target.value })} style={{ ...field, width: 210, padding: '8px 10px' }}>
                      <option value="">— เลือกพนักงาน —</option>
                      {unlinked.map((e) => <option key={e.id} value={e.id}>{e.name}{e.department ? ` · ${e.department}` : ''}</option>)}
                    </select>
                  )}
                </td>
                <td style={{ padding: 12, textAlign: 'right' }}>
                  {r.status === 'linked' ? (
                    <button disabled={busy === r.id} onClick={() => act(r.id, 'unlink', undefined, 'ยกเลิกการจับคู่แล้ว')} style={{ ...btn('ghost'), height: 34 }}>ยกเลิกจับคู่</button>
                  ) : r.status !== 'rejected' && (
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button disabled={busy === r.id} onClick={() => act(r.id, 'send-flex', undefined, 'ส่งการ์ดยืนยันตัวตนแล้ว')} style={{ ...btn('ghost'), height: 34 }}>ส่งยืนยันตัวตน</button>
                      <button disabled={busy === r.id || !pick[r.id]} onClick={() => act(r.id, 'link', { userId: pick[r.id] }, 'จับคู่พนักงานเรียบร้อย')} style={{ ...btn('primary'), height: 34, opacity: pick[r.id] ? 1 : 0.5 }}>จับคู่</button>
                      <button disabled={busy === r.id} onClick={() => act(r.id, 'reject', undefined, 'ปฏิเสธแล้ว')} title="ปฏิเสธ" style={{ ...btn('danger'), height: 34, padding: '0 12px' }}>✕</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && <tr><td colSpan={4} style={{ padding: 28, textAlign: 'center', color: 'var(--ink-3)' }}>ไม่มีพนักงานที่รอจับคู่</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- office geofence (multi-site) ---------- */
type Office = { id: string; name: string; lat: number; lng: number; radiusM: number };

function OfficeEditor({ initial, onClose, onSaved }: { initial: Office | null; onClose: () => void; onSaved: (m: string) => void }) {
  const [f, setF] = useState({ name: initial?.name ?? '', lat: initial ? Number(initial.lat) : 13.7563, lng: initial ? Number(initial.lng) : 100.5018, radiusM: initial?.radiusM ?? 150 });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refs = useRef<{ map?: any; marker?: any; circle?: any }>({});
  const fRef = useRef(f); fRef.current = f;

  useEffect(() => { loadLeaflet().then(() => setReady(true)); }, []);
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!ready || !L || !boxRef.current || refs.current.map) return;
    const c = fRef.current;
    const map = L.map(boxRef.current).setView([c.lat, c.lng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    const marker = L.marker([c.lat, c.lng], { draggable: true }).addTo(map);
    const circle = L.circle([c.lat, c.lng], { radius: c.radiusM, color: '#06C755', fillColor: '#06C755', fillOpacity: 0.12 }).addTo(map);
    const set = (lat: number, lng: number) => setF((p) => ({ ...p, lat, lng }));
    map.on('click', (e: { latlng: { lat: number; lng: number } }) => set(e.latlng.lat, e.latlng.lng));
    marker.on('dragend', () => { const ll = marker.getLatLng(); set(ll.lat, ll.lng); });
    refs.current = { map, marker, circle };
    setTimeout(() => map.invalidateSize(), 120);
  }, [ready]);
  useEffect(() => {
    const { marker, circle, map } = refs.current;
    if (!marker || !circle) return;
    marker.setLatLng([f.lat, f.lng]); circle.setLatLng([f.lat, f.lng]); circle.setRadius(f.radiusM);
    if (map) map.panTo([f.lat, f.lng]);
  }, [f.lat, f.lng, f.radiusM]);

  function useMyLocation() {
    navigator.geolocation.getCurrentPosition((pos) => setF((p) => ({ ...p, lat: pos.coords.latitude, lng: pos.coords.longitude })), () => {}, { enableHighAccuracy: true });
  }
  async function save() {
    if (!f.name.trim()) return;
    setBusy(true);
    try {
      const body = JSON.stringify({ name: f.name, lat: f.lat, lng: f.lng, radiusM: f.radiusM });
      if (initial) await api(`/attendance/office/${initial.id}`, { method: 'PATCH', body });
      else await api('/attendance/office', { method: 'POST', body });
      onSaved(initial ? 'บันทึกสถานที่แล้ว' : 'เพิ่มสถานที่แล้ว'); onClose();
    } finally { setBusy(false); }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 560, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', padding: 22 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{initial ? 'แก้ไขสถานที่ปฏิบัติงาน' : 'เพิ่มสถานที่ปฏิบัติงาน'}</div>
        <div ref={boxRef} style={{ height: 280, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line)', marginBottom: 14, background: '#e9edf0' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>ชื่อสถานที่ *</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="เช่น สาขาลาดพร้าว, ไซต์ก่อสร้าง A" style={field} /></div>
          <div><label style={lbl}>ละติจูด</label><input value={f.lat} onChange={(e) => setF({ ...f, lat: Number(e.target.value) })} type="number" step="any" style={field} /></div>
          <div><label style={lbl}>ลองจิจูด</label><input value={f.lng} onChange={(e) => setF({ ...f, lng: Number(e.target.value) })} type="number" step="any" style={field} /></div>
          <div><label style={lbl}>รัศมี (เมตร)</label><input value={f.radiusM} onChange={(e) => setF({ ...f, radiusM: Number(e.target.value) })} type="number" min={10} style={field} /></div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}><button onClick={useMyLocation} style={{ ...btn('ghost'), height: 44, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" /></svg> ตำแหน่งปัจจุบัน</button></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={save} disabled={busy || !f.name.trim()} style={{ ...btn('primary'), flex: 1, height: 46 }}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          <button onClick={onClose} style={{ ...btn('ghost'), height: 46, padding: '0 20px' }}>ยกเลิก</button>
        </div>
      </div>
    </div>
  );
}

function OfficeView() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [edit, setEdit] = useState<{ office: Office | null } | null>(null);
  const [del, setDel] = useState<Office | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api<Office[]>('/attendance/office').then(setOffices).catch(() => {});
  useEffect(() => { load(); }, []);
  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(null), 3000); }
  async function remove(o: Office) {
    try { await api(`/attendance/office/${o.id}`, { method: 'DELETE' }); flash(`ลบ ${o.name} แล้ว`); } catch { flash('ลบไม่สำเร็จ'); }
    setDel(null); load();
  }
  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 10 }}>
        <div style={{ flex: 1, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>เพิ่มได้หลายสถานที่ (สำนักงาน/สาขา/ไซต์งาน) · กำหนดให้พนักงานแต่ละคนที่หน้า "พนักงาน" · เช็คอินจะจับ geofence ตามสถานที่ที่กำหนด</div>
        <button onClick={() => setEdit({ office: null })} style={{ ...btn('primary'), height: 42 }}>+ เพิ่มสถานที่</button>
      </div>
      {msg && <div style={{ ...card, padding: '12px 16px', marginBottom: 16, color: 'var(--brand-700)', fontWeight: 600, fontSize: 13, background: 'var(--brand-tint)', border: '1px solid #C9F0DA' }}>{msg}</div>}
      <div style={{ ...card, padding: '8px 20px 12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 12 }}><th style={{ padding: 10 }}>สถานที่</th><th style={{ padding: 10 }}>พิกัด</th><th style={{ padding: 10 }}>รัศมี</th><th style={{ padding: 10, textAlign: 'right' }}></th></tr></thead>
          <tbody>
            {offices.map((o) => (
              <tr key={o.id} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: 12, fontSize: 14, fontWeight: 600 }}>{o.name}</td>
                <td style={{ padding: 12, fontSize: 12, color: 'var(--ink-3)' }}>{Number(o.lat).toFixed(5)}, {Number(o.lng).toFixed(5)}</td>
                <td style={{ padding: 12, fontSize: 13 }}>{o.radiusM} ม.</td>
                <td style={{ padding: 12, textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <button onClick={() => setEdit({ office: o })} style={{ ...btn('ghost'), height: 32, padding: '0 12px', fontSize: 12 }}>แก้ไข</button>
                    <button onClick={() => setDel(o)} style={{ ...btn('danger'), height: 32, padding: '0 12px', fontSize: 12 }}>ลบ</button>
                  </div>
                </td>
              </tr>
            ))}
            {offices.length === 0 && <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>ยังไม่มีสถานที่ปฏิบัติงาน</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && <OfficeEditor initial={edit.office} onClose={() => setEdit(null)} onSaved={(m) => { flash(m); load(); }} />}
      {del && (
        <div onClick={() => setDel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 380, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)', marginBottom: 10 }}>ลบสถานที่</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 18, lineHeight: 1.6 }}>ลบ "{del.name}"? พนักงานที่ผูกกับสถานที่นี้จะกลับเป็น "เช็คอินได้ทุกที่"</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => remove(del)} style={{ ...btn('danger'), flex: 1, height: 44, background: 'var(--danger)', color: '#fff', border: 'none' }}>ลบ</button>
              <button onClick={() => setDel(null)} style={{ ...btn('ghost'), height: 44 }}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- shell ---------- */
const NAV = [
  { key: 'dashboard', label: 'แดชบอร์ด' },
  { key: 'staff', label: 'พนักงาน' },
  { key: 'onboarding', label: 'พนักงานเข้าใหม่ (LINE)' },
  { key: 'hire', label: 'อนุมัติเริ่มงาน' },
  { key: 'leave', label: 'อนุมัติการลา' },
  { key: 'payroll', label: 'เงินเดือน' },
  { key: 'office', label: 'จุดเช็คอิน (ออฟฟิศ)' },
  { key: 'line', label: 'การเชื่อมต่อ LINE' },
] as const;
const TITLES: Record<string, string> = { dashboard: 'ภาพรวม', staff: 'พนักงาน', onboarding: 'พนักงานเข้าใหม่ (LINE)', hire: 'อนุมัติเริ่มงาน', leave: 'อนุมัติการลา', payroll: 'เงินเดือน', office: 'จุดเช็คอิน (ออฟฟิศ)', line: 'การเชื่อมต่อ LINE' };

export function HrPage() {
  const me = currentUser();
  const [view, setView] = useState<string>('dashboard');
  const [showProfile, setShowProfile] = useState(false);
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
          <button onClick={() => setShowProfile(true)} title="โปรไฟล์ของฉัน" style={{ border: '1px solid var(--line)', background: '#fff', color: 'var(--ink-3)', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /></svg>
          </button>
          <button onClick={logout} title="ออกจากระบบ" style={{ border: '1px solid var(--line)', background: '#fff', color: 'var(--ink-3)', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></svg>
          </button>
        </div>
      </aside>
      {showProfile && <MyProfile onClose={() => setShowProfile(false)} />}

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: 72, flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', padding: '0 28px', fontSize: 18, fontWeight: 700 }}>{TITLES[view]}</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {view === 'dashboard' && <DashboardView />}
          {view === 'staff' && <StaffView />}
          {view === 'onboarding' && <OnboardingView />}
          {view === 'hire' && <HireView />}
          {view === 'leave' && <LeaveView />}
          {view === 'payroll' && <PayrollView />}
          {view === 'office' && <OfficeView />}
          {view === 'line' && <LineView />}
        </div>
      </main>
    </div>
  );
}
