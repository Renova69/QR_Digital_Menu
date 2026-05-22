import { Module } from '@nestjs/common';
import { HelpContentController } from './help-content.controller';
import { HelpContentService } from './help-content.service';

@Module({
  controllers: [HelpContentController],
  providers: [HelpContentService],
  exports: [HelpContentService],
})
export class HelpContentModule {}
