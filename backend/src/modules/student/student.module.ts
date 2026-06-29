import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { ChatbotDimensionService } from './chatbot-dimension.service';
import { ResourceRecommendationService } from './services/resource-recommendation.service';

@Module({
  controllers: [StudentController],
  providers: [StudentService, ChatbotDimensionService, ResourceRecommendationService],
  exports: [StudentService, ChatbotDimensionService, ResourceRecommendationService],
})
export class StudentModule {}