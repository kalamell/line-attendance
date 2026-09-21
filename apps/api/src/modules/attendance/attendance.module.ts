import { Body, Controller, Get, Module, Post, UseGuards } from '@nestjs/common';
import { IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { TenantId } from '../../common/tenant/tenant.decorator';
import type { AuthPrincipal } from '@poszee/shared';
import { AttendanceService } from './attendance.service';

class CheckInDto {
  @IsLatitude() lat!: number;
  @IsLongitude() lng!: number;
}
class OfficeDto {
  @IsOptional() @IsString() name?: string;
  @IsLatitude() lat!: number;
  @IsLongitude() lng!: number;
  @IsNumber() @Min(10) radiusM!: number;
}

@UseGuards(JwtAuthGuard)
@Controller('attendance')
class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('today')
  today(@TenantId() tenantId: string, @CurrentUser() user: AuthPrincipal) {
    return this.attendance.today(tenantId, user.userId);
  }

  @Get('history')
  history(@TenantId() tenantId: string, @CurrentUser() user: AuthPrincipal) {
    return this.attendance.history(tenantId, user.userId);
  }

  @Get('summary')
  summary(@TenantId() tenantId: string, @CurrentUser() user: AuthPrincipal) {
    return this.attendance.summary(tenantId, user.userId);
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

// HR manages the office geofence(s) used for check-in
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('org_admin')
@Controller('attendance/office')
class OfficeController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.attendance.listOffices(tenantId);
  }

  @Post()
  upsert(@TenantId() tenantId: string, @Body() dto: OfficeDto) {
    return this.attendance.upsertOffice(tenantId, dto);
  }
}

@Module({
  providers: [AttendanceService],
  controllers: [AttendanceController, OfficeController],
})
export class AttendanceModule {}
