import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type LeaveRow = { id: string; type: string; startDate: string; endDate: string; days: string; reason?: string };

export function HrPage() {
  const [pending, setPending] = useState<LeaveRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setPending(await api<LeaveRow[]>('/leave/pending'));
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function decide(id: string, approve: boolean) {
    try {
      await api(`/leave/${id}/decision`, { method: 'POST', body: JSON.stringify({ approve }) });
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section>
      <h2>อนุมัติการลา (รออนุมัติ)</h2>
      {error && <p style={{ color: '#D93838' }}>{error} — (ต้องล็อกอินเป็น supervisor/hr)</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pending.map((r) => (
          <div key={r.id} style={{ border: '1px solid #ECEEF1', borderRadius: 12, padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <strong>{r.type}</strong> · {r.startDate} → {r.endDate} ({r.days} วัน)
              <div style={{ fontSize: 12, color: '#9AA0A6' }}>{r.reason}</div>
            </div>
            <button onClick={() => decide(r.id, true)} style={{ border: 'none', background: '#06C755', color: '#fff', fontWeight: 600, padding: '8px 14px', borderRadius: 9, cursor: 'pointer' }}>
              อนุมัติ
            </button>
            <button onClick={() => decide(r.id, false)} style={{ border: '1px solid #FADBDB', background: '#fff', color: '#D93838', fontWeight: 600, padding: '8px 14px', borderRadius: 9, cursor: 'pointer' }}>
              ปฏิเสธ
            </button>
          </div>
        ))}
        {pending.length === 0 && !error && <p style={{ color: '#9AA0A6' }}>ไม่มีคำขอค้างอนุมัติ</p>}
      </div>
      {/* TODO: employment approval, payroll & payslip pages — see design canvas (AdminDashboard.dc.html) */}
    </section>
  );
}
