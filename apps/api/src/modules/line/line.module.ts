import { Module } from '@nestjs/common';
import { LineService } from './line.service';
import { LineController } from './line.controller';
import { LineSettingsController } from './line-settings.controller';

@Module({
  providers: [LineService],
  controllers: [LineController, LineSettingsController],
  exports: [LineService],
})
export class LineModule {}
