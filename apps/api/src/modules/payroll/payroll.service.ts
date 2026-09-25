import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, payrollRuns, payslips, salaryComponents, users, attendanceRecords, leaveRequests } from '@poszee/db';
import { LineService } from '../line/line.service';

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

// --- Thai statutory calculations (rates as of 2024; verify with an accountant) ---
const SSO_LABEL = 'ประกันสังคม';
const WHT_LABEL = 'ภาษีหัก ณ ที่จ่าย';

/** Social security: 5% of monthly wage, base clamped to ฿1,650–฿15,000 (max ฿750). */
function computeSSO(monthlyWage: number): number {
  if (monthlyWage <= 0) return 0;
  const base = Math.min(Math.max(monthlyWage, 1650), 15000);
  return Math.round(base * 0.05);
}

function progressiveTax(taxable: number): number {
  const brackets: [number, number][] = [
    [150000, 0], [300000, 0.05], [500000, 0.1], [750000, 0.15],
    [1000000, 0.2], [2000000, 0.25], [5000000, 0.3], [Infinity, 0.35],
  ];
  let tax = 0, prev = 0;
  for (const [upTo, rate] of brackets) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, upTo) - prev) * rate;
    prev = upTo;
  }
  return tax;
}

/** Monthly withholding tax: annualize gross, apply baseline deductions (expense 50%/100k,
 *  personal 60k, SSO), progressive brackets, /12. Employee-specific allowances not included. */
