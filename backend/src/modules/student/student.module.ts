import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { ChatbotDimensionService } from './chatbot-dimension.service';

@Module({
  controllers: [StudentController],
  providers: [StudentService, ChatbotDimensionService],
  exports: [StudentService, ChatbotDimensionService],
})
export class StudentModule {}