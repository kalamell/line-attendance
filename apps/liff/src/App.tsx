import { useEffect, useState } from 'react';
import { initLiff, getIdToken, getProfile, isInClient, liff } from './lib/liff';
import { api, setToken, loginPassword, errorMessage } from './lib/api';
import { makeT, LOCALES, type Locale } from './i18n';

type Me = { id: string; name: string; role: string; active: boolean };
type Attendance = { status: string; checkInAt: string | null; checkOutAt: string | null } | null;
type AttRow = { id: string; workDate: string; status: string; checkInAt: string | null; checkOutAt: string | null };
type LeaveRow = { id: string; type: 'sick' | 'personal' | 'vacation'; startDate: string; endDate: string; days: string; status: string; reason: string | null };
type Summary = { weekHours: number; lateThisMonth: number };
type View = 'home' | 'history' | 'leave' | 'profile' | 'payslip' | 'register' | 'editprofile';

// module-level translator; App sets it from the current locale on every render
// (React renders top-down, so children see the updated value).
let _t = makeT('th');
const tr = (k: string): string => _t(k);
const LEAVE_LABEL: Record<string, string> = { sick: 'lv_sick', personal: 'lv_personal', vacation: 'lv_vacation' };
const leaveLabel = (t: string) => tr(LEAVE_LABEL[t] ?? t);
const statusLabel = (s: string) => tr('st_' + s) || s;
function readLocale(): Locale | null { try { const v = localStorage.getItem('locale'); return (['th','en','my','lo'].includes(v as string) ? v : null) as Locale | null; } catch { return null; } }
function storeLocale(l: Locale) { try { localStorage.setItem('locale', l); } catch { /* ignore */ } }

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

/** Material Symbols (icon font) — replaces emoji for a professional look. */
function Icon({ n, size = 20, color, style }: { n: string; size?: number; color?: string; style?: React.CSSProperties }) {
  return <span className="msr" style={{ fontSize: size, color, ...style }}>{n}</span>;
}

