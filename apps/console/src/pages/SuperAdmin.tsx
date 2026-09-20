import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Tenant = {
  id: string;
  name: string;
  subdomain: string;
  plan: string;
  status: string;
  createdAt: string;
};

export function SuperAdminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setTenants(await api<Tenant[]>('/tenants'));
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function createDemo() {
    const name = prompt('ชื่อหน่วยงาน');
    const subdomain = prompt('รหัสหน่วยงาน (subdomain)');
    if (!name || !subdomain) return;
    try {
      await api('/tenants', { method: 'POST', body: JSON.stringify({ name, subdomain }) });
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>หน่วยงานทั้งหมด</h2>
        <button
          onClick={createDemo}
          style={{ marginLeft: 'auto', border: 'none', background: '#06C755', color: '#fff', fontWeight: 600, padding: '10px 16px', borderRadius: 10, cursor: 'pointer' }}
        >
          + สร้างหน่วยงาน
        </button>
      </div>
      {error && <p style={{ color: '#D93838' }}>{error} — (ต้องล็อกอินเป็น super_admin ก่อน)</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#9AA0A6', fontSize: 13 }}>
            <th style={{ padding: 8 }}>หน่วยงาน</th>
            <th style={{ padding: 8 }}>แพ็กเกจ</th>
            <th style={{ padding: 8 }}>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.id} style={{ borderTop: '1px solid #F2F3F5' }}>
              <td style={{ padding: 8 }}>
                {t.name}
                <div style={{ fontSize: 12, color: '#9AA0A6' }}>{t.subdomain}.poszee.com</div>
              </td>
              <td style={{ padding: 8 }}>{t.plan}</td>
              <td style={{ padding: 8 }}>{t.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
