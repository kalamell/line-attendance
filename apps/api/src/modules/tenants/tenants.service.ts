import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

  async update(
    id: string,
    patch: { name?: string; subdomain?: string; status?: TenantStatus; plan?: TenantPlan },
    actorId?: string,
  ) {
    const clean: Record<string, unknown> = {};
    if (patch.name !== undefined) clean.name = patch.name;
    if (patch.subdomain !== undefined) clean.subdomain = patch.subdomain;
    if (patch.status !== undefined) clean.status = patch.status;
    if (patch.plan !== undefined) clean.plan = patch.plan;
    const [t] = await db.update(tenants).set(clean).where(eq(tenants.id, id)).returning();
    await this.audit(actorId, id, 'tenant.update', 'tenant', id);
    return t;
  }

  /** Hard-delete a tenant. All tenant-scoped rows cascade (FK onDelete: cascade);
   *  audit rows keep with tenant_id set null. Irreversible. */
  async remove(id: string, actorId?: string) {
    const [t] = await db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.id, id)).limit(1);
    if (!t) throw new NotFoundException('ไม่พบหน่วยงาน');
    await db.delete(tenants).where(eq(tenants.id, id));
    await this.audit(actorId, null, 'tenant.delete', 'tenant', id);
    return { ok: true, id, name: t.name };
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

  async updateAdmin(id: string, patch: { name?: string; email?: string; active?: boolean }, actorId?: string) {
    const [u] = await db.select().from(users).where(and(eq(users.id, id), eq(users.role, 'org_admin'))).limit(1);
    if (!u) throw new NotFoundException('ไม่พบผู้ดูแล');
    const clean: Record<string, unknown> = {};
    if (patch.name !== undefined) clean.name = patch.name;
    if (patch.email !== undefined) clean.email = patch.email;
    if (patch.active !== undefined) clean.active = patch.active;
    const [updated] = await db.update(users).set(clean).where(eq(users.id, id)).returning();
    await this.audit(actorId, u.tenantId, 'admin.update', 'user', id);
    return { id: updated.id, name: updated.name, email: updated.email, active: updated.active };
  }

  async resetAdminPassword(id: string, actorId?: string) {
    const [u] = await db.select().from(users).where(and(eq(users.id, id), eq(users.role, 'org_admin'))).limit(1);
    if (!u) throw new NotFoundException('ไม่พบผู้ดูแล');
    const tempPassword = randomBytes(6).toString('base64url');
    await db.update(users).set({ passwordHash: this.crypto.hashPassword(tempPassword) }).where(eq(users.id, id));
    await this.audit(actorId, u.tenantId, 'admin.reset_password', 'user', id);
    return { id, email: u.email, tempPassword };
  }

  /** Delete an org_admin. May fail if the admin approved leave/hire (FK restrict);
   *  the caller surfaces that as "deactivate instead". */
  async removeAdmin(id: string, actorId?: string) {
    const [u] = await db.select().from(users).where(and(eq(users.id, id), eq(users.role, 'org_admin'))).limit(1);
    if (!u) throw new NotFoundException('ไม่พบผู้ดูแล');
    try {
      await db.delete(users).where(eq(users.id, id));
    } catch {
      throw new ConflictException('ผู้ดูแลนี้เคยอนุมัติรายการในระบบ ลบไม่ได้ — ให้ปิดการใช้งานแทน');
    }
    await this.audit(actorId, u.tenantId, 'admin.delete', 'user', id);
    return { ok: true, id };
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
