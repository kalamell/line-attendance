import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { and, desc, eq } from 'drizzle-orm';
import { db, payrollRuns, payslips, salaryComponents, users, tenants } from '@poszee/db';
import { CryptoService } from '../../common/crypto/crypto.service';
import { SARABUN_REGULAR_B64, SARABUN_BOLD_B64 } from './fonts';

const REG = Buffer.from(SARABUN_REGULAR_B64, 'base64');
const BOLD = Buffer.from(SARABUN_BOLD_B64, 'base64');
const baht = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

@Injectable()
export class PdfService {
  constructor(private readonly crypto: CryptoService) {}

  private render(opts: { userPassword?: string }, draw: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4', margin: 48,
        ...(opts.userPassword ? { userPassword: opts.userPassword, ownerPassword: opts.userPassword, pdfVersion: '1.7' as const } : {}),
        info: { Producer: 'TimeLine', Creator: 'TimeLine' },
      });
      doc.registerFont('th', REG);
      doc.registerFont('th-b', BOLD);
      doc.font('th');
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      try { draw(doc); doc.end(); } catch (e) { reject(e); }
    });
  }

  /** Employee payslip PDF, encrypted with the employee's PIN when set. */
  async payslip(tenantId: string, payslipId: string): Promise<{ buf: Buffer; filename: string }> {
    const [row] = await db
      .select({
        gross: payslips.gross, deductions: payslips.deductions, net: payslips.net,
        period: payrollRuns.period, name: users.name, code: users.employeeCode,
        department: users.department, position: users.position, pinEnc: users.payslipPinEnc,
        tenantName: tenants.name,
      })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .innerJoin(users, eq(users.id, payslips.userId))
      .innerJoin(tenants, eq(tenants.id, payslips.tenantId))
      .where(and(eq(payslips.tenantId, tenantId), eq(payslips.id, payslipId)))
      .limit(1);
    if (!row) throw new NotFoundException('ไม่พบสลิป');
    const comps = await db.select().from(salaryComponents).where(eq(salaryComponents.payslipId, payslipId));
    const earnings = comps.filter((c) => c.kind === 'earning');
    const deductions = comps.filter((c) => c.kind === 'deduction');
    const pin = row.pinEnc ? this.crypto.decrypt(row.pinEnc) : undefined;

    const buf = await this.render({ userPassword: pin }, (doc) => {
      doc.font('th-b').fontSize(20).fillColor('#06C755').text(row.tenantName, { align: 'left' });
      doc.font('th').fontSize(12).fillColor('#333').text('สลิปเงินเดือน / Payslip', { align: 'left' });
      doc.moveDown(0.3).fontSize(11).fillColor('#666').text(`งวดประจำเดือน ${row.period}`);
      doc.moveDown(0.8);
      doc.fillColor('#111').fontSize(11);
      doc.font('th-b').text(`${row.name}`, { continued: true }).font('th').text(`   ${row.code ?? ''}`);
      doc.fillColor('#666').text(`${row.position ?? ''}${row.department ? ' · ' + row.department : ''}`);
      doc.moveDown(0.6);
      const line = () => { doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#E5E8EB').stroke(); doc.moveDown(0.4); };
      const rowItem = (label: string, amount: string, color = '#111') => {
        const y = doc.y;
        doc.fillColor('#333').font('th').fontSize(11).text(label, 56, y, { width: 350 });
        doc.fillColor(color).text(amount, 400, y, { width: 147, align: 'right' });
        doc.moveDown(0.2);
      };
      line();
      doc.font('th-b').fillColor('#06C755').fontSize(12).text('รายได้'); doc.moveDown(0.2);
      earnings.forEach((e) => rowItem(e.label, baht(Number(e.amount)), '#0a7a3f'));
      doc.moveDown(0.3);
      doc.font('th-b').fillColor('#C0392B').fontSize(12).text('รายการหัก'); doc.moveDown(0.2);
      deductions.forEach((d) => rowItem(d.label, '-' + baht(Number(d.amount)), '#C0392B'));
      doc.moveDown(0.4); line();
      const y = doc.y + 4;
      doc.roundedRect(48, y, 499, 44, 8).fill('#E9FBF1');
      doc.fillColor('#06C755').font('th-b').fontSize(13).text('เงินได้สุทธิ', 60, y + 13);
      doc.fontSize(16).text('฿' + baht(Number(row.net)), 300, y + 11, { width: 235, align: 'right' });
      doc.moveDown(4).fillColor('#999').font('th').fontSize(9)
        .text('เอกสารนี้ออกโดยระบบอัตโนมัติ · รายได้รวม ฿' + baht(Number(row.gross)) + ' · รายการหักรวม ฿' + baht(Number(row.deductions)), 48, doc.y, { align: 'center' });
    });
    return { buf, filename: `payslip-${row.period}.pdf` };
  }

  /** Latest payslip PDF for an employee (their own). */
  async payslipForUser(tenantId: string, userId: string) {
    const [p] = await db
      .select({ id: payslips.id })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .where(and(eq(payslips.tenantId, tenantId), eq(payslips.userId, userId)))
      .orderBy(desc(payrollRuns.period))
      .limit(1);
    if (!p) throw new NotFoundException('ยังไม่มีสลิปเงินเดือน');
    return this.payslip(tenantId, p.id);
  }

  /** 50 ทวิ — withholding tax certificate for a user + year. */
  async taxCertificate(tenantId: string, userId: string, year: number): Promise<{ buf: Buffer; filename: string }> {
    const [emp] = await db.select({ name: users.name, code: users.employeeCode, nationalIdEnc: users.nationalIdEnc, pinEnc: users.payslipPinEnc }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.id, userId))).limit(1);
    if (!emp) throw new NotFoundException('ไม่พบพนักงาน');
    const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    // sum income (gross) + withholding tax across the year's payslips
    const slips = await db
      .select({ id: payslips.id, gross: payslips.gross, period: payrollRuns.period })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .where(and(eq(payslips.tenantId, tenantId), eq(payslips.userId, userId)));
    const yr = String(year);
    let income = 0, wht = 0, sso = 0;
    for (const s of slips) {
      if (!(s.period ?? '').startsWith(yr)) continue;
      income += Number(s.gross);
      const comps = await db.select().from(salaryComponents).where(eq(salaryComponents.payslipId, s.id));
      for (const c of comps) {
        if (c.kind === 'deduction' && c.label.includes('ภาษี')) wht += Number(c.amount);
        if (c.kind === 'deduction' && c.label.includes('ประกันสังคม')) sso += Number(c.amount);
      }
    }
    const nid = emp.nationalIdEnc ? this.crypto.decrypt(emp.nationalIdEnc) : '-';
    const pin = emp.pinEnc ? this.crypto.decrypt(emp.pinEnc) : undefined;

    const buf = await this.render({ userPassword: pin }, (doc) => {
      doc.font('th-b').fontSize(16).fillColor('#111').text('หนังสือรับรองการหักภาษี ณ ที่จ่าย', { align: 'center' });
      doc.font('th').fontSize(12).fillColor('#666').text('(ใบ 50 ทวิ) ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร', { align: 'center' });
      doc.moveDown(0.4).fontSize(11).fillColor('#333').text(`ปีภาษี ${year + 543}`, { align: 'center' });
      doc.moveDown(1);
      const field = (l: string, v: string) => { doc.font('th-b').fillColor('#333').fontSize(11).text(l, { continued: true }).font('th').fillColor('#111').text('  ' + v); doc.moveDown(0.3); };
      field('ผู้จ่ายเงินได้ (นายจ้าง):', tenant?.name ?? '-');
      field('ผู้มีเงินได้ (พนักงาน):', `${emp.name}  ${emp.code ?? ''}`);
      field('เลขประจำตัวผู้เสียภาษี/บัตรประชาชน:', nid);
      doc.moveDown(0.6);
      doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#E5E8EB').stroke(); doc.moveDown(0.5);
      const rowItem = (l: string, v: string) => { const y = doc.y; doc.font('th').fillColor('#333').fontSize(11).text(l, 56, y, { width: 350 }); doc.font('th-b').fillColor('#111').text('฿' + v, 400, y, { width: 147, align: 'right' }); doc.moveDown(0.3); };
      rowItem('เงินได้พึงประเมินที่จ่ายทั้งปี', baht(income));
      rowItem('ประกันสังคมที่หักทั้งปี', baht(sso));
      doc.moveDown(0.2); doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#E5E8EB').stroke(); doc.moveDown(0.4);
      const y = doc.y + 2; doc.roundedRect(48, y, 499, 40, 8).fill('#FDECEC');
      doc.fillColor('#C0392B').font('th-b').fontSize(12).text('ภาษีที่หักและนำส่งทั้งปี', 60, y + 12);
      doc.fontSize(15).text('฿' + baht(wht), 300, y + 10, { width: 235, align: 'right' });
      doc.moveDown(4).font('th').fillColor('#999').fontSize(9).text('ออกโดยระบบ TimeLine · โปรดตรวจสอบกับฝ่ายบุคคล/นักบัญชีก่อนใช้ยื่นภาษี', { align: 'center' });
    });
    return { buf, filename: `50tawi-${year}.pdf` };
  }
}
