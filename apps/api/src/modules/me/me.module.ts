import { BadRequestException, Body, Controller, Get, Injectable, Module, Patch, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { and, desc, eq } from 'drizzle-orm';
import { db, users, payslips, payrollRuns, salaryComponents, pdpaConsents } from '@poszee/db';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { TenantId } from '../../common/tenant/tenant.decorator';
import { CryptoService } from '../../common/crypto/crypto.service';
import { LineModule } from '../line/line.module';
import { LineService } from '../line/line.service';
import { PDPA_CONSENT_VERSION, type AuthPrincipal } from '@poszee/shared';

@Injectable()
export class MeService {
  constructor(private readonly crypto: CryptoService, private readonly line: LineService) {}

  async setLocale(userId: string, locale: string) {
    const loc = ['th', 'en', 'my', 'lo'].includes(locale) ? locale : 'th';
    const [u] = await db.update(users).set({ locale: loc }).where(eq(users.id, userId)).returning();
    // switch the employee's rich menu to the new language
    if (u?.lineUserId && u.tenantId) await this.line.assignRichMenu(u.tenantId, u.lineUserId, 'member', loc).catch(() => undefined);
    return { ok: true, locale: loc };
  }

  private dec(v: string | null): string {
    return v ? this.crypto.decrypt(v) : '';
  }

  async profile(userId: string) {
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) return null;
    return {
      name: u.name,
      email: u.email,
      department: u.department,
      position: u.position,
      employeeCode: u.employeeCode,
      phone: this.dec(u.phoneEnc),
      address: this.dec(u.addressEnc),
      emergencyContactName: u.emergencyContactName ?? '',
      emergencyPhone: this.dec(u.emergencyPhoneEnc),
      hasPin: !!u.payslipPasswordHash,
      hasPassword: !!u.passwordHash,
      hasConsent: await this.hasConsent(userId),
      locale: u.locale ?? 'th',
    };
  }

  /** Latest PDPA decision for the user (true only if the most recent record consented). */
  async hasConsent(userId: string) {
    const [c] = await db
      .select({ consented: pdpaConsents.consented })
      .from(pdpaConsents)
      .where(eq(pdpaConsents.userId, userId))
      .orderBy(desc(pdpaConsents.consentedAt))
      .limit(1);
    return c?.consented === true;
  }

  async withdrawConsent(tenantId: string | null, userId: string, ip?: string) {
    await db.insert(pdpaConsents).values({ tenantId, userId, version: PDPA_CONSENT_VERSION, consented: false, ip });
    return { ok: true };
  }

  /** Employees/admins correct their own contact info (PDPA rectify). HR owns dept/position/salary. */
  async updateProfile(
    userId: string,
    dto: { name?: string; email?: string; phone?: string; address?: string; emergencyContactName?: string; emergencyPhone?: string },
  ) {
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.email !== undefined) patch.email = dto.email;
    if (dto.emergencyContactName !== undefined) patch.emergencyContactName = dto.emergencyContactName;
    if (dto.phone !== undefined) patch.phoneEnc = dto.phone ? this.crypto.encrypt(dto.phone) : null;
    if (dto.address !== undefined) patch.addressEnc = dto.address ? this.crypto.encrypt(dto.address) : null;
    if (dto.emergencyPhone !== undefined) patch.emergencyPhoneEnc = dto.emergencyPhone ? this.crypto.encrypt(dto.emergencyPhone) : null;
    if (Object.keys(patch).length) await db.update(users).set(patch).where(eq(users.id, userId));
    return this.profile(userId);
  }

  async changePassword(userId: string, currentPassword: string | undefined, newPassword: string) {
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) throw new UnauthorizedException();
    if (u.passwordHash && !this.crypto.verifyPassword(currentPassword ?? '', u.passwordHash)) {
      // Business validation, NOT a token failure — must be 400 so the client
      // shows an inline error instead of treating it as an expired session.
      throw new BadRequestException('รหัสผ่านเดิมไม่ถูกต้อง');
    }
    await db.update(users).set({ passwordHash: this.crypto.hashPassword(newPassword) }).where(eq(users.id, userId));
    return { ok: true };
  }

  async setPin(userId: string, pin: string) {
    await db.update(users).set({ payslipPasswordHash: this.crypto.hashPassword(pin) }).where(eq(users.id, userId));
    return { ok: true };
  }

  async verifyPin(userId: string, pin: string) {
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u?.payslipPasswordHash) return { ok: true, unset: true }; // no PIN set yet
    return { ok: this.crypto.verifyPassword(pin, u.payslipPasswordHash) };
  }

  async payslip(tenantId: string, userId: string) {
    const [slip] = await db
      .select({ id: payslips.id, gross: payslips.gross, deductions: payslips.deductions, net: payslips.net, period: payrollRuns.period })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .where(and(eq(payslips.tenantId, tenantId), eq(payslips.userId, userId)))
      .orderBy(desc(payslips.createdAt))
      .limit(1);
    if (!slip) return null;
    const items = await db
      .select({ kind: salaryComponents.kind, label: salaryComponents.label, amount: salaryComponents.amount })
      .from(salaryComponents)
      .where(eq(salaryComponents.payslipId, slip.id));
    return { ...slip, items };
  }

  async consent(tenantId: string | null, userId: string, ip?: string) {
    await db.insert(pdpaConsents).values({ tenantId, userId, version: PDPA_CONSENT_VERSION, consented: true, ip });
    return { ok: true, version: PDPA_CONSENT_VERSION };
  }
}

