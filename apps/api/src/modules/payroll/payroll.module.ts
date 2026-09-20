import { Controller, Get, Module, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { TenantId } from '../../common/tenant/tenant.decorator';
import { LineModule } from '../line/line.module';
import { PayrollService } from './payroll.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('org_admin')
@Controller('payroll')
class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('runs/:runId/payslips')
  payslips(@TenantId() tenantId: string, @Param('runId') runId: string) {
    return this.payroll.listPayslips(tenantId, runId);
  }

  @Post('payslips/:id/send')
  send(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.payroll.sendSlip(tenantId, id);
  }
}

@Module({
  imports: [LineModule],
  providers: [PayrollService],
  controllers: [PayrollController],
})
export class PayrollModule {}
