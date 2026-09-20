import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLE_RANK, type AuthPrincipal, type Role } from '@poszee/shared';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;
    const user = ctx.switchToHttp().getRequest<Request & { user?: AuthPrincipal }>().user;
    if (!user) throw new ForbiddenException();
    const ok = required.some((r) => ROLE_RANK[user.role] >= ROLE_RANK[r]);
    if (!ok) throw new ForbiddenException('insufficient role');
    return true;
  }
}
