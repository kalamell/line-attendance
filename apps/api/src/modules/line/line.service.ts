import { Injectable, Logger } from '@nestjs/common';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db, tenantLineChannels, users } from '@poszee/db';
import { CryptoService } from '../../common/crypto/crypto.service';
import { RICH_MENU_PNG_BASE64, RICH_MENU_ONBOARD_PNG_BASE64 } from './richmenu-image';

export interface LineProfile {
  lineUserId: string;
  name?: string;
  email?: string;
}

const LINE_LIFF_URL = 'https://hr.poszee.com/liff/';

@Injectable()
export class LineService {
  private readonly log = new Logger(LineService.name);

  constructor(private readonly crypto: CryptoService) {}

  /**
   * Verify a LIFF/LINE-Login id_token. In Model B the client_id is the TENANT's
   * LINE Login channel id; falls back to the platform env for single-channel setups.
   */
  async verifyIdToken(idToken: string, clientId?: string): Promise<LineProfile> {
    const cid = clientId || process.env.LINE_LOGIN_CHANNEL_ID || '';
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: cid }),
    });
    if (!res.ok) throw new Error(`LINE verify failed: ${res.status}`);
    const data = (await res.json()) as { sub: string; name?: string; email?: string };
    return { lineUserId: data.sub, name: data.name, email: data.email };
  }

  /** Public per-tenant LIFF config the frontend needs before liff.init(). */
  async publicConfig(tenantId: string): Promise<{ liffId: string | null; connected: boolean }> {
    const ch = await this.getChannel(tenantId);
    return { liffId: ch?.liffId ?? null, connected: ch?.connected ?? false };
  }

  /** Admin view of the tenant's LINE settings — never returns decrypted secrets. */
  async getSettings(tenantId: string) {
    const ch = await this.getChannel(tenantId);
    return {
      loginChannelId: ch?.loginChannelId ?? null,
      channelId: ch?.channelId ?? null,
      liffId: ch?.liffId ?? null,
      connected: ch?.connected ?? false,
      features: ch?.features ?? { richMenu: true, notifyPush: true, sendSlip: true },
      hasChannelSecret: !!ch?.channelSecretEnc,
      hasLoginChannelSecret: !!ch?.loginChannelSecretEnc,
      hasAccessToken: !!ch?.accessTokenEnc,
    };
  }

  /** Upsert the tenant's LINE channel. Secret/token encrypted; blanks don't wipe. */
  async saveSettings(
    tenantId: string,
    dto: {
      loginChannelId?: string;
      loginChannelSecret?: string;
      channelId?: string;
      channelSecret?: string;
      accessToken?: string;
      liffId?: string;
      features?: { richMenu: boolean; notifyPush: boolean; sendSlip: boolean };
    },
  ) {
    const existing = await this.getChannel(tenantId);
    const patch: Record<string, unknown> = {};
    if (dto.loginChannelId !== undefined) patch.loginChannelId = dto.loginChannelId;
    if (dto.channelId !== undefined) patch.channelId = dto.channelId;
    if (dto.liffId !== undefined) patch.liffId = dto.liffId;
    if (dto.loginChannelSecret) patch.loginChannelSecretEnc = this.crypto.encrypt(dto.loginChannelSecret);
    if (dto.channelSecret) patch.channelSecretEnc = this.crypto.encrypt(dto.channelSecret);
    if (dto.accessToken) patch.accessTokenEnc = this.crypto.encrypt(dto.accessToken);
    if (dto.features) patch.features = dto.features;
    patch.connected = !!(patch.accessTokenEnc ?? existing?.accessTokenEnc);

    if (existing) {
      await db.update(tenantLineChannels).set(patch).where(eq(tenantLineChannels.tenantId, tenantId));
    } else {
      await db.insert(tenantLineChannels).values({ tenantId, ...patch });
    }
    return this.getSettings(tenantId);
  }

  /** Verify the stored access token by calling LINE's bot info endpoint. */
  async testConnection(tenantId: string) {
    const ch = await this.getChannel(tenantId);
    if (!ch?.accessTokenEnc) return { ok: false, reason: 'ยังไม่ได้ตั้งค่า Access Token' };
    const token = this.crypto.decrypt(ch.accessTokenEnc);
    const res = await fetch('https://api.line.me/v2/bot/info', {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { ok: false, reason: `LINE ตอบกลับ ${res.status}` };
    const info = (await res.json()) as { displayName?: string; basicId?: string };
    return { ok: true, botName: info.displayName, basicId: info.basicId };
  }

  /**
   * Auto-provision LINE login for a tenant using its stored Messaging API access
   * token: derive the channel id from the token, reuse or create a LIFF app at our
   * production endpoint, then persist liffId + loginChannelId. Idempotent.
   */
  async provisionLiff(tenantId: string) {
    const endpointUrl = LINE_LIFF_URL;
    const ch = await this.getChannel(tenantId);

    // LIFF/LINE-Login lives on the LINE Login channel (needs a Web app type). If its
    // secret is set, mint a token via client_credentials; else fall back to the
    // Messaging API token (only works if that channel itself has a Web/LIFF app type).
    let token: string;
    let via: 'login' | 'messaging';
    if (ch?.loginChannelId && ch?.loginChannelSecretEnc) {
      const secret = this.crypto.decrypt(ch.loginChannelSecretEnc);
      const tr = await fetch('https://api.line.me/v2/oauth/accessToken', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: ch.loginChannelId, client_secret: secret }),
      });
      if (!tr.ok) return { ok: false, reason: `ขอ token จาก Login channel ไม่สำเร็จ (${tr.status}): ${await tr.text()}` };
      token = ((await tr.json()) as { access_token: string }).access_token;
      via = 'login';
    } else if (ch?.accessTokenEnc) {
      token = this.crypto.decrypt(ch.accessTokenEnc);
      via = 'messaging';
    } else {
      return { ok: false, reason: 'ยังไม่ได้ตั้งค่า Access Token หรือ Login Channel Secret' };
    }
    const auth = { authorization: `Bearer ${token}` };

    // 1) reuse an existing LIFF app pointing at our endpoint, if any.
    //    404 = the channel simply has no LIFF apps yet (treat as empty).
    const norm = (u: string) => u.replace(/\/+$/, '');
    const lr = await fetch('https://api.line.me/liff/v1/apps', { headers: auth });
    if (!lr.ok && lr.status !== 404) return { ok: false, reason: `อ่านรายการ LIFF ไม่ได้ (${lr.status}): ${await lr.text()}` };
    const apps = lr.ok ? (((await lr.json()) as { apps?: { liffId: string; view?: { url?: string } }[] }).apps ?? []) : [];
    let liffId = apps.find((a) => norm(a.view?.url ?? '') === norm(endpointUrl))?.liffId ?? null;
    let created = false;

    // 2) otherwise create it
    if (!liffId) {
      const cr = await fetch('https://api.line.me/liff/v1/apps', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...auth },
        body: JSON.stringify({
          view: { type: 'full', url: endpointUrl },
          description: 'TimeLine Attendance',
          permanentLinkPattern: 'concat',
          scope: ['openid', 'profile'],
          botPrompt: 'none',
        }),
      });
      if (!cr.ok) return { ok: false, reason: `สร้าง LIFF ไม่สำเร็จ (${cr.status}): ${await cr.text()}` };
      liffId = ((await cr.json()) as { liffId: string }).liffId;
      created = true;
    }

    // 3) the LIFF ID is `{channelId}-{suffix}` — the id_token audience is that channel,
    //    so derive loginChannelId from the prefix (no oauth/verify needed).
    const channelId = liffId.split('-')[0];

    // 4) persist so /line/config and id_token verification use the real values.
    //    When provisioned via the Login channel, keep the Messaging channelId intact.
    await this.saveSettings(
      tenantId,
      via === 'login' ? { liffId, loginChannelId: channelId } : { liffId, loginChannelId: channelId, channelId },
    );
    return { ok: true, liffId, channelId, created, via, endpointUrl };
  }

  /**
   * Create two rich menus and set the onboarding one as default:
   *  - "เริ่มใช้งาน" (default, for new/unlinked users) — one area -> LIFF checkin
   *  - "สมาชิก" (เช็คอิน/สลิป/ลางาน) — assigned per-user after HR links them
   * Uses the Messaging API access token (works without the LIFF app-type).
   */
  async provisionRichMenu(tenantId: string) {
    const ch = await this.getChannel(tenantId);
    if (!ch?.accessTokenEnc) return { ok: false, reason: 'ยังไม่ได้ตั้งค่า Access Token' };
    const token = this.crypto.decrypt(ch.accessTokenEnc);
    const auth = { authorization: `Bearer ${token}` };
    const W = 2500, H = 843, third = Math.round(W / 3);
    // Rich menu must open the LIFF launch URL (liff.line.me/{liffId}), NOT the raw
    // web URL — otherwise LINE opens it as a plain page with no LIFF context and
    // the app can't get the LINE session (falls back to email/password login).
    const liffBase = ch.liffId ? `https://liff.line.me/${ch.liffId}` : LINE_LIFF_URL;
    const area = (x: number, w: number, uri: string) => ({ bounds: { x, y: 0, width: w, height: H }, action: { type: 'uri', uri } });

    const createMenu = async (name: string, chatBarText: string, areas: unknown[], pngB64: string): Promise<string> => {
      const cr = await fetch('https://api.line.me/v2/bot/richmenu', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...auth },
        body: JSON.stringify({ size: { width: W, height: H }, selected: true, name, chatBarText, areas }),
      });
      if (!cr.ok) throw new Error(`สร้าง rich menu "${name}" ไม่สำเร็จ (${cr.status}): ${await cr.text()}`);
      const id = ((await cr.json()) as { richMenuId: string }).richMenuId;
      const up = await fetch(`https://api-data.line.me/v2/bot/richmenu/${id}/content`, {
        method: 'POST',
        headers: { 'content-type': 'image/png', ...auth },
        body: Buffer.from(pngB64, 'base64'),
      });
      if (!up.ok) throw new Error(`อัปโหลดรูป "${name}" ไม่สำเร็จ (${up.status}): ${await up.text()}`);
      return id;
    };

    try {
      // remove old menus so re-provisioning doesn't pile up
      const list = await fetch('https://api.line.me/v2/bot/richmenu/list', { headers: auth });
      if (list.ok) {
        const olds = ((await list.json()) as { richmenus?: { richMenuId: string }[] }).richmenus ?? [];
        await Promise.all(olds.map((m) => fetch(`https://api.line.me/v2/bot/richmenu/${m.richMenuId}`, { method: 'DELETE', headers: auth })));
      }

      const onboardId = await createMenu('TimeLine เริ่มใช้งาน', 'เริ่มใช้งาน', [area(0, W, `${liffBase}?onboard=start`)], RICH_MENU_ONBOARD_PNG_BASE64);
      const memberId = await createMenu('TimeLine เมนูสมาชิก', 'เมนู', [
        area(0, third, `${liffBase}?tab=home`),
        area(third, third, `${liffBase}?tab=payslip`),
        area(third * 2, W - third * 2, `${liffBase}?tab=leave`),
      ], RICH_MENU_PNG_BASE64);

      // onboarding menu is the default everyone sees first
      const sr = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${onboardId}`, { method: 'POST', headers: auth });
      if (!sr.ok) return { ok: false, reason: `ตั้ง default rich menu ไม่สำเร็จ (${sr.status}): ${await sr.text()}` };

      await db.update(tenantLineChannels).set({ richMenuIds: { default: onboardId, member: memberId } }).where(eq(tenantLineChannels.tenantId, tenantId));

      // re-assign the (new) member menu to already-linked employees so a re-provision
      // doesn't drop them back to the onboarding menu
      const linked = await db
        .select({ lineUserId: users.lineUserId })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), isNotNull(users.lineUserId)));
      let reassigned = 0;
      for (const u of linked) {
        if (!u.lineUserId) continue;
        const rr = await fetch(`https://api.line.me/v2/bot/user/${u.lineUserId}/richmenu/${memberId}`, { method: 'POST', headers: auth });
        if (rr.ok) reassigned++;
      }
      return { ok: true, defaultRichMenuId: onboardId, memberRichMenuId: memberId, reassigned };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Assign a specific user the member rich menu (called after HR links them). */
  async assignMemberRichMenu(tenantId: string, lineUserId: string): Promise<void> {
    const ch = await this.getChannel(tenantId);
    const memberId = ch?.richMenuIds?.member;
    if (!ch?.accessTokenEnc || !memberId) return;
    const token = this.crypto.decrypt(ch.accessTokenEnc);
    const res = await fetch(`https://api.line.me/v2/bot/user/${lineUserId}/richmenu/${memberId}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) this.log.warn(`assign member rich menu failed ${res.status}: ${await res.text()}`);
  }

  async getChannel(tenantId: string) {
    const [ch] = await db
      .select()
      .from(tenantLineChannels)
      .where(eq(tenantLineChannels.tenantId, tenantId))
      .limit(1);
    return ch ?? null;
  }

  /** Push messages via the tenant's own Messaging API channel (token decrypted at use). */
  async push(tenantId: string, to: string, messages: unknown[]): Promise<void> {
    const ch = await this.getChannel(tenantId);
    if (!ch?.connected || !ch.accessTokenEnc) {
      this.log.warn(`tenant ${tenantId}: LINE channel not connected — push skipped`);
      return;
    }
    const token = this.crypto.decrypt(ch.accessTokenEnc);
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages }),
    });
    if (!res.ok) this.log.error(`LINE push failed ${res.status}: ${await res.text()}`);
  }
}
