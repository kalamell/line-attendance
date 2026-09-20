import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { db, payslips, users } from '@poszee/db';
import { LineService } from '../line/line.service';

@Injectable()
export class PayrollService {
  constructor(private readonly line: LineService) {}

  listPayslips(tenantId: string, runId: string) {
    return db
      .select({
        id: payslips.id,
        userId: payslips.userId,
        name: users.name,
        department: users.department,
        gross: payslips.gross,
        deductions: payslips.deductions,
        net: payslips.net,
        sentAt: payslips.sentAt,
      })
      .from(payslips)
      .innerJoin(users, eq(users.id, payslips.userId))
      .where(and(eq(payslips.tenantId, tenantId), eq(payslips.runId, runId)));
  }

  /** Mark a payslip sent and push an encrypted-PDF notice via the tenant's LINE OA. */
  async sendSlip(tenantId: string, id: string) {
    const [slip] = await db
      .select({ id: payslips.id, net: payslips.net, lineUserId: users.lineUserId })
      .from(payslips)
      .innerJoin(users, eq(users.id, payslips.userId))
      .where(and(eq(payslips.tenantId, tenantId), eq(payslips.id, id)))
      .limit(1);
    if (!slip) throw new NotFoundException('ไม่พบสลิป');

    // TODO: render the payslip PDF, encrypt it with the employee's payslip password,
    // upload, and push it as a file message. For now push a text notice.
    if (slip.lineUserId) {
      await this.line.push(tenantId, slip.lineUserId, [
        { type: 'text', text: `สลิปเงินเดือนของคุณพร้อมแล้ว (สุทธิ ฿${slip.net}) — เปิดไฟล์ PDF ด้วยรหัสส่วนตัวของคุณ` },
      ]);
    }

    const [updated] = await db
      .update(payslips)
      .set({ sentAt: new Date() })
      .where(and(eq(payslips.tenantId, tenantId), eq(payslips.id, id)))
      .returning();
    return updated;
  }
}
