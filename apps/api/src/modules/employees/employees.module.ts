import { Controller, Get, Injectable, Module, UseGuards } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { db, users } from '@poszee/db';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { TenantId } from '../../common/tenant/tenant.decorator';

@Injectable()
export class EmployeesService {
  list(tenantId: string) {
    return db
      .select({
        id: users.id,
        name: users.name,
        department: users.department,
        position: users.position,
        role: users.role,
        employeeCode: users.employeeCode,
        active: users.active,
      })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), inArray(users.role, ['employee', 'supervisor', 'org_admin'])));
  }
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
}

@Module({
  providers: [EmployeesService],
  controllers: [EmployeesController],
})
export class EmployeesModule {}
