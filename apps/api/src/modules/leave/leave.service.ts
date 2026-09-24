import { BadRequestException, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { db, leaveRequests } from '@poszee/db';
import type { LeaveType } from '@poszee/shared';

function daySpanInclusive(start: string, end: string): number {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

// Statutory paid-leave quotas per year (Thai Labor Protection Act minimums).
// TODO: make per-tenant configurable; vacation legally requires 1 year of service.
const QUOTA: Record<LeaveType, number> = { sick: 30, personal: 3, vacation: 6 };

@Injectable()
export class LeaveService {
  async create(
    tenantId: string,
    userId: string,
    dto: { type: LeaveType; startDate: string; endDate: string; reason?: string },
  ) {
    if (dto.endDate < dto.startDate) throw new BadRequestException('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
    const days = daySpanInclusive(dto.startDate, dto.endDate);
    const [rec] = await db
      .insert(leaveRequests)
      .values({
        tenantId,
        userId,
        type: dto.type,
        startDate: dto.startDate,
        endDate: dto.endDate,
        days: String(days),
        reason: dto.reason,
      })
      .returning();
    return rec;
  }

  /** An employee's own leave requests + used/quota/remaining per type this year. */
  async mine(tenantId: string, userId: string) {
    const requests = await db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.userId, userId)))
      .orderBy(desc(leaveRequests.createdAt));
    const year = new Date().getFullYear();
    const used: Record<string, number> = { sick: 0, personal: 0, vacation: 0 };
    const usedPaid: Record<string, number> = { sick: 0, personal: 0, vacation: 0 };
    for (const r of requests) {
      if (r.status === 'approved' && new Date(r.startDate).getFullYear() === year) {
        used[r.type] = (used[r.type] ?? 0) + Number(r.days ?? 0);
        usedPaid[r.type] = (usedPaid[r.type] ?? 0) + Number(r.paidDays ?? 0);
      }
    }
    const balances = (Object.keys(QUOTA) as LeaveType[]).map((t) => ({
      type: t, quota: QUOTA[t], used: used[t] ?? 0, usedPaid: usedPaid[t] ?? 0, remaining: Math.max(0, QUOTA[t] - (usedPaid[t] ?? 0)),
    }));
    return { requests, used, balances };
  }

  /** Paid leave days already used for a type this year (for the split calc). */
  private async usedPaidThisYear(tenantId: string, userId: string, type: LeaveType, year: number): Promise<number> {
    const rows = await db
      .select({ paidDays: leaveRequests.paidDays, startDate: leaveRequests.startDate, status: leaveRequests.status, type: leaveRequests.type })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.userId, userId)));
    return rows
      .filter((r) => r.status === 'approved' && r.type === type && new Date(r.startDate).getFullYear() === year)
      .reduce((s, r) => s + Number(r.paidDays ?? 0), 0);
  }

  listPending(tenantId: string) {
    return db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.status, 'pending')))
      .orderBy(desc(leaveRequests.createdAt));
  }

  async decide(tenantId: string, id: string, approverId: string, approve: boolean) {
    const [req] = await db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.id, id), eq(leaveRequests.status, 'pending')))
      .limit(1);
    if (!req) throw new BadRequestException('ไม่พบคำขอที่รออนุมัติ');

    // on approval, split days into paid (within remaining quota) vs unpaid (excess)
    let paidDays = '0', unpaidDays = '0';
    if (approve) {
      const total = Number(req.days);
      const year = new Date(req.startDate).getFullYear();
      const alreadyPaid = await this.usedPaidThisYear(tenantId, req.userId, req.type, year);
      const remaining = Math.max(0, QUOTA[req.type] - alreadyPaid);
      const paid = Math.min(total, remaining);
      paidDays = String(paid);
      unpaidDays = String(Math.max(0, total - paid));
    }
    const [rec] = await db
      .update(leaveRequests)
      .set({ status: approve ? 'approved' : 'rejected', approverId, decidedAt: new Date(), paidDays, unpaidDays })
      .where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.id, id)))
      .returning();
    // TODO: notify employee via LINE push (LineService)
    return rec;
  }
}
