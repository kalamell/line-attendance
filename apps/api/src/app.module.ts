import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { resolve } from 'node:path';
import { CommonModule } from './common/common.module';
import { TenantMiddleware } from './common/tenant/tenant.middleware';
import { HealthModule } from './modules/health/health.module';
import { LineModule } from './modules/line/line.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { LeaveModule } from './modules/leave/leave.module';
import { HireModule } from './modules/hire/hire.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { MeModule } from './modules/me/me.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(process.cwd(), '../../.env'), '.env'],
    }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'dev-secret',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' },
    }),
    CommonModule,
    HealthModule,
    LineModule,
    AuthModule,
    TenantsModule,
    AttendanceModule,
    EmployeesModule,
    LeaveModule,
    HireModule,
    PayrollModule,
    MeModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
