import { Module } from '@nestjs/common';
import { ClassroomAnalysisController } from './classroom-analysis.controller';
import { ClassroomAnalysisService } from './classroom-analysis.service';

@Module({
  controllers: [ClassroomAnalysisController],
  providers: [ClassroomAnalysisService],
  exports: [ClassroomAnalysisService],
})
export class ClassroomAnalysisModule {}
