import { Module } from "@nestjs/common";
import { StudentKnowledgeRelationService } from "./student-knowledge-relation.service";
import { StudentKnowledgeRelationController } from "./student-knowledge-relation.controller";

@Module({
  controllers: [StudentKnowledgeRelationController],
  providers: [StudentKnowledgeRelationService],
  exports: [StudentKnowledgeRelationService],
})
export class StudentKnowledgeRelationModule {}
