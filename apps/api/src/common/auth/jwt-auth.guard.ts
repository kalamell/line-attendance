import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthPrincipal } from '@poszee/shared';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthPrincipal }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('missing bearer token');
    try {
      req.user = this.jwt.verify<AuthPrincipal>(header.slice(7));
      return true;
    } catch {
      throw new UnauthorizedException('invalid token');
    }
  }
}
