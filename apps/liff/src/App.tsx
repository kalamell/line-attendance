import { useEffect, useState } from 'react';
import { initLiff, getIdToken, liff } from './lib/liff';
import { api, setToken } from './lib/api';

type Me = { id: string; name: string; role: string; active: boolean };
type Attendance = { status: string; checkInAt: string | null; checkOutAt: string | null } | null;

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [today, setToday] = useState<Attendance>(null);
  const [clock, setClock] = useState('--:--:--');
  const [view, setView] = useState<'home' | 'history' | 'leave' | 'profile'>('home');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('th-TH')), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      await initLiff();
      const idToken = getIdToken();
      if (!idToken) return; // not opened in LINE — UI still renders for preview
      try {
        const r = await api<{ token: string; user: Me }>('/auth/line/login', { method: 'POST', body: JSON.stringify({ idToken }) });
        setToken(r.token);
        setMe(r.user);
        setToday(await api<Attendance>('/attendance/today'));
      } catch (e) {
        setNote(String(e));
      }
    })();
  }, []);

  async function punch() {
    if (!getIdToken()) { setNote('เปิดผ่านแอป LINE เพื่อเช็คอิน'); return; }
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true }));
      const checkedIn = !!today?.checkInAt && !today?.checkOutAt;
      const path = checkedIn ? '/attendance/check-out' : '/attendance/check-in';
      const rec = await api<NonNullable<Attendance>>(path, { method: 'POST', body: checkedIn ? undefined : JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }) });
      setToday(rec);
    } catch (e) {
      setNote(String(e));
    }
  }

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
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 22, color: done ? 'var(--ink-2)' : checkedIn ? 'var(--brand-700)' : 'var(--ink-3)' }}>
                  {done ? 'ทำงานครบวันแล้ว' : checkedIn ? `เข้างานแล้ว · ${today?.checkInAt ? fmtTime(today.checkInAt) : ''} น.` : 'ยังไม่ได้เช็คอินวันนี้'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button onClick={punch} disabled={done}
                    style={{ width: 168, height: 168, borderRadius: '50%', border: 'none', fontSize: 17, fontWeight: 700, cursor: done ? 'default' : 'pointer',
                      background: done ? '#EEF0F3' : checkedIn ? 'radial-gradient(circle at 50% 35%,#FFB43D,#F59E0B)' : 'radial-gradient(circle at 50% 35%,#12D866,#06C755)',
                      color: done ? 'var(--ink-3)' : '#fff', boxShadow: done ? 'none' : '0 14px 34px rgba(6,199,85,0.42)' }}>
                    {done ? 'เสร็จสิ้นวันนี้' : checkedIn ? 'เช็คเอาท์ออกงาน' : 'เช็คอินเข้างาน'}
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--brand-tint)', border: '1px solid #C9F0DA', borderRadius: 14, padding: '12px 14px', marginTop: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                </div>
                <div><div style={{ fontSize: 13, fontWeight: 600 }}>สำนักงานใหญ่ อโศก</div><div style={{ fontSize: 11, color: 'var(--brand-700)', fontWeight: 500 }}>✓ อยู่ในพื้นที่ทำงาน</div></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 16 }}><div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>ชั่วโมงสัปดาห์นี้</div><div style={{ fontSize: 24, fontWeight: 700 }}>32.5<span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 500 }}> / 40 ชม.</span></div></div>
                <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 16 }}><div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>มาสายเดือนนี้</div><div style={{ fontSize: 24, fontWeight: 700 }}>2<span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 500 }}> ครั้ง</span></div></div>
              </div>
            </div>
          </>
        )}

        {view === 'history' && (
          <div style={{ padding: 16 }}>
            <h2 style={{ fontSize: 20, margin: '6px 4px 16px' }}>ประวัติการเข้างาน</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 18 }}>
              {[['18', 'ปกติ', 'var(--brand-700)', 'var(--brand-tint)'], ['2', 'สาย', 'var(--warn)', 'var(--warn-tint)'], ['0', 'ขาด', 'var(--danger)', '#FDECEC'], ['1', 'ลา', 'var(--info)', '#EAF1FE']].map((c, i) => (
                <div key={i} style={{ background: c[3], borderRadius: 14, padding: '12px 4px', textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: c[2] }}>{c[0]}</div><div style={{ fontSize: 11, color: c[2], fontWeight: 500 }}>{c[1]}</div></div>
              ))}
            </div>
            {[['09', 'พ.', '08:32 → 17:45', 'ปกติ'], ['08', 'อ.', '09:12 → 18:02', 'สาย'], ['07', 'จ.', '08:05 → 17:30', 'ปกติ']].map((r, i) => (
              <div key={i} style={{ background: 'var(--surface)', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 16, fontWeight: 700 }}>{r[0]}</span><span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{r[1]}</span></div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{r[2]}</div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)' }}>{r[3]}</span>
              </div>
            ))}
          </div>
        )}

        {view === 'leave' && (
          <div style={{ padding: 16 }}>
            <h2 style={{ fontSize: 20, margin: '6px 4px 16px' }}>ลางาน</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
              {[['28', 'ลาป่วย', 'var(--danger)', '#FDECEC'], ['3', 'ลากิจ', 'var(--info)', '#EAF1FE'], ['6', 'พักร้อน', 'var(--brand-700)', 'var(--brand-tint)']].map((c, i) => (
                <div key={i} style={{ background: c[3], borderRadius: 16, padding: '14px 8px', textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: c[2] }}>{c[0]}</div><div style={{ fontSize: 11, color: c[2], fontWeight: 500 }}>{c[1]}</div></div>
              ))}
            </div>
            <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 18, color: 'var(--ink-2)', fontSize: 13 }}>ยื่นคำขอลาได้จากที่นี่ (แบบฟอร์มเชื่อมกับระบบอนุมัติของหัวหน้างาน)</div>
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
              <div style={{ background: 'var(--surface)', borderRadius: 18, padding: 16, boxShadow: '0 8px 24px rgba(17,24,39,0.06)' }}>
                <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>เปิดผ่านแอป LINE เพื่อเข้าสู่ระบบและใช้งานเต็มรูปแบบ</div>
              </div>
              <button onClick={() => { try { liff.logout(); } catch { /* not in LINE */ } location.reload(); }}
                style={{ width: '100%', height: 50, marginTop: 16, border: '1px solid #FADBDB', borderRadius: 14, background: '#fff', color: 'var(--danger)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>ออกจากระบบ</button>
            </div>
          </div>
        )}
      </div>

      {note && <div style={{ position: 'fixed', bottom: 76, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: 'var(--danger)' }}>{note}</div>}

      <nav style={{ background: 'var(--surface)', borderTop: '1px solid var(--line)', padding: '6px 8px 10px', display: 'flex' }}>
        {([
          ['home', 'หน้าหลัก', 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
          ['history', 'ประวัติ', 'M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8'],
          ['leave', 'ลางาน', 'M8 2v4M16 2v4M3 10h18'],
          ['profile', 'โปรไฟล์', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'],
        ] as const).map(([k, label, d]) => (
          <button key={k} onClick={() => setView(k)} style={{ flex: 1, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 4px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={view === k ? 'var(--brand)' : 'var(--ink-3)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
            <span style={{ fontSize: 10, fontWeight: 600, color: view === k ? 'var(--brand)' : 'var(--ink-3)' }}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
