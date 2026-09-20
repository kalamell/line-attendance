import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db, tenants, tenantLineChannels, invitations, users, auditLogs } from '@poszee/db';
import type { TenantPlan, TenantStatus } from '@poszee/shared';
import { CryptoService } from '../../common/crypto/crypto.service';

export interface CreateTenantInput {
  name: string;
  subdomain: string;
  plan?: TenantPlan;
  adminEmail?: string;
}

@Injectable()
export class TenantsService {
  constructor(private readonly crypto: CryptoService) {}

  private async audit(actorId: string | undefined, tenantId: string | null, action: string, entity: string, entityId: string) {
    await db.insert(auditLogs).values({ actorId: actorId ?? null, tenantId, action, entity, entityId });
  }

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

  async create(input: CreateTenantInput, actorId?: string) {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: input.name, subdomain: input.subdomain, plan: input.plan ?? 'trial', status: 'trial' })
      .returning();
    await db.insert(tenantLineChannels).values({ tenantId: tenant.id });

    const token = randomBytes(24).toString('hex');
    await db.insert(invitations).values({
      tenantId: tenant.id,
      email: input.adminEmail,
      role: 'org_admin',
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
    await this.audit(actorId, tenant.id, 'tenant.create', 'tenant', tenant.id);

    return { tenant, invite: { token, url: `https://${tenant.subdomain}.poszee.com/invite/${token}` } };
  }

  async update(id: string, patch: { status?: TenantStatus; plan?: TenantPlan }, actorId?: string) {
    const [t] = await db.update(tenants).set(patch).where(eq(tenants.id, id)).returning();
    await this.audit(actorId, id, 'tenant.update', 'tenant', id);
    return t;
  }

  listAdmins(tenantId: string) {
    return db
      .select({ id: users.id, name: users.name, email: users.email, active: users.active, createdAt: users.createdAt })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.role, 'org_admin')));
  }

  /** Add an org_admin to a tenant with a generated temporary password (returned once). */
  async addAdmin(tenantId: string, input: { name: string; email: string }, actorId?: string) {
    const tempPassword = randomBytes(6).toString('base64url');
    const [u] = await db
      .insert(users)
      .values({
        tenantId,
        role: 'org_admin',
        name: input.name,
        email: input.email,
        passwordHash: this.crypto.hashPassword(tempPassword),
      })
      .returning();
    await this.audit(actorId, tenantId, 'admin.create', 'user', u.id);
    return { id: u.id, name: u.name, email: u.email, tempPassword };
  }

  listAllAdmins() {
    return db
      .select({ id: users.id, name: users.name, email: users.email, active: users.active, tenantId: users.tenantId, tenantName: tenants.name })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(eq(users.role, 'org_admin'))
      .orderBy(desc(users.createdAt));
  }

  listAudit() {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
  }
}
