import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

/** Injects the resolved tenantId; throws when a tenant is required but absent. */
export const TenantId = createParamDecorator((required: boolean | undefined, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const id = req.tenantId ?? null;
  if (required !== false && !id) throw new BadRequestException('tenant not resolved');
  return id;
});
