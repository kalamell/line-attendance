import liff from '@line/liff';
import { api } from './api';

let ready: Promise<void> | null = null;

// Model B: each tenant has its own LIFF app. Fetch the tenant's liffId
// (resolved by subdomain / x-tenant) before init, instead of a build-time constant.
export function initLiff(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      let liffId = import.meta.env.VITE_LIFF_ID as string | undefined;
      try {
        const cfg = await api<{ liffId: string | null }>('/line/config');
        if (cfg.liffId) liffId = cfg.liffId;
      } catch {
        /* fall back to build-time id */
      }
      if (!liffId) {
        console.warn('no LIFF id configured for this tenant');
        return;
      }
      await liff.init({ liffId });
      if (!liff.isLoggedIn()) liff.login();
    })().catch((e) => console.error('LIFF init failed', e));
  }
  return ready;
}

export function getIdToken(): string | null {
  // liff.getIDToken() throws "liffId is necessary" if called before init — never
  // let that bubble into React render.
  try {
    return liff.getIDToken();
  } catch {
    return null;
  }
}

export function isInClient(): boolean {
  try {
    return liff.isInClient();
  } catch {
    return false;
  }
}

export async function getProfile(): Promise<{ displayName?: string; pictureUrl?: string } | null> {
  try {
    const p = await liff.getProfile();
    return { displayName: p.displayName, pictureUrl: p.pictureUrl };
  } catch {
    return null;
  }
}

export { liff };
