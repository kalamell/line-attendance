import { useEffect, useState } from 'react';
import { initLiff, getIdToken, liff } from './lib/liff';
import { api, setToken, loginPassword } from './lib/api';

type Me = { id: string; name: string; role: string; active: boolean };
type Attendance = { status: string; checkInAt: string | null; checkOutAt: string | null } | null;
type View = 'home' | 'history' | 'leave' | 'profile' | 'payslip' | 'register' | 'editprofile';

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

/* ================= Payslip ================= */
function PayslipScreen({ back }: { back: () => void }) {
  const [pin, setPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [slip, setSlip] = useState<{ period: string; gross: string; deductions: string; net: string; items: { kind: string; label: string; amount: string }[] } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function unlock(next: string) {
    try {
      const v = await api<{ ok: boolean }>('/me/verify-pin', { method: 'POST', body: JSON.stringify({ pin: next }) });
      if (!v.ok) { setNote('PIN ไม่ถูกต้อง'); setPin(''); return; }
      setUnlocked(true);
      setSlip(await api('/me/payslip'));
    } catch { setNote('เปิดผ่านแอป LINE เพื่อดูสลิปจริง'); }
  }
  function tap(d: string) {
    if (pin.length >= 6) return;
    const np = pin + d;
    setPin(np);
    if (np.length >= 6) unlock(np);
  }
  const earnings = slip?.items.filter((i) => i.kind === 'earning') ?? [];
  const deductions = slip?.items.filter((i) => i.kind === 'deduction') ?? [];

  if (!unlocked) {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', padding: '16px 28px 28px' }}>
        <button onClick={back} style={{ alignSelf: 'flex-start', border: 'none', background: 'none', color: 'var(--ink-2)', fontSize: 14, cursor: 'pointer' }}>‹ กลับ</button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 22, background: 'var(--brand-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 6 }}>สลิปเงินเดือนถูกป้องกัน</div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', textAlign: 'center' }}>กรอกรหัส PIN ส่วนตัว 6 หลักที่คุณตั้งไว้</div>
          <div style={{ display: 'flex', gap: 14, margin: '30px 0 10px' }}>
            {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} style={{ width: 15, height: 15, borderRadius: '50%', background: i < pin.length ? 'var(--brand)' : 'transparent', border: `2px solid ${i < pin.length ? 'var(--brand)' : '#C4C9CE'}` }} />)}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map((k, i) => k === '' ? <span key={i} /> : (
            <button key={i} onClick={() => (k === 'back' ? setPin(pin.slice(0, -1)) : tap(k))}
              style={{ height: 56, borderRadius: 14, border: 'none', background: k === 'back' ? 'transparent' : 'var(--bg)', fontSize: 22, fontWeight: 600, cursor: 'pointer' }}>
              {k === 'back' ? '⌫' : k}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ background: 'linear-gradient(160deg,#06C755,#04A548)', color: '#fff', padding: '18px 20px 40px' }}>
        <button onClick={back} style={{ border: 'none', background: 'none', color: '#fff', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 8 }}>‹ กลับ</button>
        <div style={{ fontSize: 17, fontWeight: 700 }}>สลิปเงินเดือน</div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>งวดประจำเดือน {slip?.period ?? '—'}</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 20px', marginTop: -28 }}>
        <div style={{ background: 'var(--surface)', borderRadius: 18, padding: 20, boxShadow: '0 8px 24px rgba(17,24,39,0.06)' }}>
          {note && <div style={{ fontSize: 13, color: 'var(--ink-2)', textAlign: 'center', padding: 12 }}>{note}</div>}
          {slip && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-700)', marginBottom: 10 }}>รายได้</div>
              {earnings.map((e, i) => <Row key={i} l={e.label} v={e.amount} />)}
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)', margin: '14px 0 10px' }}>รายการหัก</div>
              {deductions.map((e, i) => <Row key={i} l={e.label} v={`-${e.amount}`} />)}
              <div style={{ background: 'var(--brand-tint)', borderRadius: 14, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-700)' }}>เงินได้สุทธิ</span>
                <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--brand-700)' }}>฿{slip.net}</span>
              </div>
            </>
          )}
        </div>
        {slip && (sent ? (
          <div style={{ marginTop: 16, background: 'var(--brand-tint)', border: '1px solid #C9F0DA', borderRadius: 14, padding: 16, textAlign: 'center', color: 'var(--brand-700)', fontWeight: 700, fontSize: 14 }}>ส่งสลิป PDF เข้ารหัสทาง LINE แล้ว</div>
        ) : (
          <button onClick={() => setSent(true)} style={{ width: '100%', height: 52, marginTop: 16, border: 'none', borderRadius: 14, background: 'var(--brand)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: '0 8px 20px rgba(6,199,85,0.30)' }}>ส่งเป็น PDF (เข้ารหัส) ทาง LINE</button>
        ))}
      </div>
    </div>
  );
}
function Row({ l, v }: { l: string; v: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '5px 0' }}><span style={{ color: 'var(--ink-2)' }}>{l}</span><span style={{ fontWeight: 500 }}>{v}</span></div>;
}

