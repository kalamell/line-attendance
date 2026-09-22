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

  /** LIFF: a new employee tapped the rich-menu entry — record them as incoming.
   *  `locale` is their chosen language: stored and used to switch their rich menu. */
  async checkin(tenantId: string, idToken: string, displayName?: string, pictureUrl?: string, locale?: string) {
    const profile = await this.lineUserFromToken(tenantId, idToken);
    const lineUserId = profile.lineUserId;
    const loc = locale && ['th', 'en', 'my', 'lo'].includes(locale) ? locale : undefined;

    const [linkedUser] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.lineUserId, lineUserId)))
      .limit(1);
    if (linkedUser) return { status: 'linked' as const, name: linkedUser.name };

    // switch their menu to the chosen language (still the onboarding menu, translated)
    if (loc) await this.line.assignRichMenu(tenantId, lineUserId, 'onboard', loc).catch(() => {});

    const [row] = await db
      .select()
      .from(lineOnboarding)
      .where(and(eq(lineOnboarding.tenantId, tenantId), eq(lineOnboarding.lineUserId, lineUserId)))
      .limit(1);
    if (row) {
      await db
        .update(lineOnboarding)
        .set({ displayName: displayName ?? row.displayName, pictureUrl: pictureUrl ?? row.pictureUrl, ...(loc ? { locale: loc } : {}), updatedAt: new Date() })
        .where(eq(lineOnboarding.id, row.id));
      return { status: row.status };
    }
    await db.insert(lineOnboarding).values({
      tenantId,
      lineUserId,
      displayName: displayName ?? profile.name ?? null,
      pictureUrl: pictureUrl ?? null,
      ...(loc ? { locale: loc } : {}),
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
    const ch = await this.line.getChannel(tenantId);
    // open as a LIFF launch so the app gets the LINE session (not a plain web page)
    const confirmUri = ch?.liffId ? `https://liff.line.me/${ch.liffId}?onboard=confirm` : `${LIFF_URL}?onboard=confirm`;
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
              action: { type: 'uri', label: 'ยืนยันตัวตน', uri: confirmUri },
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

    await db.update(users).set({ lineUserId: r.lineUserId, locale: r.locale ?? 'th' }).where(eq(users.id, userId));
    await db.update(lineOnboarding).set({ status: 'linked', linkedUserId: userId, updatedAt: new Date() }).where(eq(lineOnboarding.id, r.id));
    // switch this user from the onboarding menu to the member menu, in their language
    await this.line.assignRichMenu(tenantId, r.lineUserId, 'member', r.locale ?? 'th').catch(() => {});
    return { ok: true };
  }

  async reject(tenantId: string, id: string) {
    const r = await this.row(tenantId, id);
    await db.update(lineOnboarding).set({ status: 'rejected', updatedAt: new Date() }).where(eq(lineOnboarding.id, r.id));
    return { ok: true };
  }

  /** Undo a match: unbind the employee's LINE, reset the contact so it can be re-matched. */
  async unlink(tenantId: string, id: string) {
    const r = await this.row(tenantId, id);
    if (r.linkedUserId) {
      await db.update(users).set({ lineUserId: null }).where(and(eq(users.tenantId, tenantId), eq(users.id, r.linkedUserId)));
    }
    await db.update(lineOnboarding).set({ status: 'confirmed', linkedUserId: null, updatedAt: new Date() }).where(eq(lineOnboarding.id, r.id));
    // back to the onboarding menu in their language
    await this.line.assignRichMenu(tenantId, r.lineUserId, 'onboard', r.locale ?? 'th').catch(() => {});
    return { ok: true };
  }
}

class TokenDto {
  @IsString() idToken!: string;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() pictureUrl?: string;
  @IsOptional() @IsString() locale?: string;
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
    return this.svc.checkin(tenantId, dto.idToken, dto.displayName, dto.pictureUrl, dto.locale);
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

  @Post(':id/unlink')
  unlink(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.svc.unlink(tenantId, id);
  }
}

@Module({
  imports: [LineModule],
  providers: [OnboardingService],
  controllers: [OnboardingPublicController, OnboardingManageController],
})
export class OnboardingModule {}
