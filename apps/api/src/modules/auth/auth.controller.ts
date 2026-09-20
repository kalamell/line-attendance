import { Body, Controller, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { TenantId } from '../../common/tenant/tenant.decorator';
import { AuthService } from './auth.service';

class LineLoginDto {
  @IsString()
  @MinLength(10)
  idToken!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('line/login')
  login(@TenantId(false) tenantId: string | null, @Body() dto: LineLoginDto) {
    return this.auth.loginWithLine(tenantId, dto.idToken);
  }
}