/* ================= Payslip ================= */
function PayslipScreen({ back }: { back: () => void }) {
  const [mode, setMode] = useState<'loading' | 'setpin' | 'enterpin' | 'unlocked'>('loading');
  const [setStep, setSetStep] = useState<'new' | 'confirm'>('new');
  const [firstPin, setFirstPin] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [slip, setSlip] = useState<{ period: string; gross: string; deductions: string; net: string; items: { kind: string; label: string; amount: string }[] } | null>(null);
  const [sent, setSent] = useState(false);

  // decide upfront: no PIN yet -> ask to SET one; otherwise ask to enter it
  useEffect(() => {
    api<{ hasPin: boolean }>('/me/profile').then((p) => setMode(p.hasPin ? 'enterpin' : 'setpin')).catch(() => setMode('enterpin'));
  }, []);

  type Slip = { period: string; gross: string; deductions: string; net: string; items: { kind: string; label: string; amount: string }[] };
  async function openSlip() { setSlip(await api<Slip>('/me/payslip').catch(() => null)); setMode('unlocked'); }

  async function complete(code: string) {
    if (mode === 'enterpin') {
      try {
        const v = await api<{ ok: boolean }>('/me/verify-pin', { method: 'POST', body: JSON.stringify({ pin: code }) });
        if (!v.ok) { setErr(tr('pin_wrong')); setPin(''); return; }
        await openSlip();
      } catch { setErr(tr('open_in_line')); setPin(''); }
    } else if (mode === 'setpin') {
      if (setStep === 'new') { setFirstPin(code); setPin(''); setSetStep('confirm'); setErr(null); }
      else {
        if (code !== firstPin) { setErr(tr('pin_mismatch')); setPin(''); setFirstPin(''); setSetStep('new'); return; }
        try { await api('/me/pin', { method: 'PATCH', body: JSON.stringify({ pin: code }) }); await openSlip(); }
        catch { setErr(tr('pin_set_fail')); setPin(''); }
      }
    }
  }
  function tap(d: string) { if (pin.length >= 6) return; const np = pin + d; setErr(null); setPin(np); if (np.length >= 6) complete(np); }
  const earnings = slip?.items.filter((i) => i.kind === 'earning') ?? [];
  const deductions = slip?.items.filter((i) => i.kind === 'deduction') ?? [];

  if (mode !== 'unlocked') {
    const title = mode === 'loading' ? tr('loading') : mode === 'setpin' ? (setStep === 'new' ? tr('pay_set_title') : tr('pay_confirm_title')) : tr('pay_locked_title');
    const sub = mode === 'setpin'
      ? (setStep === 'new' ? tr('pay_set_sub') : tr('pay_confirm_sub'))
      : mode === 'enterpin' ? tr('pay_enter_sub') : '';
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', padding: '16px 28px 28px' }}>
        <button onClick={back} style={{ alignSelf: 'flex-start', border: 'none', background: 'none', color: 'var(--ink-2)', fontSize: 14, cursor: 'pointer' }}>‹ {tr('back')}</button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 22, background: 'var(--brand-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Icon n={mode === 'setpin' ? 'lock_reset' : 'lock'} size={34} color="var(--brand)" />
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>{title}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', textAlign: 'center', maxWidth: 260 }}>{sub}</div>
          {mode !== 'loading' && (
            <div style={{ display: 'flex', gap: 14, margin: '28px 0 8px' }}>
              {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} style={{ width: 15, height: 15, borderRadius: '50%', background: i < pin.length ? 'var(--brand)' : 'transparent', border: `2px solid ${i < pin.length ? 'var(--brand)' : '#C4C9CE'}` }} />)}
            </div>
          )}
          {err && <div style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 600, marginTop: 8, textAlign: 'center' }}>{err}</div>}
        </div>
        {mode !== 'loading' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map((k, i) => k === '' ? <span key={i} /> : (
              <button key={i} onClick={() => (k === 'back' ? (setPin(pin.slice(0, -1)), setErr(null)) : tap(k))}
                style={{ height: 56, borderRadius: 14, border: 'none', background: k === 'back' ? 'transparent' : 'var(--bg)', fontSize: 22, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {k === 'back' ? <Icon n="backspace" size={22} color="var(--ink-2)" /> : k}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ background: 'linear-gradient(160deg,#06C755,#04A548)', color: '#fff', padding: '18px 20px 40px' }}>
        <button onClick={back} style={{ border: 'none', background: 'none', color: '#fff', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 8 }}>‹ {tr('back')}</button>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{tr('pf_payslip')}</div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>{tr('pay_period')} {slip?.period ?? '—'}</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 20px', marginTop: -28 }}>
        <div style={{ background: 'var(--surface)', borderRadius: 18, padding: 20, boxShadow: '0 8px 24px rgba(17,24,39,0.06)' }}>
          {!slip && <div style={{ fontSize: 13, color: 'var(--ink-2)', textAlign: 'center', padding: 12 }}>{tr('pay_no_slip')}</div>}
          {slip && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-700)', marginBottom: 10 }}>{tr('pay_income')}</div>
              {earnings.map((e, i) => <Row key={i} l={e.label} v={e.amount} />)}
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)', margin: '14px 0 10px' }}>{tr('pay_deduction')}</div>
              {deductions.map((e, i) => <Row key={i} l={e.label} v={`-${e.amount}`} />)}
              <div style={{ background: 'var(--brand-tint)', borderRadius: 14, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-700)' }}>{tr('pay_net')}</span>
                <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--brand-700)' }}>฿{slip.net}</span>
              </div>
            </>
          )}
        </div>
        {slip && (sent ? (
          <div style={{ marginTop: 16, background: 'var(--brand-tint)', border: '1px solid #C9F0DA', borderRadius: 14, padding: 16, textAlign: 'center', color: 'var(--brand-700)', fontWeight: 700, fontSize: 14 }}>{tr('pay_sent')}</div>
        ) : (
          <button onClick={() => setSent(true)} style={{ width: '100%', height: 52, marginTop: 16, border: 'none', borderRadius: 14, background: 'var(--brand)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: '0 8px 20px rgba(6,199,85,0.30)' }}>{tr('pay_send_pdf')}</button>
        ))}
      </div>
    </div>
  );
}
function Row({ l, v }: { l: string; v: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '5px 0' }}><span style={{ color: 'var(--ink-2)' }}>{l}</span><span style={{ fontWeight: 500 }}>{v}</span></div>;
}

