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
  async save(@TenantId() tenantId: string, @Body() dto: SaveLineDto) {
    const saved = await this.line.saveSettings(tenantId, dto);
    // Once a working access token is present, the system provisions the LIFF app
    // itself (no need to create a LIFF ID in the LINE console). Runs when no LIFF
    // is wired yet; failures are surfaced but don't fail the save.
    if (saved.hasAccessToken && !saved.liffId) {
      const provision = await this.line.provisionLiff(tenantId).catch((e) => ({ ok: false, reason: String(e) }));
      return { ...(await this.line.getSettings(tenantId)), provision };
    }
    return saved;
  }

  @Post('test')
  test(@TenantId() tenantId: string) {
    return this.line.testConnection(tenantId);
  }

  /** One-click: create/reuse the LIFF app from the stored token and wire up login. */
  @Post('provision-liff')
  provisionLiff(@TenantId() tenantId: string) {
    return this.line.provisionLiff(tenantId);
  }

  /** One-click: create + set the default rich menu from the stored token. */
  @Post('provision-richmenu')
  provisionRichMenu(@TenantId() tenantId: string) {
    return this.line.provisionRichMenu(tenantId);
  }
}
