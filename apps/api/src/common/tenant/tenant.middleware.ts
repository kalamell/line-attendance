import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db, tenants } from '@poszee/db';
import { TENANT_HEADER } from '@poszee/shared';

declare module 'express' {
  interface Request {
    tenantId?: string | null;
    tenantSubdomain?: string | null;
  }
}

/**
 * Resolves the tenant for each request from the `x-tenant` header (set by the
 * SPA / nginx) or the request subdomain (<sub>.poszee.com). Platform routes
 * (super admin) run with tenantId = null.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const header = (req.headers[TENANT_HEADER] as string | undefined)?.trim();
    const host = (req.headers.host ?? '').split(':')[0];
    const sub = subdomainOf(host);
    const key = header || sub;

    req.tenantId = null;
    req.tenantSubdomain = key ?? null;

    if (key && key !== 'hr' && key !== 'www') {
      const [t] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.subdomain, key))
        .limit(1);
      if (t) req.tenantId = t.id;
    }
    next();
  }
}

function subdomainOf(host: string): string | null {
  // ahaanden.poszee.com -> "ahaanden"; poszee.com / localhost -> null
  const parts = host.split('.');
  if (parts.length < 3) return null;
  return parts[0] || null;
}
