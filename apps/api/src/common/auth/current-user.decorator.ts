import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthPrincipal } from '@poszee/shared';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
  return ctx.switchToHttp().getRequest<Request & { user: AuthPrincipal }>().user;
});
