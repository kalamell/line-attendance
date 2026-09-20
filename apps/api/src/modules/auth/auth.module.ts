import { Module } from '@nestjs/common';
import { LineModule } from '../line/line.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [LineModule],
  providers: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
