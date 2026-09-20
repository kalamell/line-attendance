import { useEffect, useState } from 'react';
import { initLiff, getIdToken } from './lib/liff';
import { api, setToken } from './lib/api';

type LoginResp = { token: string; user: { id: string; name: string; role: string; active: boolean } };
type Attendance = { status: string; checkInAt: string | null; checkOutAt: string | null } | null;

export function App() {
  const [me, setMe] = useState<LoginResp['user'] | null>(null);
  const [today, setToday] = useState<Attendance>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await initLiff();
      const idToken = getIdToken();
      if (!idToken) return;
      try {
        const res = await api<LoginResp>('/auth/line/login', {
          method: 'POST',
          body: JSON.stringify({ idToken }),
        });
        setToken(res.token);
        setMe(res.user);
        setToday(await api<Attendance>('/attendance/today'));
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  async function punch() {
    setBusy(true);
    setError(null);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true }),
      );
      const body = JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      const path = today?.checkInAt && !today.checkOutAt ? '/attendance/check-out' : '/attendance/check-in';
      const method = 'POST';
      const rec = await api<NonNullable<Attendance>>(path, { method, body: path.endsWith('check-in') ? body : undefined });
      setToday(rec);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const checkedIn = !!today?.checkInAt && !today?.checkOutAt;
  const done = !!today?.checkOutAt;

  return (
    <main style={{ fontFamily: 'IBM Plex Sans Thai, system-ui, sans-serif', maxWidth: 390, margin: '0 auto', padding: 20 }}>
      <h1 style={{ fontSize: 20 }}>TimeLine</h1>
      <p style={{ color: '#5B6167' }}>{me ? `สวัสดี, ${me.name}` : 'กำลังเข้าสู่ระบบ…'}</p>

      <button
        onClick={punch}
        disabled={busy || done || !me}
        style={{
          width: 168,
          height: 168,
          borderRadius: '50%',
          border: 'none',
          color: '#fff',
          fontSize: 17,
          fontWeight: 700,
          cursor: 'pointer',
          background: done ? '#9AA0A6' : checkedIn ? '#F59E0B' : '#06C755',
        }}
      >
        {done ? 'เสร็จสิ้นวันนี้' : checkedIn ? 'เช็คเอาท์ออกงาน' : 'เช็คอินเข้างาน'}
      </button>

      {today?.checkInAt && <p style={{ color: '#04933D' }}>เข้างาน {new Date(today.checkInAt).toLocaleTimeString('th-TH')}</p>}
      {error && <p style={{ color: '#D93838', fontSize: 12 }}>{error}</p>}
      {/* TODO: history / leave / payslip tabs — see design canvas (Main.dc.html, Payslip.dc.html) */}
    </main>
  );
}
