import { Body, Controller, Get, Injectable, Module, Patch, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { and, desc, eq } from 'drizzle-orm';
import { db, users, payslips, payrollRuns, salaryComponents, pdpaConsents } from '@poszee/db';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { TenantId } from '../../common/tenant/tenant.decorator';
import { CryptoService } from '../../common/crypto/crypto.service';
import { PDPA_CONSENT_VERSION, type AuthPrincipal } from '@poszee/shared';

@Injectable()
export class MeService {
  constructor(private readonly crypto: CryptoService) {}

  async profile(userId: string) {
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) return null;
    return {
      name: u.name,
      email: u.email,
      department: u.department,
      position: u.position,
      employeeCode: u.employeeCode,
      phone: u.phoneEnc ? this.crypto.decrypt(u.phoneEnc) : '',
    };
  }

  /** Employees may correct their own name/phone (PDPA right to rectify). HR owns dept/position/salary. */
  async updateProfile(userId: string, dto: { name?: string; phone?: string }) {
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.phone !== undefined) patch.phoneEnc = dto.phone ? this.crypto.encrypt(dto.phone) : null;
    if (Object.keys(patch).length) await db.update(users).set(patch).where(eq(users.id, userId));
    return this.profile(userId);
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
  @IsOptional() @IsString() phone?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('me')
class MeController {
  constructor(private readonly me: MeService) {}

  @Get('profile')
  profile(@CurrentUser() u: AuthPrincipal) {
    return this.me.profile(u.userId);
  }

  @Patch('profile')
  update(@CurrentUser() u: AuthPrincipal, @Body() dto: UpdateProfileDto) {
    return this.me.updateProfile(u.userId, dto);
  }

  @Get('payslip')
  payslip(@TenantId() tenantId: string, @CurrentUser() u: AuthPrincipal) {
    return this.me.payslip(tenantId, u.userId);
  }

  @Post('consent')
  consent(@TenantId(false) tenantId: string | null, @CurrentUser() u: AuthPrincipal) {
    return this.me.consent(tenantId, u.userId);
  }
}

@Module({ providers: [MeService], controllers: [MeController] })
export class MeModule {}
