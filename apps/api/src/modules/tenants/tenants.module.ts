import { Body, Controller, Get, Module, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { TENANT_PLANS, type TenantPlan } from '@poszee/shared';
import { TenantsService } from './tenants.service';

class CreateTenantDto {
  @IsString() @MinLength(2)
  name!: string;

  @Matches(/^[a-z0-9][a-z0-9-]{1,62}$/, { message: 'subdomain must be lowercase alphanumeric/hyphen' })
  subdomain!: string;

  @IsOptional() @IsIn(TENANT_PLANS as unknown as string[])
  plan?: TenantPlan;

  @IsOptional() @IsEmail()
  adminEmail?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
@Controller('tenants')
class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  list() {
    return this.tenants.list();
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenants.create(dto);
  }
}

@Module({
  providers: [TenantsService],
  controllers: [TenantsController],
})
export class TenantsModule {}
