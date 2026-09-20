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

  /** Verify a LIFF/LINE-Login id_token against the platform login channel. */
  async verifyIdToken(idToken: string): Promise<LineProfile> {
    const clientId = process.env.LINE_LOGIN_CHANNEL_ID ?? '';
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
    });
    if (!res.ok) throw new Error(`LINE verify failed: ${res.status}`);
    const data = (await res.json()) as { sub: string; name?: string; email?: string };
    return { lineUserId: data.sub, name: data.name, email: data.email };
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
