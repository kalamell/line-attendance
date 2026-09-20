import { Injectable } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db, tenants, tenantLineChannels, invitations } from '@poszee/db';
import type { TenantPlan } from '@poszee/shared';

export interface CreateTenantInput {
  name: string;
  subdomain: string;
  plan?: TenantPlan;
  adminEmail?: string;
}

@Injectable()
export class TenantsService {
  list() {
    return db
      .select({
        id: tenants.id,
        name: tenants.name,
        subdomain: tenants.subdomain,
        plan: tenants.plan,
        status: tenants.status,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .orderBy(desc(tenants.createdAt));
  }

  async create(input: CreateTenantInput) {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: input.name, subdomain: input.subdomain, plan: input.plan ?? 'trial', status: 'trial' })
      .returning();

    await db.insert(tenantLineChannels).values({ tenantId: tenant.id });

    // invite the first org admin (delivered via email/LINE — enqueue in notifications)
    const token = randomBytes(24).toString('hex');
    await db.insert(invitations).values({
      tenantId: tenant.id,
      email: input.adminEmail,
      role: 'org_admin',
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });

    return {
      tenant,
      invite: { token, url: `https://${tenant.subdomain}.poszee.com/invite/${token}` },
    };
  }
}
