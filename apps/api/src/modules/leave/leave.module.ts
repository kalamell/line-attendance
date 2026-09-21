import { Body, Controller, Get, Module, Param, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { TenantId } from '../../common/tenant/tenant.decorator';
import { LEAVE_TYPES, type AuthPrincipal, type LeaveType } from '@poszee/shared';
import { LeaveService } from './leave.service';

class CreateLeaveDto {
  @IsIn(LEAVE_TYPES as unknown as string[]) type!: LeaveType;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsString() reason?: string;
}

class DecisionDto {
  @IsBoolean() approve!: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('leave')
class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Post()
  create(@TenantId() tenantId: string, @CurrentUser() user: AuthPrincipal, @Body() dto: CreateLeaveDto) {
    return this.leave.create(tenantId, user.userId, dto);
  }

  @Get('mine')
  mine(@TenantId() tenantId: string, @CurrentUser() user: AuthPrincipal) {
    return this.leave.mine(tenantId, user.userId);
  }

  @UseGuards(RolesGuard)
  @Roles('supervisor')
  @Get('pending')
  pending(@TenantId() tenantId: string) {
    return this.leave.listPending(tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles('supervisor')
  @Post(':id/decision')
  decide(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.leave.decide(tenantId, id, user.userId, dto.approve);
  }
}

@Module({
  providers: [LeaveService],
  controllers: [LeaveController],
})
export class LeaveModule {}