/* ================= Register (PDPA) ================= */
function RegisterScreen({ back }: { back: () => void }) {
  const [step, setStep] = useState(1);
  const [consent, setConsent] = useState(false);
  async function next() {
    if (step === 1 && !consent) return;
    if (step === 2) { try { await api('/me/consent', { method: 'POST' }); } catch { /* preview */ } }
    setStep(step + 1);
  }
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
      <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid var(--line)' }}>
        <button onClick={back} style={{ border: 'none', background: 'none', color: 'var(--ink-2)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 12 }}>‹ กลับ</button>
        <div style={{ fontSize: 18, fontWeight: 700 }}>ลงทะเบียนพนักงานใหม่</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          {[1, 2, 3].map((s) => <div key={s} style={{ flex: 1, height: 5, borderRadius: 999, background: step >= s ? 'var(--brand)' : 'var(--line)' }} />)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>ขั้นที่ {step} จาก 3 · {step === 1 ? 'ความยินยอม PDPA' : step === 2 ? 'ข้อมูลส่วนตัว' : 'เสร็จสิ้น'}</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {step === 1 && (
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>ความยินยอมข้อมูลส่วนบุคคล</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 16 }}>ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) บริษัทขอความยินยอมในการเก็บและใช้ข้อมูลของท่าน</div>
            {[['ข้อมูลที่จัดเก็บ (PII)', 'ชื่อ-นามสกุล, เลขบัตรประชาชน, ที่อยู่, บัญชีธนาคาร, ข้อมูลการเข้างาน'], ['วัตถุประสงค์ & สิทธิ', 'ใช้เพื่อการจ้างงาน/จ่ายเงินเดือน · เข้าถึงเฉพาะฝ่ายบุคคล เก็บแบบเข้ารหัส · ขอเข้าถึง/แก้ไข/ลบได้ทุกเมื่อ']].map((b, i) => (
              <div key={i} style={{ background: 'var(--bg)', borderRadius: 14, padding: 16, marginBottom: 12 }}><div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{b[0]}</div><div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>{b[1]}</div></div>
            ))}
            <button onClick={() => setConsent(!consent)} style={{ width: '100%', marginTop: 6, border: `1.5px solid ${consent ? 'var(--brand)' : 'var(--line)'}`, background: consent ? 'var(--brand-tint)' : '#fff', borderRadius: 14, padding: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
              <span style={{ width: 24, height: 24, borderRadius: 7, border: `2px solid ${consent ? 'var(--brand)' : '#C4C9CE'}`, background: consent ? 'var(--brand)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{consent && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}</span>
              <span style={{ fontSize: 13, lineHeight: 1.5 }}>ข้าพเจ้าได้อ่านและ<b>ยินยอม</b>ให้เก็บและใช้ข้อมูลส่วนบุคคลตามวัตถุประสงค์ข้างต้น</span>
            </button>
          </div>
        )}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>กรอกข้อมูลลงทะเบียน</div>
            <div style={{ fontSize: 12, color: 'var(--brand-700)', marginBottom: 18 }}>🔒 ข้อมูล PII เข้ารหัส เข้าถึงเฉพาะฝ่ายบุคคล</div>
            {[['ชื่อ-นามสกุล', 'สมหญิง รักงาน'], ['เลขบัตรประชาชน', '1-2345-xxxxx-xx-3'], ['เบอร์โทร', '08x-xxx-xx78'], ['แผนกที่สมัคร', 'ฝ่ายขาย']].map((r, i) => (
              <div key={i} style={{ marginBottom: 14 }}><div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 6 }}>{r[0]}</div><div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', fontSize: 14, fontWeight: 500 }}>{r[1]}</div></div>
            ))}
          </div>
        )}
        {step === 3 && (
          <div style={{ textAlign: 'center', paddingTop: 30 }}>
            <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--brand-tint)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6v6l4 2" /><circle cx="12" cy="12" r="9" /></svg>
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>ส่งข้อมูลเรียบร้อย</div>
            <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>คำขอลงทะเบียนถูกส่งให้<b>ฝ่ายบุคคล</b>พิจารณาอนุมัติการเริ่มงาน<br />ท่านจะได้รับแจ้งผลผ่าน LINE</div>
          </div>
        )}
      </div>
      {step !== 3 && (
        <div style={{ padding: '14px 20px 22px', borderTop: '1px solid var(--line)' }}>
          <button onClick={next} disabled={step === 1 && !consent}
            style={{ width: '100%', height: 52, border: 'none', borderRadius: 14, background: step === 1 && !consent ? '#EEF0F3' : 'var(--brand)', color: step === 1 && !consent ? 'var(--ink-3)' : '#fff', fontSize: 16, fontWeight: 600, cursor: step === 1 && !consent ? 'default' : 'pointer' }}>
            {step === 1 ? 'ยอมรับและดำเนินการต่อ' : 'ส่งลงทะเบียน'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ================= Edit profile ================= */
type ProfileForm = { name: string; email: string; phone: string; address: string; emergencyContactName: string; emergencyPhone: string; department: string; position: string };
function EditProfileScreen({ back }: { back: () => void }) {
  const [f, setF] = useState<ProfileForm | null>(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 2800); };
  useEffect(() => {
    api<ProfileForm>('/me/profile')
      .then((p) => setF({ name: p.name ?? '', email: p.email ?? '', phone: p.phone ?? '', address: p.address ?? '', emergencyContactName: p.emergencyContactName ?? '', emergencyPhone: p.emergencyPhone ?? '', department: p.department ?? '', position: p.position ?? '' }))
      .catch(() => flash('เปิดผ่านแอป LINE เพื่อแก้ไขโปรไฟล์', false));
  }, []);
  async function save() {
    if (!f) return;
    try { await api('/me/profile', { method: 'PATCH', body: JSON.stringify({ name: f.name, email: f.email, phone: f.phone, address: f.address, emergencyContactName: f.emergencyContactName, emergencyPhone: f.emergencyPhone }) }); flash('บันทึกข้อมูลแล้ว'); }
    catch { flash('บันทึกไม่สำเร็จ', false); }
  }
  async function changePw() {
    if (!pw.next) return;
    try { await api('/me/password', { method: 'PATCH', body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }) }); setPw({ current: '', next: '' }); flash('เปลี่ยนรหัสผ่านแล้ว'); }
    catch { flash('รหัสผ่านเดิมไม่ถูกต้อง (ใหม่ ≥6 ตัว)', false); }
  }
  async function savePin() {
    if (pin.length < 4) { flash('PIN ต้อง ≥4 หลัก', false); return; }
    try { await api('/me/pin', { method: 'PATCH', body: JSON.stringify({ pin }) }); setPin(''); flash('ตั้ง PIN สลิปแล้ว'); }
    catch { flash('ตั้ง PIN ไม่สำเร็จ', false); }
  }
  const field: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', fontSize: 14, width: '100%' };
  const ro: React.CSSProperties = { ...field, background: 'var(--bg)', color: 'var(--ink-3)' };
  const lbl: React.CSSProperties = { fontSize: 12, color: 'var(--ink-2)', margin: '0 0 6px' };
  const sect: React.CSSProperties = { fontSize: 13, fontWeight: 700, margin: '22px 0 12px' };
  const primary: React.CSSProperties = { width: '100%', height: 50, border: 'none', borderRadius: 14, background: 'var(--brand)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' };
  const ghost: React.CSSProperties = { width: '100%', height: 48, border: '1px solid var(--brand)', borderRadius: 14, background: '#fff', color: 'var(--brand-700)', fontSize: 15, fontWeight: 600, cursor: 'pointer' };
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--line)' }}>
        <button onClick={back} style={{ border: 'none', background: 'none', color: 'var(--ink-2)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 12 }}>‹ กลับ</button>
        <div style={{ fontSize: 18, fontWeight: 700 }}>แก้ไขข้อมูลส่วนตัว</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {msg && <div style={{ background: msg.ok ? 'var(--brand-tint)' : 'var(--danger-tint)', color: msg.ok ? 'var(--brand-700)' : 'var(--danger)', borderRadius: 12, padding: 12, fontWeight: 600, fontSize: 13, marginBottom: 14 }}>{msg.t}</div>}
        {f && (
          <>
            <div style={{ marginBottom: 14 }}><div style={lbl}>ชื่อ-นามสกุล</div><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={field} /></div>
            <div style={{ marginBottom: 14 }}><div style={lbl}>อีเมล</div><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} type="email" style={field} /></div>
            <div style={{ marginBottom: 14 }}><div style={lbl}>เบอร์โทร</div><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="08x-xxx-xxxx" style={field} /></div>
            <div style={{ marginBottom: 14 }}><div style={lbl}>ที่อยู่</div><input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} style={field} /></div>
            <div style={{ marginBottom: 14 }}><div style={lbl}>ผู้ติดต่อฉุกเฉิน</div><input value={f.emergencyContactName} onChange={(e) => setF({ ...f, emergencyContactName: e.target.value })} placeholder="ชื่อผู้ติดต่อ" style={field} /></div>
            <div style={{ marginBottom: 16 }}><div style={lbl}>เบอร์ผู้ติดต่อฉุกเฉิน</div><input value={f.emergencyPhone} onChange={(e) => setF({ ...f, emergencyPhone: e.target.value })} placeholder="08x-xxx-xxxx" style={field} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><div style={lbl}>แผนก (HR คุม)</div><div style={ro}>{f.department || '—'}</div></div>
              <div><div style={lbl}>ตำแหน่ง (HR คุม)</div><div style={ro}>{f.position || '—'}</div></div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 16, display: 'flex', gap: 6, alignItems: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              ข้อมูลติดต่อถูกเก็บแบบเข้ารหัส · แก้ไขได้เฉพาะของคุณเอง (PDPA)
            </div>
            <button onClick={save} style={primary}>บันทึกข้อมูล</button>

            <div style={sect}>เปลี่ยนรหัสผ่าน</div>
            <div style={{ marginBottom: 12 }}><div style={lbl}>รหัสผ่านเดิม</div><input value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} type="password" style={field} /></div>
            <div style={{ marginBottom: 14 }}><div style={lbl}>รหัสผ่านใหม่ (≥6 ตัว)</div><input value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} type="password" style={field} /></div>
            <button onClick={changePw} style={ghost}>เปลี่ยนรหัสผ่าน</button>

            <div style={sect}>PIN เปิดสลิปเงินเดือน</div>
            <div style={{ marginBottom: 14 }}><div style={lbl}>ตั้ง/เปลี่ยน PIN (≥4 หลัก)</div><input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={6} type="password" style={field} /></div>
            <button onClick={savePin} style={{ ...ghost, marginBottom: 8 }}>ตั้ง PIN สลิป</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ================= Employee login (no LINE) ================= */
