import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db, tenantLineChannels } from '@poszee/db';
import { CryptoService } from '../../common/crypto/crypto.service';

export interface LineProfile {
  lineUserId: string;
  name?: string;
  email?: string;
}

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
      hasAccessToken: !!ch?.accessTokenEnc,
    };
  }

  /** Upsert the tenant's LINE channel. Secret/token encrypted; blanks don't wipe. */
  async saveSettings(
    tenantId: string,
    dto: {
      loginChannelId?: string;
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
    const endpointUrl = 'https://hr.poszee.com/liff/';
    const ch = await this.getChannel(tenantId);
    if (!ch?.accessTokenEnc) return { ok: false, reason: 'ยังไม่ได้ตั้งค่า Access Token' };
    const token = this.crypto.decrypt(ch.accessTokenEnc);
    const auth = { authorization: `Bearer ${token}` };

    // 1) reuse an existing LIFF app pointing at our endpoint, if any
    const norm = (u: string) => u.replace(/\/+$/, '');
    const lr = await fetch('https://api.line.me/liff/v1/apps', { headers: auth });
    if (!lr.ok) return { ok: false, reason: `อ่านรายการ LIFF ไม่ได้ (${lr.status}): ${await lr.text()}` };
    const apps = ((await lr.json()) as { apps?: { liffId: string; view?: { url?: string } }[] }).apps ?? [];
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

    // 4) persist so /line/config and id_token verification use the real values
    await this.saveSettings(tenantId, { liffId, loginChannelId: channelId, channelId });
    return { ok: true, liffId, channelId, created, endpointUrl };
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
