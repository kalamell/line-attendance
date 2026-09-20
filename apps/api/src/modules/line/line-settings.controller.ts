import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { TenantId } from '../../common/tenant/tenant.decorator';
import { LineService } from './line.service';

class FeaturesDto {
  @IsBoolean() richMenu!: boolean;
  @IsBoolean() notifyPush!: boolean;
  @IsBoolean() sendSlip!: boolean;
}

class SaveLineDto {
  @IsOptional() @IsString() loginChannelId?: string;
  @IsOptional() @IsString() channelId?: string;
  @IsOptional() @IsString() channelSecret?: string;
  @IsOptional() @IsString() accessToken?: string;
  @IsOptional() @IsString() liffId?: string;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => FeaturesDto) features?: FeaturesDto;
}

// org_admin manages their own tenant's LINE channel (per-tenant / Model B)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('org_admin')
@Controller('line')
export class LineSettingsController {
  constructor(private readonly line: LineService) {}

  @Get('settings')
  get(@TenantId() tenantId: string) {
    return this.line.getSettings(tenantId);
  }

  @Put('settings')
  save(@TenantId() tenantId: string, @Body() dto: SaveLineDto) {
    return this.line.saveSettings(tenantId, dto);
  }

  @Post('test')
  test(@TenantId() tenantId: string) {
    return this.line.testConnection(tenantId);
  }
}
