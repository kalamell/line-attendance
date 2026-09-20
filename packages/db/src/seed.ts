import { scryptSync, randomBytes } from 'node:crypto';
import { db, pool } from './client';

// same format as api CryptoService.hashPassword: "<saltHex>.<hashHex>"
function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}.${scryptSync(password, salt, 32).toString('hex')}`;
}
import {
  tenants,
  tenantLineChannels,
  users,
  officeLocations,
  leaveRequests,
  hireRequests,
  payrollRuns,
  payslips,
  salaryComponents,
} from './schema';

export async function seed(): Promise<void> {
  // platform owner (console login: owner@poszee.com / poszee-admin)
  await db.insert(users).values({
    role: 'super_admin',
    name: 'Super Admin',
    email: 'owner@poszee.com',
    passwordHash: hashPassword('poszee-admin'),
  });

  // demo tenant
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'บริษัท อาหารเด่น จำกัด', subdomain: 'ahaanden', plan: 'pro', status: 'active' })
    .returning();

  await db.insert(tenantLineChannels).values({ tenantId: tenant.id, connected: false });

  const [office] = await db
    .insert(officeLocations)
    .values({ tenantId: tenant.id, name: 'สำนักงานใหญ่ อโศก', lat: 13.7376, lng: 100.5602, radiusM: 150 })
    .returning();

  const [hr] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      role: 'org_admin',
      name: 'กัลยา ผู้จัดการ',
      email: 'kanlaya.hr@company.co.th',
      department: 'ทรัพยากรบุคคล',
      position: 'ผู้ดูแลระบบ HR',
      employeeCode: 'EMP-10001',
      passwordHash: hashPassword('hr-admin'),
    })
    .returning();

  const staff = await db
    .insert(users)
    .values([
      { tenantId: tenant.id, role: 'supervisor', name: 'ปิยะ วงศ์ทอง', department: 'บัญชีและการเงิน', position: 'นักบัญชีอาวุโส', employeeCode: 'EMP-10007', baseSalary: '42000' },
      { tenantId: tenant.id, role: 'employee', name: 'สมชาย ใจดี', department: 'การตลาดดิจิทัล', position: 'เจ้าหน้าที่การตลาด', employeeCode: 'EMP-10245', baseSalary: '35000' },
      { tenantId: tenant.id, role: 'employee', name: 'ณัฐ ศรีสุข', department: 'ไอที', position: 'วิศวกรซอฟต์แวร์', employeeCode: 'EMP-10102', baseSalary: '48000' },
      { tenantId: tenant.id, role: 'employee', name: 'มาลี ดวงแก้ว', department: 'ฝ่ายขาย', position: 'ผู้จัดการเขต', employeeCode: 'EMP-10130', baseSalary: '55000' },
    ])
    .returning();

  const somchai = staff.find((s) => s.employeeCode === 'EMP-10245')!;
  const nat = staff.find((s) => s.employeeCode === 'EMP-10102')!;

  await db.insert(leaveRequests).values([
    { tenantId: tenant.id, userId: nat.id, type: 'sick', startDate: '2026-09-12', endDate: '2026-09-12', days: '1', reason: 'พบแพทย์ตามนัด', status: 'pending' },
    { tenantId: tenant.id, userId: somchai.id, type: 'vacation', startDate: '2026-09-15', endDate: '2026-09-19', days: '5', reason: 'เดินทางต่างจังหวัด', status: 'pending' },
  ]);

  await db.insert(hireRequests).values([
    { tenantId: tenant.id, name: 'สมหญิง รักงาน', position: 'พนักงานขาย', department: 'ฝ่ายขาย', docsComplete: true, appliedAt: '2026-09-10', status: 'pending' },
    { tenantId: tenant.id, name: 'ธนา มั่นคง', position: 'โปรแกรมเมอร์', department: 'ไอที', docsComplete: true, appliedAt: '2026-09-11', status: 'pending' },
  ]);

  // one payroll run with somchai's payslip (matches the design's numbers)
  const [run] = await db
    .insert(payrollRuns)
    .values({ tenantId: tenant.id, period: '2026-08', status: 'draft', totalNet: '37700' })
    .returning();

  const [slip] = await db
    .insert(payslips)
    .values({ tenantId: tenant.id, runId: run.id, userId: somchai.id, gross: '41400', deductions: '3700', net: '37700' })
    .returning();

  await db.insert(salaryComponents).values([
    { tenantId: tenant.id, payslipId: slip.id, kind: 'earning', label: 'เงินเดือน', amount: '35000' },
    { tenantId: tenant.id, payslipId: slip.id, kind: 'earning', label: 'ค่าล่วงเวลา (OT)', amount: '2400' },
    { tenantId: tenant.id, payslipId: slip.id, kind: 'earning', label: 'ค่าตำแหน่ง', amount: '3000' },
    { tenantId: tenant.id, payslipId: slip.id, kind: 'earning', label: 'เบี้ยขยัน', amount: '1000' },
    { tenantId: tenant.id, payslipId: slip.id, kind: 'deduction', label: 'ประกันสังคม', amount: '750' },
    { tenantId: tenant.id, payslipId: slip.id, kind: 'deduction', label: 'ภาษีหัก ณ ที่จ่าย', amount: '1200' },
    { tenantId: tenant.id, payslipId: slip.id, kind: 'deduction', label: 'กองทุนสำรองเลี้ยงชีพ', amount: '1750' },
  ]);

  console.log(`✓ seeded tenant "${tenant.name}" (hr=${hr.email}) with ${staff.length} staff`);
}

if (require.main === module) {
  seed()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}
