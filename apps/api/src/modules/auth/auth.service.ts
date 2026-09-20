import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, isNull } from 'drizzle-orm';
import { db, users } from '@poszee/db';
import type { AuthPrincipal } from '@poszee/shared';
import { LineService } from '../line/line.service';
import { CryptoService } from '../../common/crypto/crypto.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly line: LineService,
    private readonly jwt: JwtService,
    private readonly crypto: CryptoService,
  ) {}

  private sign(user: typeof users.$inferSelect) {
    const principal: AuthPrincipal = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      lineUserId: user.lineUserId ?? undefined,
    };
    return {
      token: this.jwt.sign(principal),
      user: { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId },
    };
  }

  /** Console login (super_admin / org_admin / supervisor) by email + password. */
  async loginWithPassword(email: string, password: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user?.passwordHash || !this.crypto.verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }
    return this.sign(user);
  }

  /** Employee login from LIFF (Model B: verify against the tenant's LINE Login channel). */
  async loginWithLine(tenantId: string | null, idToken: string) {
    const channel = tenantId ? await this.line.getChannel(tenantId) : null;
    const profile = await this.line.verifyIdToken(idToken, channel?.loginChannelId ?? undefined);

    const where = tenantId
      ? and(eq(users.tenantId, tenantId), eq(users.lineUserId, profile.lineUserId))
      : and(isNull(users.tenantId), eq(users.lineUserId, profile.lineUserId));
    let [user] = await db.select().from(users).where(where).limit(1);

    if (!user) {
      if (!tenantId) throw new UnauthorizedException('no platform account for this LINE user');
      [user] = await db
        .insert(users)
        .values({
          tenantId,
          role: 'employee',
          name: profile.name ?? 'พนักงานใหม่',
          lineUserId: profile.lineUserId,
          email: profile.email,
          active: false,
        })
        .returning();
    }
    return this.sign(user);
  }
}
