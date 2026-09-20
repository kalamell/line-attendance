import liff from '@line/liff';

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string | undefined;

let ready: Promise<void> | null = null;

export function initLiff(): Promise<void> {
  if (!ready) {
    ready = liff
      .init({ liffId: LIFF_ID ?? '' })
      .then(() => {
        if (!liff.isLoggedIn()) liff.login();
      })
      .catch((e) => {
        console.error('LIFF init failed', e);
      });
  }
  return ready;
}

export function getIdToken(): string | null {
  return liff.getIDToken();
}

export { liff };
