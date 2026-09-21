import { TENANT_HEADER } from '@poszee/shared';

let token: string | null = null;
export function setToken(t: string | null) {
  token = t;
}

/** Tenant is carried by subdomain in prod; overridable via VITE_TENANT for local dev. */
const TENANT = import.meta.env.VITE_TENANT as string | undefined;

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (TENANT) headers.set(TENANT_HEADER, TENANT);

  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  // Empty body (e.g. a handler returning null → no content) must not crash res.json().
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Turn an api() error (`"<status> <json>"`) into a clean Thai message for the UI. */
export function errorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const body = raw.replace(/^Error:\s*/, '').replace(/^\d+\s*/, '');
  try {
    const j = JSON.parse(body);
    if (j?.message) return Array.isArray(j.message) ? j.message.join(', ') : String(j.message);
  } catch { /* not json */ }
  return body || 'เกิดข้อผิดพลาด';
}

export type SessionUser = { id: string; name: string; role: string; active?: boolean };

/** Employee login without LINE (email + password) — used when not opened in LINE. */
export async function loginPassword(email: string, password: string): Promise<SessionUser> {
  const r = await api<{ token: string; user: SessionUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(r.token);
  return r.user;
}
