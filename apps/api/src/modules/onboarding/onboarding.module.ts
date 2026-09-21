import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { aliasedTable, and, desc, eq, ne } from 'drizzle-orm';
import { db, lineOnboarding, users } from '@poszee/db';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { TenantId } from '../../common/tenant/tenant.decorator';
import { LineModule } from '../line/line.module';
import { LineService } from '../line/line.service';

const LIFF_URL = 'https://hr.poszee.com/liff/';

@Injectable()
export class OnboardingService {
  constructor(private readonly line: LineService) {}

  private async lineUserFromToken(tenantId: string, idToken: string) {
    const ch = await this.line.getChannel(tenantId);
    return this.line.verifyIdToken(idToken, ch?.loginChannelId ?? undefined);
  }

  /** LIFF: a new employee tapped the rich-menu entry — record them as incoming. */
  async checkin(tenantId: string, idToken: string, displayName?: string, pictureUrl?: string) {
    const profile = await this.lineUserFromToken(tenantId, idToken);
    const lineUserId = profile.lineUserId;

    const [linkedUser] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.lineUserId, lineUserId)))
      .limit(1);
    if (linkedUser) return { status: 'linked' as const, name: linkedUser.name };

    const [row] = await db
      .select()
      .from(lineOnboarding)
      .where(and(eq(lineOnboarding.tenantId, tenantId), eq(lineOnboarding.lineUserId, lineUserId)))
      .limit(1);
    if (row) {
      await db
        .update(lineOnboarding)
        .set({ displayName: displayName ?? row.displayName, pictureUrl: pictureUrl ?? row.pictureUrl, updatedAt: new Date() })
        .where(eq(lineOnboarding.id, row.id));
      return { status: row.status };
    }
    await db.insert(lineOnboarding).values({
      tenantId,
      lineUserId,
      displayName: displayName ?? profile.name ?? null,
      pictureUrl: pictureUrl ?? null,
    });
    return { status: 'incoming' as const };
  }

  /** LIFF: employee tapped the confirm button in the Flex card. */
  async confirm(tenantId: string, idToken: string) {
    const profile = await this.lineUserFromToken(tenantId, idToken);
    const [row] = await db
      .select()
      .from(lineOnboarding)
      .where(and(eq(lineOnboarding.tenantId, tenantId), eq(lineOnboarding.lineUserId, profile.lineUserId)))
      .limit(1);
    if (!row) throw new NotFoundException('ยังไม่พบรายการเริ่มใช้งาน');
    if (row.status !== 'linked') {
      await db.update(lineOnboarding).set({ status: 'confirmed', updatedAt: new Date() }).where(eq(lineOnboarding.id, row.id));
    }
    return { ok: true, status: row.status === 'linked' ? 'linked' : 'confirmed' };
  }

  /** HR: list onboarding contacts (newest first), with the matched employee name if any. */
  list(tenantId: string) {
    const linked = aliasedTable(users, 'linked');
    return db
      .select({
        id: lineOnboarding.id,
        lineUserId: lineOnboarding.lineUserId,
        displayName: lineOnboarding.displayName,
        pictureUrl: lineOnboarding.pictureUrl,
        status: lineOnboarding.status,
        linkedUserId: lineOnboarding.linkedUserId,
        linkedUserName: linked.name,
        createdAt: lineOnboarding.createdAt,
        updatedAt: lineOnboarding.updatedAt,
      })
      .from(lineOnboarding)
      .leftJoin(linked, eq(linked.id, lineOnboarding.linkedUserId))
      .where(eq(lineOnboarding.tenantId, tenantId))
      .orderBy(desc(lineOnboarding.updatedAt));
  }

  private async row(tenantId: string, id: string) {
    const [r] = await db
      .select()
      .from(lineOnboarding)
      .where(and(eq(lineOnboarding.tenantId, tenantId), eq(lineOnboarding.id, id)))
      .limit(1);
    if (!r) throw new NotFoundException('ไม่พบรายการ');
    return r;
  }

  /** HR: push the identity-confirmation Flex card to this LINE user. */
  async sendFlex(tenantId: string, id: string) {
    const r = await this.row(tenantId, id);
    const flex = {
      type: 'flex',
      altText: 'ยืนยันตัวตนเพื่อเริ่มใช้งานระบบลงเวลา',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            { type: 'text', text: 'ยืนยันตัวตน', weight: 'bold', size: 'xl', color: '#06C755' },
            { type: 'text', text: 'ฝ่ายบุคคลกำลังยืนยันตัวตนของคุณเพื่อเริ่มใช้งานระบบลงเวลา กดปุ่มด้านล่างเพื่อยืนยัน', wrap: true, size: 'sm', color: '#555555' },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#06C755',
              action: { type: 'uri', label: 'ยืนยันตัวตน', uri: `${LIFF_URL}?onboard=confirm` },
            },
          ],
        },
      },
    };
    await this.line.push(tenantId, r.lineUserId, [flex]);
    if (r.status === 'incoming') {
      await db.update(lineOnboarding).set({ status: 'flex_sent', updatedAt: new Date() }).where(eq(lineOnboarding.id, r.id));
    }
    return { ok: true };
  }

  /** HR: match this LINE user to an existing employee record and bind the account. */
  async link(tenantId: string, id: string, userId: string) {
    const r = await this.row(tenantId, id);
    const [emp] = await db
      .select({ id: users.id, lineUserId: users.lineUserId })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)))
      .limit(1);
    if (!emp) throw new NotFoundException('ไม่พบพนักงาน');

    // guard: this LINE id must not already belong to a different employee
    const [clash] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.lineUserId, r.lineUserId), ne(users.id, userId)))
      .limit(1);
    if (clash) throw new BadRequestException('LINE นี้ถูกผูกกับพนักงานคนอื่นแล้ว');

    await db.update(users).set({ lineUserId: r.lineUserId }).where(eq(users.id, userId));
    await db.update(lineOnboarding).set({ status: 'linked', linkedUserId: userId, updatedAt: new Date() }).where(eq(lineOnboarding.id, r.id));
    return { ok: true };
  }

  async reject(tenantId: string, id: string) {
    const r = await this.row(tenantId, id);
    await db.update(lineOnboarding).set({ status: 'rejected', updatedAt: new Date() }).where(eq(lineOnboarding.id, r.id));
    return { ok: true };
  }
}

