import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, payrollRuns, payslips, salaryComponents, users, attendanceRecords } from '@poszee/db';
import { LineService } from '../line/line.service';

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

@Injectable()
export class PayrollService {
  constructor(private readonly line: LineService) {}

  listRuns(tenantId: string) {
    return db
      .select()
      .from(payrollRuns)
      .where(eq(payrollRuns.tenantId, tenantId))
      .orderBy(desc(payrollRuns.period));
  }

  /** Generate a draft run for a period: one payslip per active employee, seeded
   *  with base salary. HR then adds OT/allowance/deduction components. */
  async generateRun(tenantId: string, period: string) {
    if (!/^\d{4}-\d{2}$/.test(period)) throw new BadRequestException('รูปแบบงวดต้องเป็น YYYY-MM');
    let [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.tenantId, tenantId), eq(payrollRuns.period, period))).limit(1);
    if (run?.status === 'approved' || run?.status === 'paid') throw new BadRequestException('งวดนี้อนุมัติแล้ว แก้ไขไม่ได้');
    if (!run) {
      [run] = await db.insert(payrollRuns).values({ tenantId, period, status: 'draft' }).returning();
    } else {
      // regenerate: clear old payslips (components cascade)
      await db.delete(payslips).where(eq(payslips.runId, run.id));
    }
    const staff = await db
      .select({ id: users.id, baseSalary: users.baseSalary })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.active, true), inArray(users.role, ['employee', 'supervisor', 'org_admin'])));
    for (const s of staff) {
      const base = Number(s.baseSalary ?? 0);
      const [slip] = await db.insert(payslips).values({ tenantId, runId: run.id, userId: s.id, gross: money(base), deductions: '0.00', net: money(base) }).returning();
      if (base > 0) await db.insert(salaryComponents).values({ tenantId, payslipId: slip.id, kind: 'earning', label: 'เงินเดือน', amount: money(base) });
    }
    await this.recomputeRun(tenantId, run.id);
    return db.select().from(payrollRuns).where(eq(payrollRuns.id, run.id)).limit(1).then((r) => r[0]);
  }

  private async recomputePayslip(payslipId: string) {
    const comps = await db.select().from(salaryComponents).where(eq(salaryComponents.payslipId, payslipId));
    let earn = 0, ded = 0;
    for (const c of comps) { if (c.kind === 'earning') earn += Number(c.amount); else ded += Number(c.amount); }
    await db.update(payslips).set({ gross: money(earn), deductions: money(ded), net: money(earn - ded) }).where(eq(payslips.id, payslipId));
  }

  private async recomputeRun(tenantId: string, runId: string) {
    const slips = await db.select({ net: payslips.net }).from(payslips).where(eq(payslips.runId, runId));
    const total = slips.reduce((s, x) => s + Number(x.net), 0);
    await db.update(payrollRuns).set({ totalNet: money(total) }).where(and(eq(payrollRuns.tenantId, tenantId), eq(payrollRuns.id, runId)));
  }

  async addComponent(tenantId: string, payslipId: string, dto: { kind: 'earning' | 'deduction'; label: string; amount: string }) {
    const [slip] = await db.select({ id: payslips.id, runId: payslips.runId }).from(payslips).where(and(eq(payslips.tenantId, tenantId), eq(payslips.id, payslipId))).limit(1);
    if (!slip) throw new NotFoundException('ไม่พบสลิป');
    await this.assertDraft(tenantId, slip.runId);
    await db.insert(salaryComponents).values({ tenantId, payslipId, kind: dto.kind, label: dto.label, amount: money(Number(dto.amount)) });
    await this.recomputePayslip(payslipId);
    await this.recomputeRun(tenantId, slip.runId);
    return { ok: true };
  }

  async removeComponent(tenantId: string, componentId: string) {
    const [c] = await db.select().from(salaryComponents).where(and(eq(salaryComponents.tenantId, tenantId), eq(salaryComponents.id, componentId))).limit(1);
    if (!c) throw new NotFoundException('ไม่พบรายการ');
    const [slip] = await db.select({ runId: payslips.runId }).from(payslips).where(eq(payslips.id, c.payslipId)).limit(1);
    if (slip) await this.assertDraft(tenantId, slip.runId);
    await db.delete(salaryComponents).where(eq(salaryComponents.id, componentId));
    await this.recomputePayslip(c.payslipId);
    if (slip) await this.recomputeRun(tenantId, slip.runId);
    return { ok: true };
  }

  private async assertDraft(tenantId: string, runId: string) {
    const [run] = await db.select({ status: payrollRuns.status }).from(payrollRuns).where(and(eq(payrollRuns.tenantId, tenantId), eq(payrollRuns.id, runId))).limit(1);
    if (run?.status !== 'draft') throw new BadRequestException('งวดนี้อนุมัติแล้ว แก้ไขไม่ได้');
  }

  async approveRun(tenantId: string, runId: string) {
    const [run] = await db.update(payrollRuns).set({ status: 'approved' }).where(and(eq(payrollRuns.tenantId, tenantId), eq(payrollRuns.id, runId))).returning();
    if (!run) throw new NotFoundException('ไม่พบงวด');
    return run;
  }

  components(tenantId: string, payslipId: string) {
    return db.select({ id: salaryComponents.id, kind: salaryComponents.kind, label: salaryComponents.label, amount: salaryComponents.amount })
      .from(salaryComponents).where(and(eq(salaryComponents.tenantId, tenantId), eq(salaryComponents.payslipId, payslipId)));
  }

  /** Attendance stats for the period, per employee — reference for OT/deduction decisions. */
  async attendanceStats(tenantId: string, period: string) {
    const recs = await db.select({ userId: attendanceRecords.userId, status: attendanceRecords.status, workDate: attendanceRecords.workDate })
      .from(attendanceRecords).where(eq(attendanceRecords.tenantId, tenantId));
    const map: Record<string, { present: number; late: number }> = {};
    for (const r of recs) {
      if (!(r.workDate ?? '').startsWith(period)) continue;
      map[r.userId] = map[r.userId] ?? { present: 0, late: 0 };
      if (r.status === 'late') map[r.userId].late++; else if (r.status === 'present') map[r.userId].present++;
    }
    return map;
  }

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
