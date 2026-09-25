import { useEffect, useRef, useState } from 'react';
import { api, currentUser, logout, downloadFile } from '../lib/api';
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
const card = 'bg-surface rounded-2xl border border-line';
const field = 'border border-line rounded-[10px] px-[13px] py-[11px] text-sm w-full';
const lbl = 'text-xs text-ink-2 mb-1.5 block';
function Badge({ text, c, bg }: { text: string; c: string; bg: string }) {
  return <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: c, background: bg }}>{text}</span>;
}
function btn(kind: 'primary' | 'ghost' | 'danger'): string {
  const base = 'rounded-[10px] font-semibold cursor-pointer';
  if (kind === 'primary') return `${base} bg-brand text-white`;
  if (kind === 'danger') return `${base} border border-[#FADBDB] bg-white text-danger`;
  return `${base} border border-line bg-white text-ink`;
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
    <div className={`${card} p-[18px]`}><div className="text-xs text-ink-2 mb-2">{label}</div><div className="text-[26px] font-bold" style={{ color }}>{val}</div></div>
  );
  return (
    <div>
      <div className="grid grid-cols-3 gap-4">
        {stat('รออนุมัติการลา', leave, 'var(--warn)')}
        {stat('รออนุมัติเริ่มงาน', hire, 'var(--info)')}
        {stat('งานค้างรวม', leave + hire, 'var(--ink)')}
      </div>
      <div className={`${card} p-5 mt-4 text-ink-2 text-sm`}>
        ยินดีต้อนรับสู่คอนโซล HR — เลือกเมนูด้านซ้ายเพื่อจัดการพนักงาน อนุมัติคำขอ เงินเดือน และการเชื่อมต่อ LINE ของหน่วยงาน
      </div>
    </div>
  );
}

