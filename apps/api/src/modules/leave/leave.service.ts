import { BadRequestException, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { db, leaveRequests } from '@poszee/db';
import type { LeaveType } from '@poszee/shared';

function daySpanInclusive(start: string, end: string): number {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

@Injectable()
export class LeaveService {
  async create(
    tenantId: string,
    userId: string,
    dto: { type: LeaveType; startDate: string; endDate: string; reason?: string },
  ) {
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

  listPending(tenantId: string) {
    return db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.status, 'pending')))
      .orderBy(desc(leaveRequests.createdAt));
  }

  async decide(tenantId: string, id: string, approverId: string, approve: boolean) {
    const [rec] = await db
      .update(leaveRequests)
      .set({ status: approve ? 'approved' : 'rejected', approverId, decidedAt: new Date() })
      .where(
        and(
          eq(leaveRequests.tenantId, tenantId),
          eq(leaveRequests.id, id),
          eq(leaveRequests.status, 'pending'),
        ),
      )
      .returning();
    if (!rec) throw new BadRequestException('ไม่พบคำขอที่รออนุมัติ');
    // TODO: notify employee via LINE push (LineService)
    return rec;
  }
}