function computeWHT(monthlyGross: number): number {
  if (monthlyGross <= 0) return 0;
  const annual = monthlyGross * 12;
  const expense = Math.min(annual * 0.5, 100000);
  const personal = 60000;
  const ssoAnnual = Math.min(computeSSO(monthlyGross) * 12, 9000);
  const taxable = Math.max(0, annual - expense - personal - ssoAnnual);
  return Math.round(progressiveTax(taxable) / 12);
}

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
      .select({ id: users.id, name: users.name, baseSalary: users.baseSalary })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.active, true), inArray(users.role, ['employee', 'supervisor', 'org_admin'])));
    // Employees with no base salary would produce an empty ฿0 slip that confuses staff;
    // skip them and report back so HR knows to set a salary before regenerating.
    const skipped: { id: string; name: string }[] = [];
    let generated = 0;
    for (const s of staff) {
      const base = Number(s.baseSalary ?? 0);
      if (base <= 0) { skipped.push({ id: s.id, name: s.name }); continue; }
      const [slip] = await db.insert(payslips).values({ tenantId, runId: run.id, userId: s.id, gross: money(base), deductions: '0.00', net: money(base) }).returning();
      await db.insert(salaryComponents).values({ tenantId, payslipId: slip.id, kind: 'earning', label: 'เงินเดือน', amount: money(base), system: true });
      // unpaid leave in this period -> deduction (daily rate = base/30)
      const unpaid = await this.unpaidLeaveDays(tenantId, s.id, period);
      if (unpaid > 0) {
        await db.insert(salaryComponents).values({ tenantId, payslipId: slip.id, kind: 'deduction', label: `หักลาไม่รับค่าจ้าง (${unpaid} วัน)`, amount: money((base / 30) * unpaid), system: true });
      }
      await this.recomputePayslip(slip.id);
      generated++;
    }
    await this.recomputeRun(tenantId, run.id);
    const [fresh] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, run.id)).limit(1);
    return { ...fresh, generated, skipped };
  }

  /** Sum unpaid leave days whose leave starts within the given YYYY-MM period. */
  private async unpaidLeaveDays(tenantId: string, userId: string, period: string): Promise<number> {
    const rows = await db
      .select({ startDate: leaveRequests.startDate, unpaidDays: leaveRequests.unpaidDays, status: leaveRequests.status })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.userId, userId)));
    return rows
      .filter((r) => r.status === 'approved' && (r.startDate ?? '').startsWith(period))
      .reduce((s, r) => s + Number(r.unpaidDays ?? 0), 0);
  }

  private async recomputePayslip(payslipId: string) {
    const [slip] = await db.select({ tenantId: payslips.tenantId }).from(payslips).where(eq(payslips.id, payslipId)).limit(1);
    if (!slip) return;
    const comps = await db.select().from(salaryComponents).where(eq(salaryComponents.payslipId, payslipId));
    const grossEarnings = comps.filter((c) => c.kind === 'earning').reduce((s, c) => s + Number(c.amount), 0);
    const baseWage = Number(comps.find((c) => c.kind === 'earning' && c.label === 'เงินเดือน')?.amount ?? grossEarnings);

    // auto-manage statutory deductions (SSO on base wage, WHT on gross earnings)
    await this.upsertSystemDeduction(slip.tenantId, payslipId, comps, SSO_LABEL, computeSSO(baseWage));
    await this.upsertSystemDeduction(slip.tenantId, payslipId, comps, WHT_LABEL, computeWHT(grossEarnings));

    const fresh = await db.select().from(salaryComponents).where(eq(salaryComponents.payslipId, payslipId));
    let earn = 0, ded = 0;
    for (const c of fresh) { if (c.kind === 'earning') earn += Number(c.amount); else ded += Number(c.amount); }
    await db.update(payslips).set({ gross: money(earn), deductions: money(ded), net: money(earn - ded) }).where(eq(payslips.id, payslipId));
  }

  private async upsertSystemDeduction(tenantId: string, payslipId: string, comps: { id: string; label: string }[], label: string, amount: number) {
    const existing = comps.find((c) => c.label === label);
    if (amount <= 0) {
      if (existing) await db.delete(salaryComponents).where(eq(salaryComponents.id, existing.id));
      return;
    }
    if (existing) await db.update(salaryComponents).set({ amount: money(amount) }).where(eq(salaryComponents.id, existing.id));
    else await db.insert(salaryComponents).values({ tenantId, payslipId, kind: 'deduction', label, amount: money(amount), system: true });
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
    if (c.system) throw new BadRequestException('รายการนี้ระบบคำนวณอัตโนมัติ ลบไม่ได้');
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
    return db.select({ id: salaryComponents.id, kind: salaryComponents.kind, label: salaryComponents.label, amount: salaryComponents.amount, system: salaryComponents.system })
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
      .select({ id: payslips.id, gross: payslips.gross, net: payslips.net, period: payrollRuns.period, lineUserId: users.lineUserId })
      .from(payslips)
      .innerJoin(users, eq(users.id, payslips.userId))
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .where(and(eq(payslips.tenantId, tenantId), eq(payslips.id, id)))
      .limit(1);
    if (!slip) throw new NotFoundException('ไม่พบสลิป');
    if (Number(slip.gross) <= 0) throw new BadRequestException('สลิปนี้ยังไม่มีรายได้ (ยังไม่ได้ตั้งเงินเดือนพนักงาน) — ตั้งเงินเดือนแล้วสร้างรอบใหม่ก่อนส่ง');

    // LINE push can't attach a generated file, so notify with a Flex button that opens
    // the LIFF payslip page where the employee unlocks with their PIN and downloads the PDF.
    // Amounts are intentionally NOT shown: the push banner can pop up in front of others,
    // so we only announce that the slip is ready and let them open it behind their PIN.
    if (slip.lineUserId) {
      const ch = await this.line.getChannel(tenantId);
      const uri = ch?.liffId ? `https://liff.line.me/${ch.liffId}?tab=payslip` : 'https://hr.poszee.com/liff/?tab=payslip';
      await this.line.push(tenantId, slip.lineUserId, [{
        type: 'flex', altText: `สลิปเงินเดือนประจำงวด ${slip.period} ออกแล้ว`,
        contents: {
          type: 'bubble',
          body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
            { type: 'text', text: 'สลิปเงินเดือน', weight: 'bold', size: 'lg', color: '#06C755' },
            { type: 'text', text: `ประจำงวด ${slip.period} ออกแล้ว`, size: 'md', margin: 'sm' },
            { type: 'text', text: 'กดเปิดแล้วปลดล็อกด้วยรหัส PIN ส่วนตัวเพื่อดูยอดและดาวน์โหลด PDF', size: 'xs', color: '#888888', wrap: true, margin: 'sm' },
          ] },
          footer: { type: 'box', layout: 'vertical', contents: [
            { type: 'button', style: 'primary', color: '#06C755', action: { type: 'uri', label: 'เปิดสลิป', uri } },
          ] },
        },
      }]);
    }

    const [updated] = await db
      .update(payslips)
      .set({ sentAt: new Date() })
      .where(and(eq(payslips.tenantId, tenantId), eq(payslips.id, id)))
      .returning();
    return updated;
  }
}
