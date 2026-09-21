import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsIn, IsNumberString, IsOptional, IsString, MinLength } from 'class-validator';
import { and, eq, inArray } from 'drizzle-orm';
import { db, users } from '@poszee/db';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { TenantId } from '../../common/tenant/tenant.decorator';
import { CryptoService } from '../../common/crypto/crypto.service';

const EMP_ROLES = ['employee', 'supervisor', 'org_admin'] as const;
type EmpRole = (typeof EMP_ROLES)[number];

interface EmployeeInput {
  name?: string;
  employeeCode?: string;
  department?: string;
  position?: string;
  email?: string;
  phone?: string;
  baseSalary?: string;
  role?: EmpRole;
}

@Injectable()
export class EmployeesService {
  constructor(private readonly crypto: CryptoService) {}

  list(tenantId: string) {
    return db
      .select({
        id: users.id,
        name: users.name,
        department: users.department,
        position: users.position,
        role: users.role,
        employeeCode: users.employeeCode,
        email: users.email,
        baseSalary: users.baseSalary,
        active: users.active,
        lineUserId: users.lineUserId,
      })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), inArray(users.role, ['employee', 'supervisor', 'org_admin'])));
  }

  private toRow(tenantId: string, dto: EmployeeInput) {
    const row: Record<string, unknown> = {};
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.employeeCode !== undefined) row.employeeCode = dto.employeeCode || null;
    if (dto.department !== undefined) row.department = dto.department || null;
    if (dto.position !== undefined) row.position = dto.position || null;
    if (dto.email !== undefined) row.email = dto.email || null;
    if (dto.baseSalary !== undefined) row.baseSalary = dto.baseSalary || null;
    if (dto.role !== undefined) row.role = dto.role;
    if (dto.phone !== undefined) row.phoneEnc = dto.phone ? this.crypto.encrypt(dto.phone) : null;
    return row;
  }

  async create(tenantId: string, dto: EmployeeInput) {
    if (!dto.name) throw new BadRequestException('ต้องระบุชื่อ');
    const [u] = await db
      .insert(users)
      .values({ tenantId, role: dto.role ?? 'employee', active: true, ...this.toRow(tenantId, dto), name: dto.name })
      .returning({ id: users.id });
    return { id: u.id };
  }

  async update(tenantId: string, id: string, dto: EmployeeInput) {
    const [existing] = await db.select({ id: users.id }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.id, id))).limit(1);
    if (!existing) throw new NotFoundException('ไม่พบพนักงาน');
    const row = this.toRow(tenantId, dto);
    if (Object.keys(row).length) await db.update(users).set(row).where(eq(users.id, id));
    return { ok: true };
  }

  async remove(tenantId: string, id: string) {
    const [existing] = await db.select({ id: users.id }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.id, id))).limit(1);
    if (!existing) throw new NotFoundException('ไม่พบพนักงาน');
    try {
      await db.delete(users).where(eq(users.id, id));
    } catch {
      // FK restrict (e.g. approved leave/hire) — deactivate instead
      await db.update(users).set({ active: false }).where(eq(users.id, id));
      throw new ConflictException('พนักงานมีประวัติในระบบ ลบไม่ได้ — ปิดการใช้งานแทนแล้ว');
    }
    return { ok: true };
  }

  /** Bulk import already-mapped rows; per-row errors are collected, not fatal. */
  async bulkImport(tenantId: string, rows: EmployeeInput[]) {
    let created = 0;
    const errors: { row: number; reason: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const dto = rows[i];
      if (!dto.name) { errors.push({ row: i + 1, reason: 'ไม่มีชื่อ' }); continue; }
      try {
        await db.insert(users).values({ tenantId, role: dto.role ?? 'employee', active: true, ...this.toRow(tenantId, dto), name: dto.name });
        created++;
      } catch (e) {
        errors.push({ row: i + 1, reason: e instanceof Error ? e.message.slice(0, 120) : 'insert failed' });
      }
    }
    return { created, failed: errors.length, errors: errors.slice(0, 20) };
  }
}

class EmployeeDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() employeeCode?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() position?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsNumberString() baseSalary?: string;
  @IsOptional() @IsIn(EMP_ROLES as unknown as string[]) role?: EmpRole;
}
class ImportDto {
  @IsArray() rows!: EmployeeInput[];
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('org_admin')
@Controller('employees')
class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.employees.list(tenantId);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: EmployeeDto) {
    return this.employees.create(tenantId, dto);
  }

  @Post('import')
  bulkImport(@TenantId() tenantId: string, @Body() dto: ImportDto) {
    return this.employees.bulkImport(tenantId, dto.rows ?? []);
  }

  @Patch(':id')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: EmployeeDto) {
    return this.employees.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.employees.remove(tenantId, id);
  }
}

@Module({
  providers: [EmployeesService],
  controllers: [EmployeesController],
})
export class EmployeesModule {}