/* ---------- staff ---------- */
type Employee = { id: string; name: string; department?: string | null; position?: string | null; role: string; employeeCode?: string | null; email?: string | null; baseSalary?: string | null; active: boolean; lineUserId?: string | null; hasConsent?: boolean; officeId?: string | null; officeName?: string | null };
type EmpForm = { name: string; employeeCode: string; department: string; position: string; email: string; phone: string; baseSalary: string; role: string; officeId: string };
type OfficeOpt = { id: string; name: string; isDefault?: boolean };
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
    <div><label className={lbl}>{label}</label><input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={field} /></div>
  );
  return (
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(15,23,32,0.45)] flex items-center justify-center z-50">
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className={`${card} w-[460px] p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="text-base font-bold mb-4">{id ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน'}</div>
        {err && <div className="bg-danger-tint text-danger rounded-[10px] px-[13px] py-[9px] text-[13px] mb-[14px]">{err}</div>}
        <div className="grid grid-cols-2 gap-[14px] mb-4">
          <div className="col-[1/-1]"><label className={lbl}>ชื่อ-นามสกุล *</label><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={field} /></div>
          {inp('employeeCode', 'รหัสพนักงาน')}
          {inp('department', 'แผนก')}
          {inp('position', 'ตำแหน่ง')}
          {inp('email', 'อีเมล', 'email')}
          {inp('phone', 'เบอร์โทร')}
          {inp('baseSalary', 'เงินเดือน (บาท)')}
          <div><label className={lbl}>บทบาท</label><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={field}><option value="employee">พนักงาน</option><option value="supervisor">หัวหน้างาน</option></select></div>
          <div><label className={lbl}>สถานที่ปฏิบัติงาน</label><select value={f.officeId} onChange={(e) => setF({ ...f, officeId: e.target.value })} className={field}><option value="">ทุกสถานที่</option>{offices.map((o) => <option key={o.id} value={o.id}>{o.name}{o.isDefault ? ' (ค่าเริ่มต้น)' : ''}</option>)}</select></div>
        </div>
        <div className="flex gap-2.5">
          <button type="submit" disabled={busy} className={`${btn('primary')} flex-1 h-11 px-4 text-[13px]`}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          <button type="button" onClick={onClose} className={`${btn('ghost')} h-11 px-4 text-[13px]`}>ยกเลิก</button>
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
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(15,23,32,0.45)] flex items-center justify-center z-50">
      <div onClick={(e) => e.stopPropagation()} className={`${card} w-[560px] p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="text-base font-bold mb-1.5">นำเข้าพนักงานจาก CSV</div>
        {result ? (
          <div className="mt-3">
            <div className="bg-brand-tint rounded-2xl border border-[#C9F0DA] p-4 mb-4">
              <div className="font-bold text-brand-700">นำเข้าเสร็จสิ้น</div>
              <div className="text-sm mt-1.5">สำเร็จ {result.created} รายการ{result.failed ? ` · ล้มเหลว ${result.failed} รายการ` : ''}</div>
            </div>
            <button onClick={onClose} className={`${btn('primary')} w-full h-11 px-4 text-[13px]`}>เสร็จสิ้น</button>
          </div>
        ) : headers.length === 0 ? (
          <div className="mt-[14px]">
            <div className="text-[13px] text-ink-2 mb-[14px] leading-[1.6]">เลือกไฟล์ CSV (แถวแรกเป็นหัวคอลัมน์) แล้วจับคู่คอลัมน์กับข้อมูลพนักงานในขั้นถัดไป</div>
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="border border-line rounded-[10px] text-sm w-full p-2.5" />
            <div className="flex justify-end mt-[18px]"><button onClick={onClose} className={`${btn('ghost')} h-10 px-4 text-[13px]`}>ยกเลิก</button></div>
          </div>
        ) : (
          <div className="mt-[14px]">
            <div className="text-[13px] text-ink-2 mb-[14px]">พบ {data.length} แถว · จับคู่คอลัมน์ (ระบบเดาให้แล้ว ปรับได้)</div>
            <div className="grid gap-2.5 mb-4">
              {EMP_FIELDS.map((fld) => (
                <div key={fld.key} className="flex items-center gap-3">
                  <div className="w-[130px] text-[13px] font-semibold">{fld.label}{fld.req && <span className="text-danger"> *</span>}</div>
                  <select value={map[fld.key] ?? -1} onChange={(e) => setMap({ ...map, [fld.key]: Number(e.target.value) })} className={`${field} flex-1`}>
                    <option value={-1}>— ไม่ใช้ —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `คอลัมน์ ${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {!mappedName && <div className="bg-danger-tint text-danger rounded-[10px] px-[13px] py-[9px] text-[13px] mb-3">ต้องจับคู่คอลัมน์ "ชื่อ-นามสกุล" ก่อน</div>}
            <div className="flex gap-2.5">
              <button disabled={!mappedName || busy} onClick={doImport} className={`${btn('primary')} flex-1 h-11 px-4 text-[13px]`} style={{ opacity: mappedName ? 1 : 0.5 }}>{busy ? 'กำลังนำเข้า…' : `นำเข้า ${data.length} รายการ`}</button>
              <button onClick={() => { setHeaders([]); setData([]); }} className={`${btn('ghost')} h-11 px-4 text-[13px]`}>เลือกไฟล์ใหม่</button>
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
  function openAdd() {
    setEdit({ form: { ...emptyEmp, officeId: offices.find((o) => o.isDefault)?.id ?? '' } });
  }
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
      <div className="flex items-center mb-4 gap-2.5">
        <div className="flex-1 text-sm text-ink-2">ทั้งหมด {rows.length} คน</div>
        <button onClick={() => setImporting(true)} className={`${btn('ghost')} h-10 px-4 text-[13px]`}>นำเข้า CSV</button>
        <button onClick={openAdd} className={`${btn('primary')} h-10 px-4 text-[13px]`}>+ เพิ่มพนักงาน</button>
      </div>
      {msg && <div className="bg-brand-tint rounded-2xl border border-[#C9F0DA] px-4 py-3 mb-4 text-brand-700 font-semibold text-[13px]">{msg}</div>}
      <div className={`${card} px-5 pt-2 pb-3`}>
        <table className="w-full border-collapse">
          <thead><tr className="text-left text-ink-3 text-xs">
            <th className="p-2.5">พนักงาน</th><th className="p-2.5">แผนก</th><th className="p-2.5">สถานที่</th><th className="p-2.5">บทบาท</th><th className="p-2.5">LINE</th><th className="p-2.5">PDPA</th><th className="p-2.5">สถานะ</th><th className="p-2.5 text-right"></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#F2F3F5]">
                <td className="p-3"><div className="text-sm font-semibold">{r.name}</div><div className="text-xs text-ink-3">{r.employeeCode ?? '—'} · {r.position ?? ''}</div></td>
                <td className="p-3 text-[13px] text-ink-2">{r.department ?? '—'}</td>
                <td className="p-3 text-[13px] text-ink-2">{r.officeName ?? <span className="text-ink-3">ทุกที่</span>}</td>
                <td className="p-3 text-[13px]">{r.role === 'supervisor' ? 'หัวหน้างาน' : r.role === 'org_admin' ? 'ผู้ดูแล' : 'พนักงาน'}</td>
                <td className="p-3">{r.lineUserId
                  ? <span className="inline-flex items-center gap-2"><Badge text="เชื่อมแล้ว" c="var(--brand-700)" bg="var(--brand-tint)" /><button onClick={() => unlinkLine(r)} title="ยกเลิกการผูก LINE" className="bg-transparent text-ink-3 text-[11px] cursor-pointer underline">ยกเลิกผูก</button></span>
                  : <Badge text="ยังไม่เชื่อม" c="var(--ink-3)" bg="#F0F2F4" />}</td>
                <td className="p-3">{r.hasConsent ? <Badge text="ยินยอมแล้ว" c="var(--brand-700)" bg="var(--brand-tint)" /> : <Badge text="รอยินยอม" c="var(--warn)" bg="var(--warn-tint)" />}</td>
                <td className="p-3">{r.active ? <Badge text="ทำงาน" c="var(--brand-700)" bg="var(--brand-tint)" /> : <Badge text="ปิดใช้งาน" c="var(--ink-3)" bg="#F0F2F4" />}</td>
                <td className="p-3 text-right">
                  <div className="inline-flex gap-1.5">
                    <button onClick={() => openEdit(r)} className={`${btn('ghost')} h-8 px-3 text-xs`}>แก้ไข</button>
                    <button onClick={() => setDel(r)} className={`${btn('danger')} h-8 px-3 text-xs`}>ลบ</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-ink-3">ยังไม่มีพนักงาน</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && <EmployeeModal initial={edit.form} id={edit.id} offices={offices} onClose={() => setEdit(null)} onDone={(m) => { flash(m); load(); }} />}
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={(m) => { flash(m); load(); }} />}
      {del && (
        <div onClick={() => setDel(null)} className="fixed inset-0 bg-[rgba(15,23,32,0.45)] flex items-center justify-center z-[60]">
          <div onClick={(e) => e.stopPropagation()} className={`${card} w-[380px] p-6`}>
            <div className="text-base font-bold text-danger mb-2.5">ลบพนักงาน</div>
            <div className="text-[13px] text-ink-2 mb-[18px] leading-[1.6]">ลบ "{del.name}"? หากมีประวัติในระบบ (ลงเวลา/ลา/เงินเดือน) ระบบจะปิดการใช้งานแทน</div>
            <div className="flex gap-2.5">
              <button onClick={() => remove(del)} className="rounded-[10px] font-semibold cursor-pointer bg-danger text-white flex-1 h-11 px-4 text-[13px]">ลบ</button>
              <button onClick={() => setDel(null)} className={`${btn('ghost')} h-11 px-4 text-[13px]`}>ยกเลิก</button>
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
      <div className="text-[13px] text-ink-2 mb-3">เส้นทางอนุมัติ: <b>หัวหน้างาน</b></div>
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.id} className={`${card} p-4 flex items-center gap-4`}>
            <div className="flex-1">
              <div className="text-sm font-semibold">{LEAVE_LABEL[r.type] ?? r.type} · {r.days} วัน</div>
              <div className="text-xs text-ink-3">{r.startDate} → {r.endDate} · {r.reason ?? ''}</div>
            </div>
            <button onClick={() => decide(r.id, true)} className={`${btn('primary')} h-10 px-4 text-[13px]`}>อนุมัติ</button>
            <button onClick={() => decide(r.id, false)} className={`${btn('danger')} h-10 px-4 text-[13px]`}>ปฏิเสธ</button>
          </div>
        ))}
        {rows.length === 0 && <div className={`${card} p-6 text-center text-ink-3`}>ไม่มีคำขอลาค้างอนุมัติ</div>}
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
      <div className="text-[13px] text-ink-2 mb-3">ผู้อนุมัติ: <b>ฝ่ายบุคคล (HR)</b> · ตรวจเอกสาร/PII ก่อนกำหนดวันเริ่มงาน</div>
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.id} className={`${card} p-4 flex items-center gap-4`}>
            <div className="flex-1">
              <div className="text-sm font-semibold">{r.name}</div>
              <div className="text-xs text-ink-3">{r.position ?? ''} · {r.department ?? ''} · ยื่นเมื่อ {r.appliedAt} · {r.docsComplete ? 'เอกสารครบ' : 'เอกสารไม่ครบ'}</div>
            </div>
            <button onClick={() => decide(r.id, true)} className={`${btn('primary')} h-10 px-4 text-[13px]`}>อนุมัติเริ่มงาน</button>
            <button onClick={() => decide(r.id, false)} className={`${btn('danger')} h-10 px-4 text-[13px]`}>ปฏิเสธ</button>
          </div>
        ))}
        {rows.length === 0 && <div className={`${card} p-6 text-center text-ink-3`}>ไม่มีคำขอเริ่มงานค้างอนุมัติ</div>}
      </div>
    </div>
  );
}

/* ---------- payroll ---------- */
type Run = { id: string; period: string; status: string; totalNet: string; generated?: number; skipped?: { id: string; name: string }[] };
type Slip = { id: string; userId: string; name: string; department?: string; gross: string; deductions: string; net: string; sentAt: string | null };
type Comp = { id: string; kind: 'earning' | 'deduction'; label: string; amount: string; system?: boolean };

function ComponentsModal({ slip, editable, onClose, onChanged }: { slip: Slip; editable: boolean; onClose: () => void; onChanged: () => void }) {
  const [comps, setComps] = useState<Comp[]>([]);
  const [f, setF] = useState({ kind: 'earning', label: '', amount: '' });
  const load = () => api<Comp[]>(`/payroll/payslips/${slip.id}/components`).then(setComps).catch(() => {});
  useEffect(() => { load(); }, []);
  async function add() {
    if (!f.label.trim() || !f.amount) return;
    await api(`/payroll/payslips/${slip.id}/components`, { method: 'POST', body: JSON.stringify(f) });
    setF({ kind: f.kind, label: '', amount: '' }); load(); onChanged();
  }
  async function rm(id: string) { await api(`/payroll/components/${id}`, { method: 'DELETE' }); load(); onChanged(); }
  return (
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(15,23,32,0.45)] flex items-center justify-center z-[60]">
      <div onClick={(e) => e.stopPropagation()} className={`${card} w-[460px] max-h-[90vh] overflow-y-auto p-[22px]`}>
        <div className="text-base font-bold mb-1">รายการเงินเดือน — {slip.name}</div>
        <div className="text-xs text-ink-3 mb-[14px]">สุทธิ ฿{slip.net}</div>
        {comps.map((c) => (
          <div key={c.id} className="flex items-center gap-2.5 py-[9px] border-b border-line">
            <span className="flex-1 text-[13px]">{c.label}{c.system && <span className="text-[10px] text-ink-3 ml-1.5">(อัตโนมัติ)</span>}</span>
            <span className="text-[13px] font-semibold" style={{ color: c.kind === 'earning' ? 'var(--brand-700)' : 'var(--danger)' }}>{c.kind === 'earning' ? '+' : '−'}{c.amount}</span>
            {editable && !c.system ? <button onClick={() => rm(c.id)} className="bg-transparent text-ink-3 cursor-pointer text-base">×</button> : <span className="w-4" />}
          </div>
        ))}
        {comps.length === 0 && <div className="text-[13px] text-ink-3 p-3 text-center">ยังไม่มีรายการ</div>}
        {editable && (
          <div className="mt-4 bg-bg rounded-xl p-3">
            <div className="flex gap-2 mb-2">
              <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={`${field} w-[120px]`}><option value="earning">รายได้</option><option value="deduction">รายการหัก</option></select>
              <input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="เช่น OT, เบี้ยขยัน, หักลา" className={`${field} flex-1`} />
            </div>
            <div className="flex gap-2">
              <input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} type="number" placeholder="จำนวนเงิน" className={`${field} flex-1`} />
              <button onClick={add} className={`${btn('primary')} h-[42px] px-[20px] text-[13px]`}>เพิ่ม</button>
            </div>
          </div>
        )}
        <button onClick={onClose} className={`${btn('ghost')} h-[42px] w-full mt-4 px-4 text-[13px]`}>ปิด</button>
      </div>
    </div>
  );
}

function PayrollView() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [rows, setRows] = useState<Slip[]>([]);
  const [stats, setStats] = useState<Record<string, { present: number; late: number }>>({});
  const [editSlip, setEditSlip] = useState<Slip | null>(null);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(null), 3500); }
  async function loadRuns(selectId?: string) {
    const r = await api<Run[]>('/payroll/runs').catch(() => []);
    setRuns(r);
    const sel = r.find((x) => x.id === selectId) ?? r.find((x) => x.id === run?.id) ?? r[0] ?? null;
    if (sel) openRun(sel);
  }
  async function openRun(r: Run) {
    setRun(r);
    setRows(await api<Slip[]>(`/payroll/runs/${r.id}/payslips`).catch(() => []));
    setStats(await api<Record<string, { present: number; late: number }>>(`/payroll/stats?period=${r.period}`).catch(() => ({})));
  }
  useEffect(() => { loadRuns(); }, []);
  async function generate() {
    setBusy(true);
    try {
      const r = await api<Run>('/payroll/runs', { method: 'POST', body: JSON.stringify({ period }) });
      flash(`คำนวณงวด ${period} แล้ว — สร้างสลิป ${r.generated ?? 0} คน`);
      const sk = r.skipped ?? [];
      setWarn(sk.length ? `ข้ามพนักงาน ${sk.length} คนที่ยังไม่ได้ตั้งเงินเดือน (ไม่มีสลิป): ${sk.map((x) => x.name).join(', ')} — ตั้งเงินเดือนในหน้า "พนักงาน" แล้วกดสร้างรอบใหม่` : null);
      await loadRuns(r.id);
    }
    catch (e) { flash(e instanceof Error ? e.message.replace(/^\d+\s*/, '').replace(/^\{.*"message":"([^"]+)".*\}$/, '$1') : 'คำนวณไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  async function approve() { if (!run) return; await api(`/payroll/runs/${run.id}/approve`, { method: 'POST' }); flash('อนุมัติงวดแล้ว'); loadRuns(run.id); }
  const send = async (id: string) => {
    try { await api(`/payroll/payslips/${id}/send`, { method: 'POST' }); openRun(run!); }
    catch (e) { flash(e instanceof Error ? e.message.replace(/^\d+\s*/, '').replace(/^\{.*"message":"([^"]+)".*\}$/, '$1') : 'ส่งสลิปไม่สำเร็จ'); }
  };
  const draft = run?.status === 'draft';
  const sent = rows.filter((r) => r.sentAt).length;
  return (
    <div>
      <div className={`${card} p-[18px] mb-4 flex items-center gap-3 flex-wrap`}>
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={`${field} w-[160px]`} />
        <button onClick={generate} disabled={busy} className={`${btn('primary')} h-[42px] px-4 text-[13px]`}>{busy ? 'กำลังคำนวณ…' : 'สร้าง / คำนวณรอบ'}</button>
        {runs.length > 0 && (
          <select value={run?.id ?? ''} onChange={(e) => { const r = runs.find((x) => x.id === e.target.value); if (r) openRun(r); }} className={`${field} w-[220px] ml-auto`}>
            {runs.map((r) => <option key={r.id} value={r.id}>งวด {r.period} · {r.status === 'draft' ? 'ร่าง' : r.status === 'approved' ? 'อนุมัติแล้ว' : 'จ่ายแล้ว'}</option>)}
          </select>
        )}
      </div>
      {msg && <div className="bg-brand-tint rounded-2xl border border-[#C9F0DA] px-4 py-3 mb-4 text-brand-700 font-semibold text-[13px]">{msg}</div>}
      {warn && <div className="bg-warn-tint rounded-2xl border border-[#F3E1C0] px-4 py-3 mb-4 text-[#8a5a00] font-semibold text-[13px] flex gap-2.5 items-start"><span>⚠️</span><span className="flex-1 leading-[1.5]">{warn}</span><button onClick={() => setWarn(null)} className="bg-transparent cursor-pointer text-[#8a5a00] text-base">×</button></div>}
      {run && (
        <div className={`${card} p-4 mb-4 flex items-center gap-3`}>
          <div className="flex-1"><div className="text-[15px] font-bold">งวด {run.period} {draft ? <Badge text="ร่าง" c="var(--warn)" bg="var(--warn-tint)" /> : <Badge text="อนุมัติแล้ว" c="var(--brand-700)" bg="var(--brand-tint)" />}</div><div className="text-xs text-ink-3">สุทธิรวม ฿{run.totalNet} · พนักงาน {rows.length} คน · ส่งสลิป {sent}/{rows.length}</div></div>
          {draft && <button onClick={approve} className={`${btn('primary')} h-10 px-4 text-[13px]`}>อนุมัติงวด</button>}
        </div>
      )}
      <div className={`${card} px-5 pt-2 pb-3`}>
        <table className="w-full border-collapse">
          <thead><tr className="text-left text-ink-3 text-xs">
            <th className="p-2.5">พนักงาน</th><th className="p-2.5">มา/สาย</th><th className="p-2.5 text-right">รายได้</th><th className="p-2.5 text-right">หัก</th><th className="p-2.5 text-right">สุทธิ</th><th className="p-2.5 text-right">จัดการ</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#F2F3F5]">
                <td className="p-3"><div className="text-sm font-semibold">{r.name}</div><div className="text-xs text-ink-3">{r.department ?? ''}</div></td>
                <td className="p-3 text-xs text-ink-2">{stats[r.userId]?.present ?? 0}/<span className="text-warn">{stats[r.userId]?.late ?? 0}</span></td>
                <td className="p-3 text-right text-[13px] text-brand-700">{r.gross}</td>
                <td className="p-3 text-right text-[13px] text-danger">−{r.deductions}</td>
                <td className="p-3 text-right text-sm font-bold">{r.net}</td>
                <td className="p-3 text-right">
                  <div className="inline-flex gap-1.5">
                    <button onClick={() => setEditSlip(r)} className={`${btn('ghost')} h-8 px-3 text-xs`}>{draft ? 'จัดการ' : 'ดู'}</button>
                    <button onClick={() => downloadFile(`/payroll/payslips/${r.id}/pdf`, `payslip-${run?.period}-${r.name}.pdf`).catch(() => {})} title="ดาวน์โหลดสลิป PDF" className={`${btn('ghost')} h-8 px-[10px] text-xs`}>PDF</button>
                    {r.sentAt ? <Badge text="ส่งแล้ว" c="var(--brand-700)" bg="var(--brand-tint)" /> : <button onClick={() => send(r.id)} className="rounded-[10px] font-semibold cursor-pointer border bg-white border-brand text-brand-700 h-8 px-3 text-xs">ส่งสลิป</button>}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-ink-3">ยังไม่มีรอบเงินเดือน — เลือกงวดแล้วกด "สร้าง / คำนวณรอบ"</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-ink-3 mt-3">เงินเดือนฐานดึงจากข้อมูลพนักงาน · เพิ่ม OT/เบี้ยขยัน/รายการหักได้ที่ "จัดการ" · คอลัมน์ มา/สาย = จำนวนวันในงวด (อ้างอิง) · ภาษี/ประกันสังคมจะเพิ่มในเฟสถัดไป</div>
      {editSlip && <ComponentsModal slip={editSlip} editable={draft} onClose={() => setEditSlip(null)} onChanged={() => run && openRun(run)} />}
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
    <label className="flex items-center gap-2.5 py-2.5 cursor-pointer">
      <input type="checkbox" checked={f.features[k]} onChange={(e) => setF({ ...f, features: { ...f.features, [k]: e.target.checked } })} />
      <span className="text-sm">{label}</span>
    </label>
  );
  const hint = (t: React.ReactNode) => <div className="text-[11.5px] text-ink-3 mt-[5px] leading-[1.5]">{t}</div>;
  return (
    <div className="max-w-[760px]">
      <div className="bg-brand-tint rounded-2xl border border-[#C9F0DA] px-[18px] py-[14px] mb-4">
        <div className="text-[13px] text-brand-700 leading-[1.6]">
          เปิด <b>LINE Developers Console</b> (developers.line.biz) → เลือก <b>Provider</b> ของคุณ จะเห็น 2 แชนแนล: <b>LINE Login</b> (สำหรับให้พนักงานล็อกอิน/LIFF) และ <b>Messaging API</b> (บอตสำหรับส่งแจ้งเตือน/สลิป/rich menu) — คัดลอกค่าจากแต่ละแชนแนลมาตามช่องด้านล่าง
        </div>
      </div>

      {/* ---- LINE Login channel ---- */}
      <div className={`${card} p-[22px] mb-4`}>
        <div className="flex items-center mb-1">
          <div className="text-[15px] font-bold flex-1">1) LINE Login channel <span className="font-normal text-ink-3 text-[13px]">— สำหรับล็อกอิน + LIFF</span></div>
          {f.liffId && f.liffId.indexOf('abcdWXYZ') === -1 ? <Badge text="● พร้อมล็อกอิน" c="var(--brand-700)" bg="var(--brand-tint)" /> : <Badge text="ยังไม่พร้อม" c="var(--warn)" bg="var(--warn-tint)" />}
        </div>
        <div className="text-xs text-ink-3 mb-4">ต้องเป็นแชนแนลชนิด LINE Login ที่เปิด <b>Web app</b> ไว้ (แท็บ LINE Login → App types)</div>
        <div className="grid grid-cols-2 gap-4 mb-[14px]">
          <div>
            <label className={lbl}>LINE Login Channel ID</label>
            <input value={f.loginChannelId} onChange={(e) => setF({ ...f, loginChannelId: e.target.value })} placeholder="เช่น 2001234567" className={field} />
            {hint(<>แชนแนล LINE Login → แท็บ <b>Basic settings</b> → หัวข้อ <b>Channel ID</b> (ตัวเลขล้วน)</>)}
          </div>
          <div>
            <label className={lbl}>LINE Login Channel Secret {hasLoginSecret && <span className="text-ink-3">(เว้นว่าง = คงเดิม)</span>}</label>
            <input type="password" value={f.loginChannelSecret} onChange={(e) => setF({ ...f, loginChannelSecret: e.target.value })} placeholder="••••••••" className={field} />
            {hint(<>แชนแนลเดียวกัน → <b>Basic settings</b> → <b>Channel secret</b> · ใช้ให้ระบบสร้าง LIFF อัตโนมัติ</>)}
          </div>
        </div>
        <label className={lbl}>LIFF ID <span className="text-ink-3">(ระบบสร้าง/เชื่อมให้อัตโนมัติ)</span></label>
        <input value={f.liffId} readOnly placeholder="— ระบบจะสร้างให้เมื่อกรอก Login Channel ID + Secret แล้วบันทึก —" className={`${field} mb-1.5 bg-bg text-ink-2`} />
        {hint(<>ไม่ต้องสร้าง LIFF ใน LINE เอง — ระบบสร้างให้ที่ endpoint <b>https://hr.poszee.com/liff/</b> (scope openid+profile) และตั้ง Channel ID ให้เอง</>)}
      </div>

      {/* ---- Messaging API channel ---- */}
      <div className={`${card} p-[22px] mb-4`}>
        <div className="flex items-center mb-4">
          <div className="text-[15px] font-bold flex-1">2) Messaging API channel <span className="font-normal text-ink-3 text-[13px]">— บอต: แจ้งเตือน/สลิป/rich menu</span></div>
          {connected ? <Badge text="● เชื่อมต่อแล้ว" c="var(--brand-700)" bg="var(--brand-tint)" /> : <Badge text="ยังไม่เชื่อมต่อ" c="var(--ink-3)" bg="#F0F2F4" />}
        </div>
        <div className="grid grid-cols-2 gap-4 mb-1">
          <div>
            <label className={lbl}>Messaging Channel ID</label>
            <input value={f.channelId} onChange={(e) => setF({ ...f, channelId: e.target.value })} placeholder="เช่น 2001234567" className={field} />
            {hint(<>แชนแนล Messaging API → <b>Basic settings</b> → <b>Channel ID</b></>)}
          </div>
          <div>
            <label className={lbl}>Channel Secret {connected && <span className="text-ink-3">(เว้นว่าง = คงเดิม)</span>}</label>
            <input type="password" value={f.channelSecret} onChange={(e) => setF({ ...f, channelSecret: e.target.value })} placeholder="••••••••" className={field} />
            {hint(<>Messaging API → <b>Basic settings</b> → <b>Channel secret</b> (ใช้ตรวจ webhook)</>)}
          </div>
          <div className="col-[1/-1]">
            <label className={lbl}>Channel Access Token {connected && <span className="text-ink-3">(เว้นว่าง = คงเดิม)</span>}</label>
            <input type="password" value={f.accessToken} onChange={(e) => setF({ ...f, accessToken: e.target.value })} placeholder="••••••••" className={field} />
            {hint(<>Messaging API → แท็บ <b>Messaging API</b> → <b>Channel access token (long-lived)</b> → กด Issue · ใช้ส่งข้อความ/สร้าง rich menu</>)}
          </div>
        </div>
        <div className="text-xs text-ink-3 mt-3">Webhook URL (ตั้งใน Messaging API → Webhook): <b>https://hr.poszee.com/api/line/webhook</b> · credential ทั้งหมดถูกเข้ารหัสก่อนจัดเก็บ</div>
      </div>

      <div className={`${card} pt-1 px-[22px] pb-4 mb-4`}>
        <div className="text-[15px] font-bold pt-4 pb-1">ฟีเจอร์ LINE</div>
        <Toggle k="richMenu" label="Rich Menu (เมนูลัดในแชท)" />
        <Toggle k="notifyPush" label="แจ้งเตือนผ่าน LINE (เช็คอิน/อนุมัติ)" />
        <Toggle k="sendSlip" label="ส่งสลิปเงินเดือนทาง LINE (PDF เข้ารหัส)" />
      </div>

      {msg && <div className="bg-brand-tint rounded-2xl border border-[#C9F0DA] px-4 py-3 mb-4 text-brand-700 font-semibold text-[13px]">{msg}</div>}
      <div className="flex gap-2.5">
        <button onClick={save} disabled={busy} className={`${btn('primary')} h-[46px] px-[22px] text-sm`}>บันทึกการเชื่อมต่อ</button>
        <button onClick={test} disabled={busy} className="rounded-[10px] font-semibold cursor-pointer border bg-white border-brand text-brand-700 h-[46px] px-[22px] text-sm">ทดสอบการเชื่อมต่อ</button>
        <button onClick={provision} disabled={busy} title="สร้าง/เชื่อม LIFF จาก Access Token ที่บันทึกไว้" className={`${btn('ghost')} h-[46px] px-[22px] text-sm`}>สร้าง LIFF อัตโนมัติ</button>
        <button onClick={provisionMenu} disabled={busy} title="สร้าง Rich menu และตั้งเป็นค่าเริ่มต้น" className={`${btn('ghost')} h-[46px] px-[22px] text-sm`}>สร้าง Rich menu</button>
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
      <div className="text-[13px] text-ink-2 mb-4 leading-[1.6]">
        พนักงานใหม่กดเมนู "เริ่มใช้งาน" ใน LINE → รายชื่อจะขึ้นที่นี่ → กด "ส่งยืนยันตัวตน" → เมื่อพนักงานกดยืนยัน → เลือกว่าเป็นพนักงานคนไหนแล้วกด "จับคู่" (จับคู่แล้วจะย้ายไปหน้าพนักงาน)
      </div>
      {msg && <div className="bg-brand-tint rounded-2xl border border-[#C9F0DA] px-4 py-3 mb-4 text-brand-700 font-semibold text-[13px]">{msg}</div>}
      <div className={`${card} px-[18px] pt-2 pb-3`}>
        <table className="w-full border-collapse">
          <thead><tr className="text-left text-ink-3 text-xs"><th className="p-2.5">ผู้ใช้ LINE</th><th className="p-2.5">สถานะ</th><th className="p-2.5">จับคู่กับพนักงาน</th><th className="p-2.5 text-right">การจัดการ</th></tr></thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="p-3">
                  <div className="flex items-center gap-2.5">
                    {r.pictureUrl ? <img src={r.pictureUrl} alt="" className="w-[34px] h-[34px] rounded-full" /> : <div className="w-[34px] h-[34px] rounded-full bg-brand-tint text-brand-700 flex items-center justify-center font-bold text-sm">{(r.displayName ?? '?')[0]}</div>}
                    <div><div className="text-sm font-semibold">{r.displayName ?? '(ไม่มีชื่อ)'}</div><div className="text-[11px] text-ink-3">{r.lineUserId.slice(0, 12)}…</div></div>
                  </div>
                </td>
                <td className="p-3"><Badge text={ONB_STATUS[r.status].label} c={ONB_STATUS[r.status].c} bg={ONB_STATUS[r.status].bg} /></td>
                <td className="p-3">
                  {r.status === 'linked' ? <span className="text-[13px] font-semibold">{r.linkedUserName ?? <span className="text-danger">(พนักงานถูกลบ)</span>}</span> : (
                    <select value={pick[r.id] ?? ''} onChange={(e) => setPick({ ...pick, [r.id]: e.target.value })} className="border border-line rounded-[10px] text-sm w-[210px] px-2.5 py-2">
                      <option value="">— เลือกพนักงาน —</option>
                      {unlinked.map((e) => <option key={e.id} value={e.id}>{e.name}{e.department ? ` · ${e.department}` : ''}</option>)}
                    </select>
                  )}
                </td>
                <td className="p-3 text-right">
                  {r.status === 'linked' ? (
                    <button disabled={busy === r.id} onClick={() => act(r.id, 'unlink', undefined, 'ยกเลิกการจับคู่แล้ว')} className={`${btn('ghost')} h-[34px] px-4 text-[13px]`}>ยกเลิกจับคู่</button>
                  ) : r.status !== 'rejected' && (
                    <div className="inline-flex gap-1.5">
                      <button disabled={busy === r.id} onClick={() => act(r.id, 'send-flex', undefined, 'ส่งการ์ดยืนยันตัวตนแล้ว')} className={`${btn('ghost')} h-[34px] px-4 text-[13px]`}>ส่งยืนยันตัวตน</button>
                      <button disabled={busy === r.id || !pick[r.id]} onClick={() => act(r.id, 'link', { userId: pick[r.id] }, 'จับคู่พนักงานเรียบร้อย')} className={`${btn('primary')} h-[34px] px-4 text-[13px]`} style={{ opacity: pick[r.id] ? 1 : 0.5 }}>จับคู่</button>
                      <button disabled={busy === r.id} onClick={() => act(r.id, 'reject', undefined, 'ปฏิเสธแล้ว')} title="ปฏิเสธ" className={`${btn('danger')} h-[34px] px-3 text-[13px]`}>✕</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && <tr><td colSpan={4} className="p-7 text-center text-ink-3">ไม่มีพนักงานที่รอจับคู่</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- office geofence (multi-site) ---------- */
type Office = { id: string; name: string; lat: number; lng: number; radiusM: number; isDefault?: boolean };

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
    <div onClick={onClose} className="fixed inset-0 bg-[rgba(15,23,32,0.45)] flex items-center justify-center z-[60]">
      <div onClick={(e) => e.stopPropagation()} className={`${card} w-[560px] max-w-[94vw] max-h-[92vh] overflow-y-auto p-[22px]`}>
        <div className="text-base font-bold mb-[14px]">{initial ? 'แก้ไขสถานที่ปฏิบัติงาน' : 'เพิ่มสถานที่ปฏิบัติงาน'}</div>
        <div ref={boxRef} className="h-[280px] rounded-[14px] overflow-hidden border border-line mb-[14px] bg-[#e9edf0]" />
        <div className="grid grid-cols-2 gap-3 mb-[14px]">
          <div className="col-[1/-1]"><label className={lbl}>ชื่อสถานที่ *</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="เช่น สาขาลาดพร้าว, ไซต์ก่อสร้าง A" className={field} /></div>
          <div><label className={lbl}>ละติจูด</label><input value={f.lat} onChange={(e) => setF({ ...f, lat: Number(e.target.value) })} type="number" step="any" className={field} /></div>
          <div><label className={lbl}>ลองจิจูด</label><input value={f.lng} onChange={(e) => setF({ ...f, lng: Number(e.target.value) })} type="number" step="any" className={field} /></div>
          <div><label className={lbl}>รัศมี (เมตร)</label><input value={f.radiusM} onChange={(e) => setF({ ...f, radiusM: Number(e.target.value) })} type="number" min={10} className={field} /></div>
          <div className="flex items-end"><button onClick={useMyLocation} className={`${btn('ghost')} h-11 w-full inline-flex items-center justify-center gap-2 px-4 text-[13px]`}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" /></svg> ตำแหน่งปัจจุบัน</button></div>
        </div>
        <div className="flex gap-2.5">
          <button onClick={save} disabled={busy || !f.name.trim()} className={`${btn('primary')} flex-1 h-[46px] px-4 text-[13px]`}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          <button onClick={onClose} className={`${btn('ghost')} h-[46px] px-[20px] text-[13px]`}>ยกเลิก</button>
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
  async function setDefault(o: Office) {
    try { await api(`/attendance/office/${o.id}/default`, { method: 'POST' }); flash(`ตั้ง ${o.name} เป็นค่าเริ่มต้นแล้ว`); load(); } catch { flash('ตั้งค่าเริ่มต้นไม่สำเร็จ'); }
  }
  async function assignDefaultToAll() {
    try { const r = await api<{ assigned: number }>('/employees/assign-default-office', { method: 'POST' }); flash(`กำหนดสถานที่เริ่มต้นให้พนักงาน ${r.assigned} คนแล้ว`); }
    catch (e) { flash(e instanceof Error ? e.message.replace(/^\d+\s*/, '').replace(/^\{.*"message":"([^"]+)".*\}$/, '$1') : 'ไม่สำเร็จ'); }
  }
  const hasDefault = offices.some((o) => o.isDefault);
  return (
    <div className="max-w-[820px]">
      <div className="flex items-center mb-3 gap-2.5">
        <div className="flex-1 text-[13px] text-ink-2 leading-[1.6]">เพิ่มได้หลายสถานที่ (สำนักงาน/สาขา/ไซต์งาน) · กด <b>"ตั้งเริ่มต้น"</b> เพื่อเลือกสถานที่ค่าเริ่มต้น (พนักงานใหม่จะได้อันนี้อัตโนมัติ) · กำหนดรายคนได้ที่หน้า "พนักงาน"</div>
        <button onClick={() => setEdit({ office: null })} className={`${btn('primary')} h-[42px] px-4 text-[13px]`}>+ เพิ่มสถานที่</button>
      </div>
      {hasDefault && (
        <div className="mb-4"><button onClick={assignDefaultToAll} className={`${btn('ghost')} h-[38px] px-4 text-[13px]`}>กำหนดพนักงานที่ยังไม่มีสถานที่ → ใช้ค่าเริ่มต้น</button></div>
      )}
      {msg && <div className="bg-brand-tint rounded-2xl border border-[#C9F0DA] px-4 py-3 mb-4 text-brand-700 font-semibold text-[13px]">{msg}</div>}
      <div className={`${card} px-5 pt-2 pb-3`}>
        <table className="w-full border-collapse">
          <thead><tr className="text-left text-ink-3 text-xs"><th className="p-2.5">สถานที่</th><th className="p-2.5">พิกัด</th><th className="p-2.5">รัศมี</th><th className="p-2.5 text-right"></th></tr></thead>
          <tbody>
            {offices.map((o) => (
              <tr key={o.id} className="border-t border-line">
                <td className="p-3 text-sm font-semibold">
                  <div className="flex items-center gap-2">{o.name}{o.isDefault && <Badge text="ค่าเริ่มต้น" c="var(--brand-700)" bg="var(--brand-tint)" />}</div>
                </td>
                <td className="p-3 text-xs text-ink-3">{Number(o.lat).toFixed(5)}, {Number(o.lng).toFixed(5)}</td>
                <td className="p-3 text-[13px]">{o.radiusM} ม.</td>
                <td className="p-3 text-right">
                  <div className="inline-flex gap-1.5">
                    {!o.isDefault && <button onClick={() => setDefault(o)} className={`${btn('ghost')} h-8 px-3 text-xs`}>ตั้งเริ่มต้น</button>}
                    <button onClick={() => setEdit({ office: o })} className={`${btn('ghost')} h-8 px-3 text-xs`}>แก้ไข</button>
                    <button onClick={() => setDel(o)} className={`${btn('danger')} h-8 px-3 text-xs`}>ลบ</button>
                  </div>
                </td>
              </tr>
            ))}
            {offices.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-ink-3">ยังไม่มีสถานที่ปฏิบัติงาน</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && <OfficeEditor initial={edit.office} onClose={() => setEdit(null)} onSaved={(m) => { flash(m); load(); }} />}
      {del && (
        <div onClick={() => setDel(null)} className="fixed inset-0 bg-[rgba(15,23,32,0.45)] flex items-center justify-center z-[70]">
          <div onClick={(e) => e.stopPropagation()} className={`${card} w-[380px] p-6`}>
            <div className="text-base font-bold text-danger mb-2.5">ลบสถานที่</div>
            <div className="text-[13px] text-ink-2 mb-[18px] leading-[1.6]">ลบ "{del.name}"? พนักงานที่ผูกกับสถานที่นี้จะกลับเป็น "เช็คอินได้ทุกที่"</div>
            <div className="flex gap-2.5">
              <button onClick={() => remove(del)} className="rounded-[10px] font-semibold cursor-pointer bg-danger text-white flex-1 h-11 px-4 text-[13px]">ลบ</button>
              <button onClick={() => setDel(null)} className={`${btn('ghost')} h-11 px-4 text-[13px]`}>ยกเลิก</button>
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
    <div className="flex h-screen overflow-hidden">
      <aside className="w-[244px] shrink-0 bg-surface border-r border-line px-[14px] py-[22px] flex flex-col">
        <div className="flex items-center gap-[11px] px-2 pb-[22px]">
          <div className="w-[38px] h-[38px] rounded-[11px] bg-brand flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
          </div>
          <div><div className="text-[15px] font-bold">TimeLine</div><div className="text-[11px] text-brand-700 font-semibold">HR Console</div></div>
        </div>
        <div className="flex flex-col gap-0.5">
          {NAV.map((n) => (
            <button key={n.key} onClick={() => setView(n.key)}
              className="flex items-center gap-2.5 w-full font-semibold text-sm py-[11px] px-[14px] rounded-[11px] cursor-pointer text-left"
              style={{ background: view === n.key ? 'var(--brand-tint)' : 'transparent', color: view === n.key ? 'var(--brand-700)' : 'var(--ink-2)' }}>
              {n.label}
            </button>
          ))}
        </div>
        <div className="mt-auto flex items-center gap-2.5 px-2 py-3 border-t border-line">
          <div className="w-[34px] h-[34px] rounded-[10px] bg-brand-tint text-brand-700 text-[13px] font-bold flex items-center justify-center">{me?.name?.[0] ?? 'H'}</div>
          <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold">{me?.name ?? 'HR'}</div><div className="text-[11px] text-ink-3">org admin</div></div>
          <button onClick={() => setShowProfile(true)} title="โปรไฟล์ของฉัน" className="border border-line bg-white text-ink-3 rounded-lg p-1.5 cursor-pointer flex">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /></svg>
          </button>
          <button onClick={logout} title="ออกจากระบบ" className="border border-line bg-white text-ink-3 rounded-lg p-1.5 cursor-pointer flex">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></svg>
          </button>
        </div>
      </aside>
      {showProfile && <MyProfile onClose={() => setShowProfile(false)} />}

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="h-[72px] shrink-0 bg-surface border-b border-line flex items-center px-7 text-[18px] font-bold">{TITLES[view]}</div>
        <div className="flex-1 overflow-y-auto py-6 px-7">
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