/* ================= PDPA consent (data comes from HR; employee only consents) ================= */
function RegisterScreen({ back, gate, onConsented }: { back: () => void; gate?: boolean; onConsented?: () => void }) {
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    if (!consent) return;
    setBusy(true); setErr(null);
    try { await api('/me/consent', { method: 'POST' }); if (onConsented) onConsented(); else setDone(true); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--line)' }}>
        {gate
          ? <div style={{ fontSize: 12, color: 'var(--brand-700)', fontWeight: 600, marginBottom: 8 }}>ต้องยินยอมก่อนเริ่มใช้งาน</div>
          : <button onClick={back} style={{ border: 'none', background: 'none', color: 'var(--ink-2)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 12 }}>‹ กลับ</button>}
        <div style={{ fontSize: 18, fontWeight: 700 }}>ความยินยอมข้อมูลส่วนบุคคล (PDPA)</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {done ? (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--brand-tint)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>บันทึกความยินยอมแล้ว</div>
            <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>ขอบคุณครับ ระบบบันทึกความยินยอม PDPA ของท่านเรียบร้อย</div>
            <button onClick={back} style={{ marginTop: 24, height: 48, padding: '0 28px', border: '1px solid var(--line)', borderRadius: 14, background: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>กลับ</button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 16 }}>ข้อมูลพนักงานถูกจัดทำโดยฝ่ายบุคคล ท่านเพียงให้ความยินยอมการเก็บและใช้ข้อมูลตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)</div>
            {[['ข้อมูลที่จัดเก็บ (PII)', 'ชื่อ-นามสกุล, เลขบัตรประชาชน, ที่อยู่, บัญชีธนาคาร, ข้อมูลการเข้างาน'], ['วัตถุประสงค์ & สิทธิ', 'ใช้เพื่อการจ้างงาน/จ่ายเงินเดือน · เข้าถึงเฉพาะฝ่ายบุคคล เก็บแบบเข้ารหัส · ขอเข้าถึง/แก้ไข/ลบได้ทุกเมื่อ']].map((b, i) => (
              <div key={i} style={{ background: 'var(--bg)', borderRadius: 14, padding: 16, marginBottom: 12 }}><div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{b[0]}</div><div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>{b[1]}</div></div>
            ))}
            {err && <div style={{ background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 10, padding: '9px 13px', fontSize: 13, marginTop: 8 }}>{err}</div>}
            <button onClick={() => setConsent(!consent)} style={{ width: '100%', marginTop: 6, border: `1.5px solid ${consent ? 'var(--brand)' : 'var(--line)'}`, background: consent ? 'var(--brand-tint)' : '#fff', borderRadius: 14, padding: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
              <span style={{ width: 24, height: 24, borderRadius: 7, border: `2px solid ${consent ? 'var(--brand)' : '#C4C9CE'}`, background: consent ? 'var(--brand)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{consent && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}</span>
              <span style={{ fontSize: 13, lineHeight: 1.5 }}>ข้าพเจ้าได้อ่านและ<b>ยินยอม</b>ให้เก็บและใช้ข้อมูลส่วนบุคคลตามวัตถุประสงค์ข้างต้น</span>
            </button>
          </div>
        )}
      </div>
      {!done && (
        <div style={{ padding: '14px 20px 22px', borderTop: '1px solid var(--line)' }}>
          <button onClick={submit} disabled={!consent || busy}
            style={{ width: '100%', height: 52, border: 'none', borderRadius: 14, background: consent && !busy ? 'var(--brand)' : '#EEF0F3', color: consent && !busy ? '#fff' : 'var(--ink-3)', fontSize: 16, fontWeight: 600, cursor: consent && !busy ? 'pointer' : 'default' }}>
            {busy ? 'กำลังบันทึก…' : 'บันทึกความยินยอม'}
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

/* ================= Onboarding / splash ================= */
function SplashScreen() {
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--ink-3)', fontSize: 14 }}>
      {tr('loading')}
    </div>
  );
}

/* ================= Language picker ================= */
function LanguagePicker({ onPick }: { onPick: (l: Locale) => void }) {
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ background: 'linear-gradient(160deg,#06C755,#04A548)', color: '#fff', padding: '72px 28px 48px', textAlign: 'center' }}>
        <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><Icon n="translate" size={44} color="#fff" /></div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>เลือกภาษา · Language</div>
        <div style={{ fontSize: 13, opacity: 0.92, marginTop: 6 }}>ภาษา / Language / ဘာသာ / ພາສາ</div>
      </div>
      <div style={{ flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {LOCALES.map((l) => (
          <button key={l.code} onClick={() => onPick(l.code)} style={{ width: '100%', height: 64, border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', cursor: 'pointer' }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{l.native}</span>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function OnboardingScreen({ state }: { state: 'pending' | 'confirmed' | 'inactive' }) {
  const cfg = {
    pending: { icon: 'waving_hand', title: tr('onb_pending_title'), body: tr('onb_pending_body'), steps: [tr('onb_pending_s1'), tr('onb_pending_s2'), tr('onb_pending_s3')], active: 0 },
    confirmed: { icon: 'task_alt', title: tr('onb_confirmed_title'), body: tr('onb_confirmed_body'), steps: [tr('onb_pending_s1'), tr('onb_pending_s2'), tr('onb_pending_s3')], active: 2 },
    inactive: { icon: 'hourglass_top', title: tr('onb_inactive_title'), body: tr('onb_inactive_body'), steps: [], active: -1 },
  }[state];
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ background: 'linear-gradient(160deg,#06C755,#04A548)', color: '#fff', padding: '64px 28px 48px', textAlign: 'center' }}>
        <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><Icon n={cfg.icon} size={46} color="#fff" /></div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{cfg.title}</div>
      </div>
      <div style={{ flex: 1, padding: '24px 20px' }}>
        <div style={{ background: 'var(--surface)', borderRadius: 18, padding: 20, marginTop: -36, boxShadow: '0 8px 24px rgba(17,24,39,0.06)' }}>
          <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.7, marginBottom: cfg.steps.length ? 18 : 0 }}>{cfg.body}</div>
          {cfg.steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0' }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, background: i <= cfg.active ? 'var(--brand)' : 'var(--bg)', color: i <= cfg.active ? '#fff' : 'var(--ink-3)', border: i <= cfg.active ? 'none' : '1px solid var(--line)' }}>{i < cfg.active ? <Icon n="check" size={16} color="#fff" /> : i + 1}</span>
              <span style={{ fontSize: 13, color: i === cfg.active ? 'var(--ink)' : 'var(--ink-2)', fontWeight: i === cfg.active ? 600 : 400 }}>{s}</span>
            </div>
          ))}
        </div>
        {state !== 'inactive' && <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-3)', marginTop: 20 }}>{tr('onb_wait_note')}</div>}
      </div>
    </div>
  );
}

/* ================= Leave form ================= */
function LeaveForm({ onSubmitted, onError }: { onSubmitted: () => void; onError: (m: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState<'sick' | 'personal' | 'vacation'>('sick');
  const [startDate, setStart] = useState(today);
  const [endDate, setEnd] = useState(today);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const fld: React.CSSProperties = { width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 14, background: 'var(--surface)' };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (endDate < startDate) { onError(tr('date_err')); return; }
    setBusy(true);
    try {
      await api('/leave', { method: 'POST', body: JSON.stringify({ type, startDate, endDate, reason }) });
      setReason('');
      onSubmitted();
    } catch (e2) { onError(errorMessage(e2)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ background: 'var(--surface)', borderRadius: 16, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{tr('leave_form_title')}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {(['sick', 'personal', 'vacation'] as const).map((t) => (
          <button type="button" key={t} onClick={() => setType(t)} style={{ flex: 1, height: 38, borderRadius: 10, border: type === t ? '1.5px solid var(--brand)' : '1px solid var(--line)', background: type === t ? 'var(--brand-tint)' : '#fff', color: type === t ? 'var(--brand-700)' : 'var(--ink-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{leaveLabel(t)}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div><div style={{ fontSize: 11, color: 'var(--ink-2)', marginBottom: 4 }}>{tr('date_start')}</div><input type="date" value={startDate} onChange={(e) => { setStart(e.target.value); if (endDate < e.target.value) setEnd(e.target.value); }} style={fld} /></div>
        <div><div style={{ fontSize: 11, color: 'var(--ink-2)', marginBottom: 4 }}>{tr('date_end')}</div><input type="date" value={endDate} min={startDate} onChange={(e) => setEnd(e.target.value)} style={fld} /></div>
      </div>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr('reason_ph')} style={{ ...fld, marginBottom: 12 }} />
      <button type="submit" disabled={busy} style={{ width: '100%', height: 44, border: 'none', borderRadius: 11, background: 'var(--brand)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>{busy ? tr('leave_sending') : tr('leave_submit')}</button>
    </form>
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
  const [onboard, setOnboard] = useState<'none' | 'pending' | 'confirmed' | 'inactive'>('none');
  const [booting, setBooting] = useState(true);
  const [external, setExternal] = useState(false); // opened outside the LINE app
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [history, setHistory] = useState<AttRow[]>([]);
  const [leaveData, setLeaveData] = useState<{ requests: LeaveRow[]; used: Record<string, number> } | null>(null);
  const [punching, setPunching] = useState<null | 'locating' | 'saving'>(null);
  const [consented, setConsented] = useState<boolean | null>(null); // PDPA gate: null=checking
  const [locale, setLocaleState] = useState<Locale | null>(readLocale());
  const [needOnboard, setNeedOnboard] = useState<false | 'pending' | 'confirmed'>(false);
  const [offices, setOffices] = useState<{ id: string; name: string }[]>([]);
  const [officeId, setOfficeId] = useState<string>('');
  const flash = (text: string, ok = false, ms = 4000) => { setToast({ text, ok }); setTimeout(() => setToast(null), ms); };
  _t = makeT(locale ?? 'th'); // keep the module translator in sync every render

  function pickLocale(l: Locale) {
    setLocaleState(l); storeLocale(l);
    if (authed) api('/me/locale', { method: 'PATCH', body: JSON.stringify({ locale: l }) }).catch(() => {});
  }

  useEffect(() => { const t = setInterval(() => setClock(new Date().toLocaleTimeString('th-TH')), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    (async () => {
      await initLiff();
      const inClient = isInClient();
      setExternal(!inClient);
      const idToken = getIdToken();
      if (!idToken) { setBooting(false); return; } // no LINE token — external browser shows login form
      const wantConfirm = new URLSearchParams(location.search).get('onboard') === 'confirm';
      try {
        const r = await api<{ token: string; user: Me }>('/auth/line/login', { method: 'POST', body: JSON.stringify({ idToken }) });
        setToken(r.token); setMe(r.user); setAuthed(true);
        const prof = await api<{ hasConsent: boolean; locale: Locale; officeId: string | null }>('/me/profile').catch(() => null);
        if (prof) { setConsented(!!prof.hasConsent); setOfficeId(prof.officeId ?? ''); if (prof.locale) { setLocaleState(prof.locale); storeLocale(prof.locale); } }
        setToday(await api<Attendance>('/attendance/today'));
      } catch (e) {
        const msg = String(e);
        if (msg.includes('ACCOUNT_INACTIVE')) setOnboard('inactive');
        else if (msg.includes('ONBOARDING_REQUIRED')) setNeedOnboard(wantConfirm ? 'confirmed' : 'pending'); // checkin runs once language is chosen
        else setNote(errorMessage(e));
      } finally { setBooting(false); }
    })();
  }, []);

  // onboarding check-in — waits until a language is chosen so the record + rich menu use it
  useEffect(() => {
    if (!needOnboard || !locale || onboard !== 'none') return;
    (async () => {
      const idToken = getIdToken(); if (!idToken) return;
      const p = await getProfile();
      try {
        await api('/line/onboarding/checkin', { method: 'POST', body: JSON.stringify({ idToken, displayName: p?.displayName, pictureUrl: p?.pictureUrl, locale }) });
        if (needOnboard === 'confirmed') await api('/line/onboarding/confirm', { method: 'POST', body: JSON.stringify({ idToken }) });
        setOnboard(needOnboard);
      } catch (e2) { setNote(errorMessage(e2)); }
    })();
  }, [needOnboard, locale, onboard]);

  useEffect(() => {
    if (!authed) return;
    api<Summary>('/attendance/summary').then(setSummary).catch(() => {});
    api<{ id: string; name: string }[]>('/me/offices').then(setOffices).catch(() => {});
  }, [authed]);
  async function changeOffice(v: string) {
    setOfficeId(v);
    try { await api('/me/office', { method: 'PATCH', body: JSON.stringify({ officeId: v || undefined }) }); flash(tr('worksite_changed'), true); } catch { /* ignore */ }
  }
  useEffect(() => {
    if (!authed) return;
    if (view === 'history') api<AttRow[]>('/attendance/history').then(setHistory).catch(() => {});
    if (view === 'leave') api<{ requests: LeaveRow[]; used: Record<string, number> }>('/leave/mine').then(setLeaveData).catch(() => {});
  }, [view, authed]);

  if (booting) return <SplashScreen />;
  // first-run: choose a language (also when a returning user has none stored)
  if (locale === null) return <LanguagePicker onPick={pickLocale} />;
  if (onboard !== 'none') return <OnboardingScreen state={onboard} />;
  if (needOnboard) return <SplashScreen />; // waiting for check-in to resolve
  // Employee email/password form only outside the LINE app; inside LINE we keep
  // the splash rather than flashing a login form during LINE's consent step.
  if (!authed) return external
    ? <EmployeeLogin onDone={(u) => { setMe(u); setAuthed(true); api<Attendance>('/attendance/today').then(setToday).catch(() => {}); }} />
    : <SplashScreen />;
  // PDPA gate: must consent before using check-in / payslip / leave
  if (consented === null) return <SplashScreen />;
  if (!consented) return <RegisterScreen gate back={() => { /* no skip */ }} onConsented={() => setConsented(true)} />;

  async function punch() {
    if (punching) return; // guard against rapid double taps
    if (!getIdToken()) { flash(tr('open_in_line')); return; }
    const checkedIn = !!today?.checkInAt && !today?.checkOutAt;
    setPunching('locating');
    let pos: GeolocationPosition;
    try {
      pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000 }));
    } catch { setPunching(null); flash(tr('gps_needed')); return; }
    setPunching('saving');
    const path = checkedIn ? '/attendance/check-out' : '/attendance/check-in';
    try {
      setToday(await api<NonNullable<Attendance>>(path, { method: 'POST', body: checkedIn ? undefined : JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }) }));
      flash(checkedIn ? tr('checkout_ok') : tr('checkin_ok'), true);
      api<Summary>('/attendance/summary').then(setSummary).catch(() => {});
    } catch (e) { flash(errorMessage(e), false, 5000); }
    finally { setPunching(null); }
  }

  if (view === 'payslip') return <div style={{ maxWidth: 420, margin: '0 auto', background: 'var(--bg)' }}><PayslipScreen back={() => setView('profile')} /></div>;
  if (view === 'register') return <div style={{ maxWidth: 420, margin: '0 auto' }}><RegisterScreen back={() => setView('profile')} /></div>;
  if (view === 'editprofile') return <div style={{ maxWidth: 420, margin: '0 auto' }}><EditProfileScreen back={() => setView('profile')} /></div>;

  const checkedIn = !!today?.checkInAt && !today?.checkOutAt;
  const done = !!today?.checkOutAt;
  const hr = new Date().getHours();
  const greeting = hr < 12 ? tr('greeting_morning') : hr < 17 ? tr('greeting_afternoon') : tr('greeting_evening');

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {view === 'home' && (
          <>
            <div style={{ background: 'linear-gradient(160deg,#06C755,#04A548)', color: '#fff', padding: '24px 20px 52px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{me?.name?.[0] ?? 'พ'}</div>
                <div><div style={{ fontSize: 13, opacity: 0.9 }}>{greeting}</div><div style={{ fontSize: 17, fontWeight: 600 }}>{me?.name ?? tr('employee')}</div></div>
              </div>
            </div>
            <div style={{ padding: '0 16px 20px', marginTop: -36 }}>
              <div style={{ background: 'var(--surface)', borderRadius: 20, padding: '24px 20px', boxShadow: '0 8px 24px rgba(17,24,39,0.06)', textAlign: 'center' }}>
                <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: -1, fontVariantNumeric: 'tabular-nums' }}>{clock}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: punching ? 'var(--brand-700)' : done ? 'var(--ink-2)' : checkedIn ? 'var(--brand-700)' : 'var(--ink-3)' }}>
                  {punching === 'locating' ? <><Icon n="my_location" size={16} /> {tr('locating')}</> : punching === 'saving' ? <><Icon n="sync" size={16} /> {tr('saving')}</> : done ? tr('done_today') : checkedIn ? `${tr('checked_in_at')} · ${today?.checkInAt ? fmtTime(today.checkInAt) : ''}` : tr('not_checked_in')}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button onClick={punch} disabled={done || !!punching} style={{ width: 168, height: 168, borderRadius: '50%', border: 'none', fontSize: 17, fontWeight: 700, cursor: done || punching ? 'default' : 'pointer', background: punching ? '#B8BFC7' : done ? '#EEF0F3' : checkedIn ? 'radial-gradient(circle at 50% 35%,#FFB43D,#F59E0B)' : 'radial-gradient(circle at 50% 35%,#12D866,#06C755)', color: done ? 'var(--ink-3)' : '#fff', boxShadow: done || punching ? 'none' : '0 14px 34px rgba(6,199,85,0.42)', transition: 'background 0.2s' }}>{punching ? tr('processing') : done ? tr('btn_done') : checkedIn ? tr('btn_checkout') : tr('btn_checkin')}</button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 14px', marginTop: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" /></svg></div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>{tr('geo_hint')}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 16 }}><div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>{tr('hours_week')}</div><div style={{ fontSize: 24, fontWeight: 700 }}>{summary?.weekHours ?? 0}<span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 500 }}> {tr('hours_unit')}</span></div></div>
                <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 16 }}><div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>{tr('late_month')}</div><div style={{ fontSize: 24, fontWeight: 700 }}>{summary?.lateThisMonth ?? 0}<span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 500 }}> {tr('times_unit')}</span></div></div>
              </div>
            </div>
          </>
        )}

        {view === 'history' && (
          <div style={{ padding: 16 }}>
            <h2 style={{ fontSize: 20, margin: '6px 4px 16px' }}>{tr('history_title')}</h2>
            {history.map((r) => {
              const d = new Date(r.workDate);
              const dd = String(d.getDate()).padStart(2, '0');
              const wd = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'][d.getDay()];
              const times = `${r.checkInAt ? fmtTime(r.checkInAt) : '--:--'} → ${r.checkOutAt ? fmtTime(r.checkOutAt) : '--:--'}`;
              const late = r.status === 'late';
              return (
                <div key={r.id} style={{ background: 'var(--surface)', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 16, fontWeight: 700 }}>{dd}</span><span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{wd}</span></div>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{times}</div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: late ? 'var(--warn)' : 'var(--ink-2)' }}>{statusLabel(r.status)}</span>
                </div>
              );
            })}
            {history.length === 0 && <div style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 13, padding: 32 }}>{tr('history_empty')}</div>}
          </div>
        )}

        {view === 'leave' && (
          <div style={{ padding: 16 }}>
            <h2 style={{ fontSize: 20, margin: '6px 4px 16px' }}>{tr('leave_title')}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
              {([['sick', 'var(--danger)', '#FDECEC'], ['personal', 'var(--info)', '#EAF1FE'], ['vacation', 'var(--brand-700)', 'var(--brand-tint)']] as const).map(([k, col, bg]) => (
                <div key={k} style={{ background: bg, borderRadius: 16, padding: '14px 8px', textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: col }}>{leaveData?.used[k] ?? 0}</div><div style={{ fontSize: 11, color: col, fontWeight: 500 }}>{leaveLabel(k)} · {tr('used_suffix')}</div></div>
              ))}
            </div>
            <LeaveForm onSubmitted={() => { flash(tr('leave_submitted'), true); api<{ requests: LeaveRow[]; used: Record<string, number> }>('/leave/mine').then(setLeaveData).catch(() => {}); }} onError={(m) => flash(m)} />
            <div style={{ fontSize: 13, fontWeight: 700, margin: '20px 4px 10px' }}>{tr('my_requests')}</div>
            {(leaveData?.requests ?? []).map((r) => (
              <div key={r.id} style={{ background: 'var(--surface)', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{leaveLabel(r.type)} · {r.days} {tr('days_unit')}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{r.startDate} → {r.endDate}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: r.status === 'approved' ? 'var(--brand-700)' : r.status === 'rejected' ? 'var(--danger)' : 'var(--warn)' }}>{statusLabel(r.status)}</span>
              </div>
            ))}
            {(leaveData?.requests ?? []).length === 0 && <div style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 13, padding: 20 }}>{tr('leave_empty')}</div>}
          </div>
        )}

        {view === 'profile' && (
          <div>
            <div style={{ background: 'linear-gradient(160deg,#06C755,#04A548)', color: '#fff', padding: '28px 20px 56px', textAlign: 'center' }}>
              <div style={{ width: 84, height: 84, borderRadius: 26, background: 'rgba(255,255,255,0.22)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, marginBottom: 12 }}>{me?.name?.[0] ?? 'พ'}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{me?.name ?? tr('employee')}</div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>{me?.role ?? 'employee'}</div>
            </div>
            <div style={{ padding: '0 16px', marginTop: -42 }}>
              <div style={{ background: 'var(--surface)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 8px 24px rgba(17,24,39,0.06)' }}>
                <button onClick={() => setView('editprofile')} style={rowBtn}><span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Icon n="person" color="var(--brand-700)" /> {tr('pf_edit')}</span><span style={{ color: 'var(--ink-3)' }}>›</span></button>
                <div style={{ height: 1, background: 'var(--line)' }} />
                <button onClick={() => setView('payslip')} style={rowBtn}><span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Icon n="payments" color="var(--brand-700)" /> {tr('pf_payslip')}</span><span style={{ color: 'var(--ink-3)' }}>›</span></button>
                <div style={{ height: 1, background: 'var(--line)' }} />
                <button onClick={() => setView('register')} style={rowBtn}><span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Icon n="shield_person" color="var(--brand-700)" /> {tr('pf_pdpa')}</span><span style={{ color: 'var(--ink-3)' }}>›</span></button>
              </div>
              {/* work site selector */}
              {offices.length > 0 && (
                <div style={{ background: 'var(--surface)', borderRadius: 18, boxShadow: '0 8px 24px rgba(17,24,39,0.06)', marginTop: 14, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}><Icon n="location_on" color="var(--brand-700)" /> <span style={{ fontSize: 14, fontWeight: 600 }}>{tr('pf_worksite')}</span></div>
                  <select value={officeId} onChange={(e) => changeOffice(e.target.value)} style={{ width: '100%', height: 44, border: '1px solid var(--line)', borderRadius: 10, padding: '0 12px', fontSize: 14, background: 'var(--surface)' }}>
                    <option value="">{tr('worksite_any')}</option>
                    {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              )}
              {/* language switcher */}
              <div style={{ background: 'var(--surface)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 8px 24px rgba(17,24,39,0.06)', marginTop: 14, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}><Icon n="translate" color="var(--brand-700)" /> <span style={{ fontSize: 14, fontWeight: 600 }}>{tr('pf_language')}</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                  {LOCALES.map((l) => (
                    <button key={l.code} onClick={() => { pickLocale(l.code); flash(makeT(l.code)('lang_changed'), true); }} style={{ height: 44, borderRadius: 10, border: locale === l.code ? '1.5px solid var(--brand)' : '1px solid var(--line)', background: locale === l.code ? 'var(--brand-tint)' : '#fff', color: locale === l.code ? 'var(--brand-700)' : 'var(--ink)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{l.native}</button>
                  ))}
                </div>
              </div>
              <button onClick={() => { try { liff.logout(); } catch { /* not in LINE */ } location.reload(); }} style={{ width: '100%', height: 50, marginTop: 16, border: '1px solid #FADBDB', borderRadius: 14, background: '#fff', color: 'var(--danger)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{tr('logout')}</button>
            </div>
          </div>
        )}
      </div>

      {(toast || note) && (
        <div style={{ position: 'fixed', bottom: 84, left: 16, right: 16, display: 'flex', justifyContent: 'center', zIndex: 90, pointerEvents: 'none' }}>
          <div style={{ maxWidth: 360, background: toast?.ok ? 'var(--brand-700)' : '#333', color: '#fff', borderRadius: 12, padding: '11px 18px', fontSize: 13, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {toast && <Icon n={toast.ok ? 'check_circle' : 'error'} size={18} />}<span>{toast?.text ?? note}</span>
          </div>
        </div>
      )}

      <nav style={{ background: 'var(--surface)', borderTop: '1px solid var(--line)', padding: '6px 8px 10px', display: 'flex' }}>
        {([['home', 'nav_home'], ['history', 'nav_history'], ['leave', 'nav_leave'], ['profile', 'nav_profile']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setView(k as View)} style={{ flex: 1, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 4px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={view === k ? 'var(--brand)' : 'var(--ink-3)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{navIcon(k)}</svg>
            <span style={{ fontSize: 10, fontWeight: 600, color: view === k ? 'var(--brand)' : 'var(--ink-3)' }}>{tr(label)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
const rowBtn: React.CSSProperties = { width: '100%', border: 'none', background: 'none', padding: '16px', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit', color: 'var(--ink)' };

/** Lucide icons (stroke) for the bottom nav. */
function navIcon(k: 'home' | 'history' | 'leave' | 'profile') {
  switch (k) {
    case 'home': return <><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>;
    case 'history': return <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></>;
    case 'leave': return <><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></>;
    case 'profile': return <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>;
  }
}
