const TOKEN_KEY = 'poszee_token';
const USER_KEY = 'poszee_user';

export function isAuthed(): boolean {
  return !!localStorage.getItem(TOKEN_KEY);
}

export function currentUser(): { name: string; role: string } | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  location.reload();
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) headers.set('authorization', `Bearer ${t}`);

  const res = await fetch(`/api${path}`, { ...init, headers });
  // Only treat 401 as an expired session when we were actually authed with a
  // token. Business validation errors use 4xx (e.g. 400) and are thrown to the
  // caller so it can show an inline message instead of logging the user out.
  if (res.status === 401 && t) {
    logout();
    throw new Error('unauthorized');
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Fetch a file (PDF) with auth and trigger a download. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const headers = new Headers();
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) headers.set('authorization', `Bearer ${t}`);
  const res = await fetch(`/api${path}`, { headers });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function login(email: string, password: string) {
  const r = await api<{ token: string; user: { name: string; role: string } }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem(TOKEN_KEY, r.token);
  localStorage.setItem(USER_KEY, JSON.stringify(r.user));
  return r.user;
}
