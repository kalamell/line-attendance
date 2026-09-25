import { useEffect, useState } from 'react';
import { initLiff, getIdToken, getProfile, isInClient, liff } from './lib/liff';
import { api, setToken, loginPassword, errorMessage, downloadFile } from './lib/api';
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
      <div className="h-[100dvh] flex flex-col pt-4 px-7 pb-7">
        <button onClick={back} className="self-start border-none bg-transparent text-ink-2 text-sm cursor-pointer">‹ {tr('back')}</button>
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-[72px] h-[72px] rounded-[22px] bg-brand-tint flex items-center justify-center mb-5">
            <Icon n={mode === 'setpin' ? 'lock_reset' : 'lock'} size={34} color="var(--brand)" />
          </div>
          <div className="text-[19px] font-bold mb-1.5 text-center">{title}</div>
          <div className="text-[13px] text-ink-2 text-center max-w-[260px]">{sub}</div>
          {mode !== 'loading' && (
            <div className="flex gap-[14px] mt-7 mb-2">
              {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="w-[15px] h-[15px] rounded-full" style={{ background: i < pin.length ? 'var(--brand)' : 'transparent', border: `2px solid ${i < pin.length ? 'var(--brand)' : '#C4C9CE'}` }} />)}
            </div>
          )}
          {err && <div className="text-danger text-[13px] font-semibold mt-2 text-center">{err}</div>}
        </div>
        {mode !== 'loading' && (
          <div className="grid grid-cols-3 gap-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map((k, i) => k === '' ? <span key={i} /> : (
              <button key={i} onClick={() => (k === 'back' ? (setPin(pin.slice(0, -1)), setErr(null)) : tap(k))}
                className="h-14 rounded-[14px] border-none text-[22px] font-semibold cursor-pointer flex items-center justify-center" style={{ background: k === 'back' ? 'transparent' : 'var(--bg)' }}>
                {k === 'back' ? <Icon n="backspace" size={22} color="var(--ink-2)" /> : k}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      <div className="text-white pt-[18px] px-5 pb-10" style={{ background: 'linear-gradient(160deg,#06C755,#04A548)' }}>
        <button onClick={back} className="border-none bg-transparent text-white text-sm cursor-pointer p-0 mb-2">‹ {tr('back')}</button>
        <div className="text-[17px] font-bold">{tr('pf_payslip')}</div>
        <div className="text-[13px] opacity-90">{tr('pay_period')} {slip?.period ?? '—'}</div>
      </div>
      <div className="flex-1 overflow-y-auto pt-0 px-4 pb-5 -mt-7">
        <div className="bg-surface rounded-[18px] p-5 shadow-[0_8px_24px_rgba(17,24,39,0.06)]">
          {!slip && <div className="text-[13px] text-ink-2 text-center p-3">{tr('pay_no_slip')}</div>}
          {slip && (
            <>
              <div className="text-[13px] font-bold text-brand-700 mb-2.5">{tr('pay_income')}</div>
              {earnings.map((e, i) => <Row key={i} l={e.label} v={e.amount} />)}
              <div className="text-[13px] font-bold text-danger mt-3.5 mb-2.5">{tr('pay_deduction')}</div>
              {deductions.map((e, i) => <Row key={i} l={e.label} v={`-${e.amount}`} />)}
              <div className="bg-brand-tint rounded-[14px] p-4 flex justify-between items-center mt-4">
                <span className="text-sm font-semibold text-brand-700">{tr('pay_net')}</span>
                <span className="text-[24px] font-bold text-brand-700">฿{slip.net}</span>
              </div>
            </>
          )}
        </div>
        {slip && (
          <div className="mt-4 flex flex-col gap-2.5">
            <button onClick={async () => { downloadFile('/me/payslip/pdf', `payslip-${slip.period}.pdf`).catch(() => {}) }} className="w-full h-[52px] border-none rounded-[14px] bg-brand text-white text-[15px] font-semibold cursor-pointer shadow-[0_8px_20px_rgba(6,199,85,0.30)] flex items-center justify-center gap-2"><Icon n="picture_as_pdf" size={20} color="#fff" /> {tr('pay_download')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
function Row({ l, v }: { l: string; v: string }) {
  return <div className="flex justify-between text-sm py-[5px] px-0"><span className="text-ink-2">{l}</span><span className="font-medium">{v}</span></div>;
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
    <div className="min-h-[100dvh] flex flex-col bg-surface">
      <div className="pt-5 px-5 pb-4 border-b border-line">
        {gate
          ? <div className="text-xs text-brand-700 font-semibold mb-2">ต้องยินยอมก่อนเริ่มใช้งาน</div>
          : <button onClick={back} className="border-none bg-transparent text-ink-2 text-sm cursor-pointer p-0 mb-3">‹ กลับ</button>}
        <div className="text-[18px] font-bold">ความยินยอมข้อมูลส่วนบุคคล (PDPA)</div>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {done ? (
          <div className="text-center pt-10">
            <div className="w-[84px] h-[84px] rounded-full bg-brand-tint inline-flex items-center justify-center mb-[18px]">
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <div className="text-[19px] font-bold mb-2">บันทึกความยินยอมแล้ว</div>
            <div className="text-sm text-ink-2 leading-[1.6]">ขอบคุณครับ ระบบบันทึกความยินยอม PDPA ของท่านเรียบร้อย</div>
            <button onClick={back} className="mt-6 h-12 py-0 px-7 border border-line rounded-[14px] bg-white text-[15px] font-semibold cursor-pointer">กลับ</button>
          </div>
        ) : (
          <div>
            <div className="text-[13px] text-ink-2 leading-[1.6] mb-4">ข้อมูลพนักงานถูกจัดทำโดยฝ่ายบุคคล ท่านเพียงให้ความยินยอมการเก็บและใช้ข้อมูลตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)</div>
            {[['ข้อมูลที่จัดเก็บ (PII)', 'ชื่อ-นามสกุล, เลขบัตรประชาชน, ที่อยู่, บัญชีธนาคาร, ข้อมูลการเข้างาน'], ['วัตถุประสงค์ & สิทธิ', 'ใช้เพื่อการจ้างงาน/จ่ายเงินเดือน · เข้าถึงเฉพาะฝ่ายบุคคล เก็บแบบเข้ารหัส · ขอเข้าถึง/แก้ไข/ลบได้ทุกเมื่อ']].map((b, i) => (
              <div key={i} className="bg-bg rounded-[14px] p-4 mb-3"><div className="text-[13px] font-semibold mb-1.5">{b[0]}</div><div className="text-xs text-ink-2 leading-[1.5]">{b[1]}</div></div>
            ))}
            {err && <div className="bg-[var(--danger-tint)] text-danger rounded-[10px] px-[13px] py-[9px] text-[13px] mt-2">{err}</div>}
            <button onClick={() => setConsent(!consent)} className="w-full mt-1.5 rounded-[14px] p-3.5 cursor-pointer flex items-center gap-3 text-left" style={{ border: `1.5px solid ${consent ? 'var(--brand)' : 'var(--line)'}`, background: consent ? 'var(--brand-tint)' : '#fff' }}>
              <span className="w-6 h-6 rounded-[7px] flex items-center justify-center shrink-0" style={{ border: `2px solid ${consent ? 'var(--brand)' : '#C4C9CE'}`, background: consent ? 'var(--brand)' : '#fff' }}>{consent && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}</span>
              <span className="text-[13px] leading-[1.5]">ข้าพเจ้าได้อ่านและ<b>ยินยอม</b>ให้เก็บและใช้ข้อมูลส่วนบุคคลตามวัตถุประสงค์ข้างต้น</span>
            </button>
          </div>
        )}
      </div>
      {!done && (
        <div className="pt-3.5 px-5 pb-[22px] border-t border-line">
          <button onClick={submit} disabled={!consent || busy}
            className="w-full h-[52px] border-none rounded-[14px] text-[16px] font-semibold" style={{ background: consent && !busy ? 'var(--brand)' : '#EEF0F3', color: consent && !busy ? '#fff' : 'var(--ink-3)', cursor: consent && !busy ? 'pointer' : 'default' }}>
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
  const field = 'border border-line rounded-xl px-3.5 py-[13px] text-sm w-full';
  const ro = `${field} bg-bg text-ink-3`;
  const lbl = 'text-xs text-ink-2 mb-1.5';
  const sect = 'text-[13px] font-bold mt-[22px] mb-3';
  const primary = 'w-full h-[50px] border-none rounded-[14px] bg-brand text-white text-[15px] font-semibold cursor-pointer';
  const ghost = 'w-full h-12 border border-brand rounded-[14px] bg-white text-brand-700 text-[15px] font-semibold cursor-pointer';
  return (
    <div className="h-[100dvh] flex flex-col bg-surface">
      <div className="pt-5 px-5 pb-4 border-b border-line">
        <button onClick={back} className="border-none bg-transparent text-ink-2 text-sm cursor-pointer p-0 mb-3">‹ กลับ</button>
        <div className="text-[18px] font-bold">แก้ไขข้อมูลส่วนตัว</div>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {msg && <div className="rounded-xl p-3 font-semibold text-[13px] mb-3.5" style={{ background: msg.ok ? 'var(--brand-tint)' : 'var(--danger-tint)', color: msg.ok ? 'var(--brand-700)' : 'var(--danger)' }}>{msg.t}</div>}
        {f && (
          <>
            <div className="mb-3.5"><div className={lbl}>ชื่อ-นามสกุล</div><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={field} /></div>
            <div className="mb-3.5"><div className={lbl}>อีเมล</div><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} type="email" className={field} /></div>
            <div className="mb-3.5"><div className={lbl}>เบอร์โทร</div><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="08x-xxx-xxxx" className={field} /></div>
            <div className="mb-3.5"><div className={lbl}>ที่อยู่</div><input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} className={field} /></div>
            <div className="mb-3.5"><div className={lbl}>ผู้ติดต่อฉุกเฉิน</div><input value={f.emergencyContactName} onChange={(e) => setF({ ...f, emergencyContactName: e.target.value })} placeholder="ชื่อผู้ติดต่อ" className={field} /></div>
            <div className="mb-4"><div className={lbl}>เบอร์ผู้ติดต่อฉุกเฉิน</div><input value={f.emergencyPhone} onChange={(e) => setF({ ...f, emergencyPhone: e.target.value })} placeholder="08x-xxx-xxxx" className={field} /></div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><div className={lbl}>แผนก (HR คุม)</div><div className={ro}>{f.department || '—'}</div></div>
              <div><div className={lbl}>ตำแหน่ง (HR คุม)</div><div className={ro}>{f.position || '—'}</div></div>
            </div>
            <div className="text-[11px] text-ink-3 mb-4 flex gap-1.5 items-center">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              ข้อมูลติดต่อถูกเก็บแบบเข้ารหัส · แก้ไขได้เฉพาะของคุณเอง (PDPA)
            </div>
            <button onClick={save} className={primary}>บันทึกข้อมูล</button>

            <div className={sect}>เปลี่ยนรหัสผ่าน</div>
            <div className="mb-3"><div className={lbl}>รหัสผ่านเดิม</div><input value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} type="password" className={field} /></div>
            <div className="mb-3.5"><div className={lbl}>รหัสผ่านใหม่ (≥6 ตัว)</div><input value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} type="password" className={field} /></div>
            <button onClick={changePw} className={ghost}>เปลี่ยนรหัสผ่าน</button>

            <div className={sect}>PIN เปิดสลิปเงินเดือน</div>
            <div className="mb-3.5"><div className={lbl}>ตั้ง/เปลี่ยน PIN (≥4 หลัก)</div><input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={6} type="password" className={field} /></div>
            <button onClick={savePin} className={`${ghost} mb-2`}>ตั้ง PIN สลิป</button>
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
  const field = 'w-full h-[46px] border border-line rounded-xl py-0 px-3.5 mt-1.5 mb-4 text-[15px]';
  return (
    <div className="max-w-[420px] mx-auto min-h-[100dvh] flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full bg-surface p-7 rounded-[20px] shadow-[0_12px_40px_rgba(17,24,39,0.08)]">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-11 h-11 rounded-[13px] bg-brand flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
          </div>
          <div><div className="text-[18px] font-bold">TimeLine</div><div className="text-xs text-brand-700 font-semibold">ลงเวลาเข้างาน</div></div>
        </div>
        <div className="text-[13px] text-ink-2 mb-[18px]">เข้าสู่ระบบพนักงาน (หรือเปิดผ่านแอป LINE)</div>
        <label className="text-xs text-ink-2">อีเมล</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className={field} />
        <label className="text-xs text-ink-2">รหัสผ่าน</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required className={field} />
        {err && <div className="text-danger text-xs mb-3">{err}</div>}
        <button type="submit" disabled={busy} className="w-full h-12 border-none rounded-xl bg-brand text-white text-[15px] font-semibold cursor-pointer shadow-[0_8px_20px_rgba(6,199,85,0.30)]">{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
      </form>
    </div>
  );
}

/* ================= Onboarding / splash ================= */
function SplashScreen() {
  return (
    <div className="max-w-[420px] mx-auto h-[100dvh] flex items-center justify-center bg-bg text-ink-3 text-sm">
      {tr('loading')}
    </div>
  );
}

/* ================= Language picker ================= */
function LanguagePicker({ onPick }: { onPick: (l: Locale) => void }) {
  return (
    <div className="max-w-[420px] mx-auto min-h-[100dvh] flex flex-col bg-bg">
      <div className="text-white pt-[72px] px-7 pb-12 text-center" style={{ background: 'linear-gradient(160deg,#06C755,#04A548)' }}>
        <div className="w-[84px] h-[84px] rounded-full bg-[rgba(255,255,255,0.22)] inline-flex items-center justify-center mb-4"><Icon n="translate" size={44} color="#fff" /></div>
        <div className="text-[22px] font-bold">เลือกภาษา · Language</div>
        <div className="text-[13px] opacity-[0.92] mt-1.5">ภาษา / Language / ဘာသာ / ພາສາ</div>
      </div>
      <div className="flex-1 py-6 px-5 flex flex-col gap-3">
        {LOCALES.map((l) => (
          <button key={l.code} onClick={() => onPick(l.code)} className="w-full h-16 border border-line rounded-2xl bg-surface flex items-center justify-between py-0 px-5 cursor-pointer">
            <span className="text-[18px] font-bold">{l.native}</span>
            <span className="text-[13px] text-ink-3">{l.label}</span>
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
    <div className="max-w-[420px] mx-auto min-h-[100dvh] flex flex-col bg-bg">
      <div className="text-white pt-16 px-7 pb-12 text-center" style={{ background: 'linear-gradient(160deg,#06C755,#04A548)' }}>
        <div className="w-[88px] h-[88px] rounded-full bg-[rgba(255,255,255,0.22)] inline-flex items-center justify-center mb-4"><Icon n={cfg.icon} size={46} color="#fff" /></div>
        <div className="text-[22px] font-bold">{cfg.title}</div>
      </div>
      <div className="flex-1 py-6 px-5">
        <div className="bg-surface rounded-[18px] p-5 -mt-9 shadow-[0_8px_24px_rgba(17,24,39,0.06)]">
          <div className="text-sm text-ink-2 leading-[1.7]" style={{ marginBottom: cfg.steps.length ? 18 : 0 }}>{cfg.body}</div>
          {cfg.steps.map((s, i) => (
            <div key={i} className="flex items-center gap-3 py-[9px] px-0">
              <span className="w-[26px] h-[26px] rounded-full shrink-0 flex items-center justify-center text-[13px] font-bold" style={{ background: i <= cfg.active ? 'var(--brand)' : 'var(--bg)', color: i <= cfg.active ? '#fff' : 'var(--ink-3)', border: i <= cfg.active ? 'none' : '1px solid var(--line)' }}>{i < cfg.active ? <Icon n="check" size={16} color="#fff" /> : i + 1}</span>
              <span className="text-[13px]" style={{ color: i === cfg.active ? 'var(--ink)' : 'var(--ink-2)', fontWeight: i === cfg.active ? 600 : 400 }}>{s}</span>
            </div>
          ))}
        </div>
        {state !== 'inactive' && <div className="text-center text-xs text-ink-3 mt-5">{tr('onb_wait_note')}</div>}
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
  const fld = 'w-full border border-line rounded-[10px] py-2.5 px-3 text-sm bg-surface';
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
    <form onSubmit={submit} className="bg-surface rounded-2xl p-4">
      <div className="text-[13px] font-bold mb-3">{tr('leave_form_title')}</div>
      <div className="flex gap-2 mb-2.5">
        {(['sick', 'personal', 'vacation'] as const).map((t) => (
          <button type="button" key={t} onClick={() => setType(t)} className="flex-1 h-[38px] rounded-[10px] text-[13px] font-semibold cursor-pointer" style={{ border: type === t ? '1.5px solid var(--brand)' : '1px solid var(--line)', background: type === t ? 'var(--brand-tint)' : '#fff', color: type === t ? 'var(--brand-700)' : 'var(--ink-2)' }}>{leaveLabel(t)}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5 mb-2.5">
        <div><div className="text-[11px] text-ink-2 mb-1">{tr('date_start')}</div><input type="date" value={startDate} onChange={(e) => { setStart(e.target.value); if (endDate < e.target.value) setEnd(e.target.value); }} className={fld} /></div>
        <div><div className="text-[11px] text-ink-2 mb-1">{tr('date_end')}</div><input type="date" value={endDate} min={startDate} onChange={(e) => setEnd(e.target.value)} className={fld} /></div>
      </div>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr('reason_ph')} className={`${fld} mb-3`} />
      <button type="submit" disabled={busy} className="w-full h-11 border-none rounded-[11px] bg-brand text-white font-semibold text-sm cursor-pointer">{busy ? tr('leave_sending') : tr('leave_submit')}</button>
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
  const [leaveData, setLeaveData] = useState<{ requests: LeaveRow[]; used: Record<string, number>; balances?: { type: string; quota: number; remaining: number }[] } | null>(null);
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
        const tab = new URLSearchParams(location.search).get('tab');
        if (tab === 'payslip' || tab === 'leave' || tab === 'history') setView(tab);
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
    if (view === 'leave') api<{ requests: LeaveRow[]; used: Record<string, number>; balances?: { type: string; quota: number; remaining: number }[] }>('/leave/mine').then(setLeaveData).catch(() => {});
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

  if (view === 'payslip') return <div className="max-w-[420px] mx-auto bg-bg"><PayslipScreen back={() => setView('profile')} /></div>;
  if (view === 'register') return <div className="max-w-[420px] mx-auto"><RegisterScreen back={() => setView('profile')} /></div>;
  if (view === 'editprofile') return <div className="max-w-[420px] mx-auto"><EditProfileScreen back={() => setView('profile')} /></div>;

  const checkedIn = !!today?.checkInAt && !today?.checkOutAt;
  const done = !!today?.checkOutAt;
  const hr = new Date().getHours();
  const greeting = hr < 12 ? tr('greeting_morning') : hr < 17 ? tr('greeting_afternoon') : tr('greeting_evening');

  return (
    <div className="max-w-[420px] mx-auto h-[100dvh] flex flex-col bg-bg overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {view === 'home' && (
          <>
            <div className="text-white pt-6 px-5 pb-[52px]" style={{ background: 'linear-gradient(160deg,#06C755,#04A548)' }}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-[14px] bg-[rgba(255,255,255,0.22)] flex items-center justify-center font-bold">{me?.name?.[0] ?? 'พ'}</div>
                <div><div className="text-[13px] opacity-90">{greeting}</div><div className="text-[17px] font-semibold">{me?.name ?? tr('employee')}</div></div>
              </div>
            </div>
            <div className="pt-0 px-4 pb-5 -mt-9">
              <div className="bg-surface rounded-[20px] py-6 px-5 shadow-[0_8px_24px_rgba(17,24,39,0.06)] text-center">
                <div className="text-[52px] font-bold tracking-[-1px] tabular-nums">{clock}</div>
                <div className="text-[13px] font-semibold mb-[22px] flex items-center justify-center gap-1.5" style={{ color: punching ? 'var(--brand-700)' : done ? 'var(--ink-2)' : checkedIn ? 'var(--brand-700)' : 'var(--ink-3)' }}>
                  {punching === 'locating' ? <><Icon n="my_location" size={16} /> {tr('locating')}</> : punching === 'saving' ? <><Icon n="sync" size={16} /> {tr('saving')}</> : done ? tr('done_today') : checkedIn ? `${tr('checked_in_at')} · ${today?.checkInAt ? fmtTime(today.checkInAt) : ''}` : tr('not_checked_in')}
                </div>
                <div className="flex justify-center">
                  <button onClick={punch} disabled={done || !!punching} className="w-[168px] h-[168px] rounded-full border-none text-[17px] font-bold [transition:background_0.2s]" style={{ cursor: done || punching ? 'default' : 'pointer', background: punching ? '#B8BFC7' : done ? '#EEF0F3' : checkedIn ? 'radial-gradient(circle at 50% 35%,#FFB43D,#F59E0B)' : 'radial-gradient(circle at 50% 35%,#12D866,#06C755)', color: done ? 'var(--ink-3)' : '#fff', boxShadow: done || punching ? 'none' : '0 14px 34px rgba(6,199,85,0.42)' }}>{punching ? tr('processing') : done ? tr('btn_done') : checkedIn ? tr('btn_checkout') : tr('btn_checkin')}</button>
                </div>
              </div>
              <div className="flex items-center gap-2.5 bg-bg border border-line rounded-[14px] py-3 px-3.5 mt-3.5">
                <div className="w-8 h-8 rounded-[10px] bg-brand flex items-center justify-center shrink-0"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" /></svg></div>
                <div className="text-xs text-ink-2 leading-[1.5]">{tr('geo_hint')}</div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3.5">
                <div className="bg-surface rounded-2xl p-4"><div className="text-xs text-ink-2 mb-2">{tr('hours_week')}</div><div className="text-[24px] font-bold">{summary?.weekHours ?? 0}<span className="text-[13px] text-ink-3 font-medium"> {tr('hours_unit')}</span></div></div>
                <div className="bg-surface rounded-2xl p-4"><div className="text-xs text-ink-2 mb-2">{tr('late_month')}</div><div className="text-[24px] font-bold">{summary?.lateThisMonth ?? 0}<span className="text-[13px] text-ink-3 font-medium"> {tr('times_unit')}</span></div></div>
              </div>
            </div>
          </>
        )}

        {view === 'history' && (
          <div className="p-4">
            <h2 className="text-[20px] mt-1.5 mx-1 mb-4">{tr('history_title')}</h2>
            {history.map((r) => {
              const d = new Date(r.workDate);
              const dd = String(d.getDate()).padStart(2, '0');
              const wd = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'][d.getDay()];
              const times = `${r.checkInAt ? fmtTime(r.checkInAt) : '--:--'} → ${r.checkOutAt ? fmtTime(r.checkOutAt) : '--:--'}`;
              const late = r.status === 'late';
              return (
                <div key={r.id} className="bg-surface rounded-[14px] p-3.5 flex items-center gap-3 mb-2.5">
                  <div className="w-[46px] h-[46px] rounded-xl bg-bg flex flex-col items-center justify-center"><span className="text-[16px] font-bold">{dd}</span><span className="text-[10px] text-ink-3">{wd}</span></div>
                  <div className="flex-1 text-[13px] font-medium">{times}</div>
                  <span className="text-[11px] font-semibold" style={{ color: late ? 'var(--warn)' : 'var(--ink-2)' }}>{statusLabel(r.status)}</span>
                </div>
              );
            })}
            {history.length === 0 && <div className="text-center text-ink-3 text-[13px] p-8">{tr('history_empty')}</div>}
          </div>
        )}

        {view === 'leave' && (
          <div className="p-4">
            <h2 className="text-[20px] mt-1.5 mx-1 mb-4">{tr('leave_title')}</h2>
            <div className="grid grid-cols-3 gap-2.5 mb-[18px]">
              {([['sick', 'var(--danger)', '#FDECEC'], ['personal', 'var(--info)', '#EAF1FE'], ['vacation', 'var(--brand-700)', 'var(--brand-tint)']] as const).map(([k, col, bg]) => {
                const b = leaveData?.balances?.find((x) => x.type === k);
                return (
                  <div key={k} className="rounded-2xl py-3.5 px-2 text-center" style={{ background: bg }}>
                    <div className="text-[22px] font-bold" style={{ color: col }}>{b ? b.remaining : 0}<span className="text-xs font-medium">/{b?.quota ?? 0}</span></div>
                    <div className="text-[11px] font-medium" style={{ color: col }}>{leaveLabel(k)} · {tr('lv_remaining')}</div>
                  </div>
                );
              })}
            </div>
            <LeaveForm onSubmitted={() => { flash(tr('leave_submitted'), true); api<{ requests: LeaveRow[]; used: Record<string, number>; balances?: { type: string; quota: number; remaining: number }[] }>('/leave/mine').then(setLeaveData).catch(() => {}); }} onError={(m) => flash(m)} />
            <div className="text-[13px] font-bold mt-5 mx-1 mb-2.5">{tr('my_requests')}</div>
            {(leaveData?.requests ?? []).map((r) => (
              <div key={r.id} className="bg-surface rounded-[14px] p-3.5 flex items-center gap-3 mb-2.5">
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">{leaveLabel(r.type)} · {r.days} {tr('days_unit')}</div>
                  <div className="text-[11px] text-ink-3">{r.startDate} → {r.endDate}</div>
                </div>
                <span className="text-[11px] font-semibold" style={{ color: r.status === 'approved' ? 'var(--brand-700)' : r.status === 'rejected' ? 'var(--danger)' : 'var(--warn)' }}>{statusLabel(r.status)}</span>
              </div>
            ))}
            {(leaveData?.requests ?? []).length === 0 && <div className="text-center text-ink-3 text-[13px] p-5">{tr('leave_empty')}</div>}
          </div>
        )}

        {view === 'profile' && (
          <div>
            <div className="text-white pt-7 px-5 pb-14 text-center" style={{ background: 'linear-gradient(160deg,#06C755,#04A548)' }}>
              <div className="w-[84px] h-[84px] rounded-[26px] bg-[rgba(255,255,255,0.22)] inline-flex items-center justify-center text-[32px] font-bold mb-3">{me?.name?.[0] ?? 'พ'}</div>
              <div className="text-[20px] font-bold">{me?.name ?? tr('employee')}</div>
              <div className="text-[13px] opacity-90">{me?.role ?? 'employee'}</div>
            </div>
            <div className="py-0 px-4 -mt-[42px]">
              <div className="bg-surface rounded-[18px] overflow-hidden shadow-[0_8px_24px_rgba(17,24,39,0.06)]">
                <button onClick={() => setView('editprofile')} className={rowBtn}><span className="flex items-center gap-3"><Icon n="person" color="var(--brand-700)" /> {tr('pf_edit')}</span><span className="text-ink-3">›</span></button>
                <div className="h-px bg-line" />
                <button onClick={() => setView('payslip')} className={rowBtn}><span className="flex items-center gap-3"><Icon n="payments" color="var(--brand-700)" /> {tr('pf_payslip')}</span><span className="text-ink-3">›</span></button>
                <div className="h-px bg-line" />
                <button onClick={() => setView('register')} className={rowBtn}><span className="flex items-center gap-3"><Icon n="shield_person" color="var(--brand-700)" /> {tr('pf_pdpa')}</span><span className="text-ink-3">›</span></button>
              </div>
              {/* work site selector */}
              {offices.length > 0 && (
                <div className="bg-surface rounded-[18px] shadow-[0_8px_24px_rgba(17,24,39,0.06)] mt-3.5 py-3.5 px-4">
                  <div className="flex items-center gap-3 mb-3"><Icon n="location_on" color="var(--brand-700)" /> <span className="text-sm font-semibold">{tr('pf_worksite')}</span></div>
                  <select value={officeId} onChange={(e) => changeOffice(e.target.value)} className="w-full h-11 border border-line rounded-[10px] py-0 px-3 text-sm bg-surface">
                    <option value="">{tr('worksite_any')}</option>
                    {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              )}
              {/* language switcher */}
              <div className="bg-surface rounded-[18px] overflow-hidden shadow-[0_8px_24px_rgba(17,24,39,0.06)] mt-3.5 py-3.5 px-4">
                <div className="flex items-center gap-3 mb-3"><Icon n="translate" color="var(--brand-700)" /> <span className="text-sm font-semibold">{tr('pf_language')}</span></div>
                <div className="grid grid-cols-2 gap-2">
                  {LOCALES.map((l) => (
                    <button key={l.code} onClick={() => { pickLocale(l.code); flash(makeT(l.code)('lang_changed'), true); }} className="h-11 rounded-[10px] text-sm font-semibold cursor-pointer" style={{ border: locale === l.code ? '1.5px solid var(--brand)' : '1px solid var(--line)', background: locale === l.code ? 'var(--brand-tint)' : '#fff', color: locale === l.code ? 'var(--brand-700)' : 'var(--ink)' }}>{l.native}</button>
                  ))}
                </div>
              </div>
              <button onClick={() => { try { liff.logout(); } catch { /* not in LINE */ } location.reload(); }} className="w-full h-[50px] mt-4 border border-[#FADBDB] rounded-[14px] bg-white text-danger text-[15px] font-semibold cursor-pointer">{tr('logout')}</button>
            </div>
          </div>
        )}
      </div>

      {(toast || note) && (
        <div className="fixed bottom-[84px] left-4 right-4 flex justify-center z-[90] pointer-events-none">
          <div className="max-w-[360px] text-white rounded-xl py-[11px] px-[18px] text-[13px] font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.2)] flex items-center gap-2" style={{ background: toast?.ok ? 'var(--brand-700)' : '#333' }}>
            {toast && <Icon n={toast.ok ? 'check_circle' : 'error'} size={18} />}<span>{toast?.text ?? note}</span>
          </div>
        </div>
      )}

      <nav className="bg-surface border-t border-line pt-1.5 px-2 pb-2.5 flex">
        {([['home', 'nav_home'], ['history', 'nav_history'], ['leave', 'nav_leave'], ['profile', 'nav_profile']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setView(k as View)} className="flex-1 border-none bg-transparent cursor-pointer flex flex-col items-center gap-1 py-1.5 px-1">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={view === k ? 'var(--brand)' : 'var(--ink-3)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{navIcon(k)}</svg>
            <span className="text-[10px] font-semibold" style={{ color: view === k ? 'var(--brand)' : 'var(--ink-3)' }}>{tr(label)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
const rowBtn = 'w-full border-none bg-transparent p-4 text-sm cursor-pointer flex items-center justify-between font-[inherit] text-ink';

/** Lucide icons (stroke) for the bottom nav. */
function navIcon(k: 'home' | 'history' | 'leave' | 'profile') {
  switch (k) {
    case 'home': return <><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>;
    case 'history': return <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></>;
    case 'leave': return <><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></>;
    case 'profile': return <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>;
  }
}
