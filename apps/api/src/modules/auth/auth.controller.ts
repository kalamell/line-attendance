import { Body, Controller, Post } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { TenantId } from '../../common/tenant/tenant.decorator';
import { AuthService } from './auth.service';

class LineLoginDto {
  @IsString()
  @MinLength(10)
  idToken!: string;
}

class PasswordLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // console login (super_admin / org_admin / supervisor)
  @Post('login')
  loginPassword(@Body() dto: PasswordLoginDto) {
    return this.auth.loginWithPassword(dto.email, dto.password);
  }

  // employee LIFF login
  @Post('line/login')
  loginLine(@TenantId(false) tenantId: string | null, @Body() dto: LineLoginDto) {
    return this.auth.loginWithLine(tenantId, dto.idToken);
  }
}
