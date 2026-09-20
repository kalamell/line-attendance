import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDateString, IsOptional } from 'class-validator';
import { and, desc, eq } from 'drizzle-orm';
import { db, hireRequests } from '@poszee/db';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { TenantId } from '../../common/tenant/tenant.decorator';
import type { AuthPrincipal } from '@poszee/shared';

@Injectable()
export class HireService {
  listPending(tenantId: string) {
    return db
      .select()
      .from(hireRequests)
      .where(and(eq(hireRequests.tenantId, tenantId), eq(hireRequests.status, 'pending')))
      .orderBy(desc(hireRequests.createdAt));
  }

  async decide(tenantId: string, id: string, byId: string, approve: boolean, startDate?: string) {
    const [rec] = await db
      .update(hireRequests)
      .set({
        status: approve ? 'approved' : 'rejected',
        decidedBy: byId,
        decidedAt: new Date(),
        startDate: approve ? (startDate ?? null) : null,
      })
      .where(and(eq(hireRequests.tenantId, tenantId), eq(hireRequests.id, id), eq(hireRequests.status, 'pending')))
      .returning();
    if (!rec) throw new BadRequestException('ไม่พบคำขอที่รออนุมัติ');
    // TODO on approve: provision the employee user + send LINE onboarding link
    return rec;
  }
}

class HireDecisionDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsDateString() startDate?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('org_admin')
@Controller('hire')
class HireController {
  constructor(private readonly hire: HireService) {}

  @Get('pending')
  pending(@TenantId() tenantId: string) {
    return this.hire.listPending(tenantId);
  }

  @Post(':id/decision')
  decide(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: HireDecisionDto,
  ) {
    return this.hire.decide(tenantId, id, user.userId, dto.approve, dto.startDate);
  }
}

@Module({
  providers: [HireService],
  controllers: [HireController],
})
export class HireModule {}
