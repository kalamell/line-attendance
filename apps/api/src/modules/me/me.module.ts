import { Controller, Get, Injectable, Module, Post, UseGuards } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { db, payslips, payrollRuns, salaryComponents, pdpaConsents } from '@poszee/db';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { TenantId } from '../../common/tenant/tenant.decorator';
import { PDPA_CONSENT_VERSION, type AuthPrincipal } from '@poszee/shared';

@Injectable()
export class MeService {
  async payslip(tenantId: string, userId: string) {
    const [slip] = await db
      .select({
        id: payslips.id,
        gross: payslips.gross,
        deductions: payslips.deductions,
        net: payslips.net,
        period: payrollRuns.period,
      })
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

@UseGuards(JwtAuthGuard)
@Controller('me')
class MeController {
  constructor(private readonly me: MeService) {}

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
