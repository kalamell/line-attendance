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
  return liff.getIDToken();
}

export { liff };
