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
  if (res.status === 401) {
    logout();
    throw new Error('unauthorized');
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
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
