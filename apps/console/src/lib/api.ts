// TODO: wire real console auth (super_admin / org_admin sign-in) and attach the JWT.
const token = () => localStorage.getItem('poszee_token');

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  const t = token();
  if (t) headers.set('authorization', `Bearer ${t}`);

  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