class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() emergencyContactName?: string;
  @IsOptional() @IsString() emergencyPhone?: string;
}
class ChangePasswordDto {
  @IsOptional() @IsString() currentPassword?: string;
  @IsString() @MinLength(6) newPassword!: string;
}
class PinDto {
  @IsString() @MinLength(4) pin!: string;
}
class LocaleDto {
  @IsString() locale!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('me')
class MeController {
  constructor(private readonly me: MeService) {}

  @Get('profile') profile(@CurrentUser() u: AuthPrincipal) {
    return this.me.profile(u.userId);
  }
  @Patch('profile') update(@CurrentUser() u: AuthPrincipal, @Body() dto: UpdateProfileDto) {
    return this.me.updateProfile(u.userId, dto);
  }
  @Patch('password') password(@CurrentUser() u: AuthPrincipal, @Body() dto: ChangePasswordDto) {
    return this.me.changePassword(u.userId, dto.currentPassword, dto.newPassword);
  }
  @Patch('pin') pin(@CurrentUser() u: AuthPrincipal, @Body() dto: PinDto) {
    return this.me.setPin(u.userId, dto.pin);
  }
  @Patch('locale') locale(@CurrentUser() u: AuthPrincipal, @Body() dto: LocaleDto) {
    return this.me.setLocale(u.userId, dto.locale);
  }
  @Post('verify-pin') verifyPin(@CurrentUser() u: AuthPrincipal, @Body() dto: PinDto) {
    return this.me.verifyPin(u.userId, dto.pin);
  }
  @Get('payslip') payslip(@TenantId() tenantId: string, @CurrentUser() u: AuthPrincipal) {
    return this.me.payslip(tenantId, u.userId);
  }
  @Post('consent') consent(@TenantId(false) tenantId: string | null, @CurrentUser() u: AuthPrincipal) {
    return this.me.consent(tenantId, u.userId);
  }
  @Post('consent/withdraw') withdraw(@TenantId(false) tenantId: string | null, @CurrentUser() u: AuthPrincipal) {
    return this.me.withdrawConsent(tenantId, u.userId);
  }
}

@Module({ imports: [LineModule], providers: [MeService], controllers: [MeController] })
export class MeModule {}
