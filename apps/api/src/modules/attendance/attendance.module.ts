import { Body, Controller, Get, Module, Post, UseGuards } from '@nestjs/common';
import { IsLatitude, IsLongitude } from 'class-validator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { TenantId } from '../../common/tenant/tenant.decorator';
import type { AuthPrincipal } from '@poszee/shared';
import { AttendanceService } from './attendance.service';

class CheckInDto {
  @IsLatitude() lat!: number;
  @IsLongitude() lng!: number;
}

@UseGuards(JwtAuthGuard)
@Controller('attendance')
class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('today')
  today(@TenantId() tenantId: string, @CurrentUser() user: AuthPrincipal) {
    return this.attendance.today(tenantId, user.userId);
  }

  @Post('check-in')
  checkIn(@TenantId() tenantId: string, @CurrentUser() user: AuthPrincipal, @Body() dto: CheckInDto) {
    return this.attendance.checkIn(tenantId, user.userId, dto.lat, dto.lng);
  }

  @Post('check-out')
  checkOut(@TenantId() tenantId: string, @CurrentUser() user: AuthPrincipal) {
    return this.attendance.checkOut(tenantId, user.userId);
  }
}

@Module({
  providers: [AttendanceService],
  controllers: [AttendanceController],
})
export class AttendanceModule {}