class TokenDto {
  @IsString() idToken!: string;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() pictureUrl?: string;
}
class LinkDto {
  @IsString() userId!: string;
}

/** LIFF (public; tenant resolved from x-tenant / subdomain). */
@Controller('line/onboarding')
class OnboardingPublicController {
  constructor(private readonly svc: OnboardingService) {}

  @Post('checkin')
  checkin(@TenantId() tenantId: string, @Body() dto: TokenDto) {
    return this.svc.checkin(tenantId, dto.idToken, dto.displayName, dto.pictureUrl);
  }

  @Post('confirm')
  confirm(@TenantId() tenantId: string, @Body() dto: TokenDto) {
    return this.svc.confirm(tenantId, dto.idToken);
  }
}

/** HR console. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('org_admin')
@Controller('line/onboarding/manage')
class OnboardingManageController {
  constructor(private readonly svc: OnboardingService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.svc.list(tenantId);
  }

  @Post(':id/send-flex')
  sendFlex(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.svc.sendFlex(tenantId, id);
  }

  @Post(':id/link')
  link(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: LinkDto) {
    return this.svc.link(tenantId, id, dto.userId);
  }

  @Post(':id/reject')
  reject(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.svc.reject(tenantId, id);
  }
}

@Module({
  imports: [LineModule],
  providers: [OnboardingService],
  controllers: [OnboardingPublicController, OnboardingManageController],
})
export class OnboardingModule {}
