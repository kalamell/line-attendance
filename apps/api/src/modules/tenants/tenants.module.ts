import { Body, Controller, Delete, Get, Module, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { TENANT_PLANS, TENANT_STATUS, type AuthPrincipal, type TenantPlan, type TenantStatus } from '@poszee/shared';
import { TenantsService } from './tenants.service';

class CreateTenantDto {
  @IsString() @MinLength(2) name!: string;
  @Matches(/^[a-z0-9][a-z0-9-]{1,62}$/, { message: 'subdomain must be lowercase alphanumeric/hyphen' }) subdomain!: string;
  @IsOptional() @IsIn(TENANT_PLANS as unknown as string[]) plan?: TenantPlan;
  @IsOptional() @IsEmail() adminEmail?: string;
}
class UpdateTenantDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @Matches(/^[a-z0-9][a-z0-9-]{1,62}$/, { message: 'subdomain must be lowercase alphanumeric/hyphen' }) subdomain?: string;
  @IsOptional() @IsIn(TENANT_STATUS as unknown as string[]) status?: TenantStatus;
  @IsOptional() @IsIn(TENANT_PLANS as unknown as string[]) plan?: TenantPlan;
}
class AddAdminDto {
  @IsString() @MinLength(2) name!: string;
  @IsEmail() email!: string;
}
class UpdateAdminDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
@Controller('tenants')
class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get() list() { return this.tenants.list(); }

  @Post() create(@CurrentUser() u: AuthPrincipal, @Body() dto: CreateTenantDto) {
    return this.tenants.create(dto, u.userId);
  }

  @Patch(':id') update(@CurrentUser() u: AuthPrincipal, @Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenants.update(id, dto, u.userId);
  }

  @Delete(':id') remove(@CurrentUser() u: AuthPrincipal, @Param('id') id: string) {
    return this.tenants.remove(id, u.userId);
  }

  @Get(':id/admins') admins(@Param('id') id: string) {
    return this.tenants.listAdmins(id);
  }

  @Post(':id/admins') addAdmin(@CurrentUser() u: AuthPrincipal, @Param('id') id: string, @Body() dto: AddAdminDto) {
    return this.tenants.addAdmin(id, dto, u.userId);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
@Controller('admins')
class AdminsController {
  constructor(private readonly tenants: TenantsService) {}
  @Get() list() { return this.tenants.listAllAdmins(); }

  @Patch(':id') update(@CurrentUser() u: AuthPrincipal, @Param('id') id: string, @Body() dto: UpdateAdminDto) {
    return this.tenants.updateAdmin(id, dto, u.userId);
  }

  @Post(':id/reset-password') reset(@CurrentUser() u: AuthPrincipal, @Param('id') id: string) {
    return this.tenants.resetAdminPassword(id, u.userId);
  }

  @Delete(':id') remove(@CurrentUser() u: AuthPrincipal, @Param('id') id: string) {
    return this.tenants.removeAdmin(id, u.userId);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
@Controller('audit')
class AuditController {
  constructor(private readonly tenants: TenantsService) {}
  @Get() list() { return this.tenants.listAudit(); }
}

@Module({
  providers: [TenantsService],
  controllers: [TenantsController, AdminsController, AuditController],
})
export class TenantsModule {}
