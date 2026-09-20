import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, isNull } from 'drizzle-orm';
import { db, users } from '@poszee/db';
import type { AuthPrincipal } from '@poszee/shared';
import { LineService } from '../line/line.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly line: LineService,
    private readonly jwt: JwtService,
  ) {}

  /** Employee/HR login from LIFF: verify id_token, resolve (or provision) the user, issue JWT. */
  async loginWithLine(tenantId: string | null, idToken: string) {
    const profile = await this.line.verifyIdToken(idToken);

    const where = tenantId
      ? and(eq(users.tenantId, tenantId), eq(users.lineUserId, profile.lineUserId))
      : and(isNull(users.tenantId), eq(users.lineUserId, profile.lineUserId));
    let [user] = await db.select().from(users).where(where).limit(1);

    if (!user) {
      if (!tenantId) throw new UnauthorizedException('no platform account for this LINE user');
      // auto-provision as an employee pending HR onboarding
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

    const principal: AuthPrincipal = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      lineUserId: user.lineUserId ?? undefined,
    };
    return {
      token: this.jwt.sign(principal),
      user: { id: user.id, name: user.name, role: user.role, active: user.active },
    };
  }
}
