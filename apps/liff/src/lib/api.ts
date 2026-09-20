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
  return (await res.json()) as T;
}
