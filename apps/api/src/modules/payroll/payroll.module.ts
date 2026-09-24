import { Body, Controller, Delete, Get, Module, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsNumberString, IsString, Matches, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { TenantId } from '../../common/tenant/tenant.decorator';
import { LineModule } from '../line/line.module';
import { PayrollService } from './payroll.service';

class GenerateDto {
  @Matches(/^\d{4}-\d{2}$/, { message: 'period ต้องเป็น YYYY-MM' }) period!: string;
}
class ComponentDto {
  @IsIn(['earning', 'deduction']) kind!: 'earning' | 'deduction';
  @IsString() @MinLength(1) label!: string;
  @IsNumberString() amount!: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('org_admin')
@Controller('payroll')
class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('runs')
  runs(@TenantId() tenantId: string) {
    return this.payroll.listRuns(tenantId);
  }

  @Post('runs')
  generate(@TenantId() tenantId: string, @Body() dto: GenerateDto) {
    return this.payroll.generateRun(tenantId, dto.period);
  }

  @Post('runs/:runId/approve')
  approve(@TenantId() tenantId: string, @Param('runId') runId: string) {
    return this.payroll.approveRun(tenantId, runId);
  }

  @Get('runs/:runId/payslips')
  payslips(@TenantId() tenantId: string, @Param('runId') runId: string) {
    return this.payroll.listPayslips(tenantId, runId);
  }

  @Get('stats')
  stats(@TenantId() tenantId: string, @Query('period') period: string) {
    return this.payroll.attendanceStats(tenantId, period);
  }

  @Get('payslips/:id/components')
  components(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.payroll.components(tenantId, id);
  }

  @Post('payslips/:id/components')
  addComponent(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: ComponentDto) {
    return this.payroll.addComponent(tenantId, id, dto);
  }

  @Delete('components/:id')
  removeComponent(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.payroll.removeComponent(tenantId, id);
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
