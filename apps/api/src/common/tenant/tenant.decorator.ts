import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthPrincipal } from '@poszee/shared';

/**
 * Injects the tenantId. For authenticated tenant-scoped users it comes from the
 * JWT (req.user.tenantId); otherwise from the request host/x-tenant (LIFF config,
 * webhook). Throws when a tenant is required but absent.
 */
export const TenantId = createParamDecorator((required: boolean | undefined, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AuthPrincipal }>();
  const id = req.user?.tenantId ?? req.tenantId ?? null;
  if (required !== false && !id) throw new BadRequestException('tenant not resolved');
  return id;
});