function EmployeeLogin({ onDone }: { onDone: (u: Me) => void }) {
  const [email, setEmail] = useState('somchai@ahaanden.co.th');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const u = await loginPassword(email, password); onDone(u as Me); }
    catch { setErr('อีเมลหรือรหัสผ่านไม่ถูกต้อง'); } finally { setBusy(false); }
  }
  const field: React.CSSProperties = { width: '100%', height: 46, border: '1px solid var(--line)', borderRadius: 12, padding: '0 14px', margin: '6px 0 16px', fontSize: 15 };
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onSubmit={submit} style={{ width: '100%', background: 'var(--surface)', padding: 28, borderRadius: 20, boxShadow: '0 12px 40px rgba(17,24,39,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
          </div>
          <div><div style={{ fontSize: 18, fontWeight: 700 }}>TimeLine</div><div style={{ fontSize: 12, color: 'var(--brand-700)', fontWeight: 600 }}>ลงเวลาเข้างาน</div></div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 18 }}>เข้าสู่ระบบพนักงาน (หรือเปิดผ่านแอป LINE)</div>
        <label style={{ fontSize: 12, color: 'var(--ink-2)' }}>อีเมล</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required style={field} />
        <label style={{ fontSize: 12, color: 'var(--ink-2)' }}>รหัสผ่าน</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required style={field} />
        {err && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{err}</div>}
        <button type="submit" disabled={busy} style={{ width: '100%', height: 48, border: 'none', borderRadius: 12, background: 'var(--brand)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: '0 8px 20px rgba(6,199,85,0.30)' }}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
      </form>
    </div>
  );
}

/* ================= App ================= */
export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [authed, setAuthed] = useState(false);
  const [today, setToday] = useState<Attendance>(null);
  const [clock, setClock] = useState('--:--:--');
  const [view, setView] = useState<View>('home');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => { const t = setInterval(() => setClock(new Date().toLocaleTimeString('th-TH')), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    (async () => {
      await initLiff();
      const idToken = getIdToken();
      if (!idToken) return; // not in LINE — fall back to employee login form
      try {
        const r = await api<{ token: string; user: Me }>('/auth/line/login', { method: 'POST', body: JSON.stringify({ idToken }) });
        setToken(r.token); setMe(r.user); setAuthed(true); setToday(await api<Attendance>('/attendance/today'));
      } catch (e) { setNote(String(e)); }
    })();
  }, []);

  if (!authed) return <EmployeeLogin onDone={(u) => { setMe(u); setAuthed(true); api<Attendance>('/attendance/today').then(setToday).catch(() => {}); }} />;

  async function punch() {
    if (!getIdToken()) { setNote('เปิดผ่านแอป LINE เพื่อเช็คอิน'); return; }
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true }));
      const checkedIn = !!today?.checkInAt && !today?.checkOutAt;
      const path = checkedIn ? '/attendance/check-out' : '/attendance/check-in';
      setToday(await api<NonNullable<Attendance>>(path, { method: 'POST', body: checkedIn ? undefined : JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }) }));
    } catch (e) { setNote(String(e)); }
  }

  if (view === 'payslip') return <div style={{ maxWidth: 420, margin: '0 auto', background: 'var(--bg)' }}><PayslipScreen back={() => setView('profile')} /></div>;
  if (view === 'register') return <div style={{ maxWidth: 420, margin: '0 auto' }}><RegisterScreen back={() => setView('profile')} /></div>;
  if (view === 'editprofile') return <div style={{ maxWidth: 420, margin: '0 auto' }}><EditProfileScreen back={() => setView('profile')} /></div>;

  const checkedIn = !!today?.checkInAt && !today?.checkOutAt;
  const done = !!today?.checkOutAt;
  const hr = new Date().getHours();
  const greeting = hr < 12 ? 'สวัสดีตอนเช้า' : hr < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {view === 'home' && (
          <>
            <div style={{ background: 'linear-gradient(160deg,#06C755,#04A548)', color: '#fff', padding: '24px 20px 52px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{me?.name?.[0] ?? 'พ'}</div>
                <div><div style={{ fontSize: 13, opacity: 0.9 }}>{greeting} 👋</div><div style={{ fontSize: 17, fontWeight: 600 }}>{me?.name ?? 'พนักงาน'}</div></div>
              </div>
            </div>
            <div style={{ padding: '0 16px 20px', marginTop: -36 }}>
              <div style={{ background: 'var(--surface)', borderRadius: 20, padding: '24px 20px', boxShadow: '0 8px 24px rgba(17,24,39,0.06)', textAlign: 'center' }}>
                <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: -1, fontVariantNumeric: 'tabular-nums' }}>{clock}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 22, color: done ? 'var(--ink-2)' : checkedIn ? 'var(--brand-700)' : 'var(--ink-3)' }}>{done ? 'ทำงานครบวันแล้ว' : checkedIn ? `เข้างานแล้ว · ${today?.checkInAt ? fmtTime(today.checkInAt) : ''} น.` : 'ยังไม่ได้เช็คอินวันนี้'}</div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button onClick={punch} disabled={done} style={{ width: 168, height: 168, borderRadius: '50%', border: 'none', fontSize: 17, fontWeight: 700, cursor: done ? 'default' : 'pointer', background: done ? '#EEF0F3' : checkedIn ? 'radial-gradient(circle at 50% 35%,#FFB43D,#F59E0B)' : 'radial-gradient(circle at 50% 35%,#12D866,#06C755)', color: done ? 'var(--ink-3)' : '#fff', boxShadow: done ? 'none' : '0 14px 34px rgba(6,199,85,0.42)' }}>{done ? 'เสร็จสิ้นวันนี้' : checkedIn ? 'เช็คเอาท์ออกงาน' : 'เช็คอินเข้างาน'}</button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--brand-tint)', border: '1px solid #C9F0DA', borderRadius: 14, padding: '12px 14px', marginTop: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" /></svg></div>
                <div><div style={{ fontSize: 13, fontWeight: 600 }}>สำนักงานใหญ่ อโศก</div><div style={{ fontSize: 11, color: 'var(--brand-700)', fontWeight: 500 }}>✓ อยู่ในพื้นที่ทำงาน</div></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 16 }}><div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>ชั่วโมงสัปดาห์นี้</div><div style={{ fontSize: 24, fontWeight: 700 }}>32.5<span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 500 }}> / 40</span></div></div>
                <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 16 }}><div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>มาสายเดือนนี้</div><div style={{ fontSize: 24, fontWeight: 700 }}>2<span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 500 }}> ครั้ง</span></div></div>
              </div>
            </div>
          </>
        )}

        {view === 'history' && (
          <div style={{ padding: 16 }}>
            <h2 style={{ fontSize: 20, margin: '6px 4px 16px' }}>ประวัติการเข้างาน</h2>
            {[['09', 'พ.', '08:32 → 17:45', 'ปกติ'], ['08', 'อ.', '09:12 → 18:02', 'สาย'], ['07', 'จ.', '08:05 → 17:30', 'ปกติ']].map((r, i) => (
              <div key={i} style={{ background: 'var(--surface)', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 16, fontWeight: 700 }}>{r[0]}</span><span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{r[1]}</span></div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{r[2]}</div><span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)' }}>{r[3]}</span>
              </div>
            ))}
          </div>
        )}

        {view === 'leave' && (
          <div style={{ padding: 16 }}>
            <h2 style={{ fontSize: 20, margin: '6px 4px 16px' }}>ลางาน</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {[['28', 'ลาป่วย', 'var(--danger)', '#FDECEC'], ['3', 'ลากิจ', 'var(--info)', '#EAF1FE'], ['6', 'พักร้อน', 'var(--brand-700)', 'var(--brand-tint)']].map((c, i) => (
                <div key={i} style={{ background: c[3], borderRadius: 16, padding: '14px 8px', textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: c[2] }}>{c[0]}</div><div style={{ fontSize: 11, color: c[2], fontWeight: 500 }}>{c[1]}</div></div>
              ))}
            </div>
          </div>
        )}

        {view === 'profile' && (
          <div>
            <div style={{ background: 'linear-gradient(160deg,#06C755,#04A548)', color: '#fff', padding: '28px 20px 56px', textAlign: 'center' }}>
              <div style={{ width: 84, height: 84, borderRadius: 26, background: 'rgba(255,255,255,0.22)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, marginBottom: 12 }}>{me?.name?.[0] ?? 'พ'}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{me?.name ?? 'พนักงาน'}</div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>{me?.role ?? 'employee'}</div>
            </div>
            <div style={{ padding: '0 16px', marginTop: -42 }}>
              <div style={{ background: 'var(--surface)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 8px 24px rgba(17,24,39,0.06)' }}>
                <button onClick={() => setView('editprofile')} style={rowBtn}><span>👤 แก้ไขข้อมูลส่วนตัว</span><span style={{ color: 'var(--ink-3)' }}>›</span></button>
                <div style={{ height: 1, background: 'var(--line)' }} />
                <button onClick={() => setView('payslip')} style={rowBtn}><span>💰 สลิปเงินเดือน</span><span style={{ color: 'var(--ink-3)' }}>›</span></button>
                <div style={{ height: 1, background: 'var(--line)' }} />
                <button onClick={() => setView('register')} style={rowBtn}><span>📝 ลงทะเบียน / ความยินยอม PDPA</span><span style={{ color: 'var(--ink-3)' }}>›</span></button>
              </div>
              <button onClick={() => { try { liff.logout(); } catch { /* not in LINE */ } location.reload(); }} style={{ width: '100%', height: 50, marginTop: 16, border: '1px solid #FADBDB', borderRadius: 14, background: '#fff', color: 'var(--danger)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>ออกจากระบบ</button>
            </div>
          </div>
        )}
      </div>

      {note && <div style={{ position: 'fixed', bottom: 76, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: 'var(--danger)' }}>{note}</div>}

      <nav style={{ background: 'var(--surface)', borderTop: '1px solid var(--line)', padding: '6px 8px 10px', display: 'flex' }}>
        {([['home', 'หน้าหลัก', 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'], ['history', 'ประวัติ', 'M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8'], ['leave', 'ลางาน', 'M8 2v4M16 2v4M3 10h18'], ['profile', 'โปรไฟล์', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z']] as const).map(([k, label, d]) => (
          <button key={k} onClick={() => setView(k as View)} style={{ flex: 1, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 4px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={view === k ? 'var(--brand)' : 'var(--ink-3)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
            <span style={{ fontSize: 10, fontWeight: 600, color: view === k ? 'var(--brand)' : 'var(--ink-3)' }}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
const rowBtn: React.CSSProperties = { width: '100%', border: 'none', background: 'none', padding: '16px', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit', color: 'var(--ink)' };
