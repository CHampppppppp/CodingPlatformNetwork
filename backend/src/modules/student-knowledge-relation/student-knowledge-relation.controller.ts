import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { StudentKnowledgeRelationService } from "./student-knowledge-relation.service";
import {
  createStudentKnowledgeRelationSchema,
  queryStudentKnowledgeRelationSchema,
  syncRelationsToInteractionsSchema,
} from "./student-knowledge-relation.dto";

@Controller("api/v1/student-knowledge-relations")
export class StudentKnowledgeRelationController {
  constructor(
    private readonly relationService: StudentKnowledgeRelationService,
  ) {}

  @Get()
  async findAll(
    @Query("student_node_id") studentNodeId?: string,
    @Query("knowledge_node_id") knowledgeNodeId?: string,
    @Query("scenario_code") scenarioCode?: string,
    @Query("page") page?: string,
    @Query("page_size") pageSize?: string,
  ) {
    try {
      const query = queryStudentKnowledgeRelationSchema.parse({
        studentNodeId,
        knowledgeNodeId,
        scenarioCode,
        page,
        pageSize,
      });
      return this.relationService.findAll(query);
    } catch (error: any) {
      throw new HttpException(
        error.errors || "VALIDATION_ERROR",
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post()
  async create(@Body() body: unknown) {
    try {
      const dto = createStudentKnowledgeRelationSchema.parse(body);
      return this.relationService.create(dto);
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.errors || "VALIDATION_ERROR",
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post("sync-to-interactions")
  async syncToInteractions(@Body() body: unknown) {
    try {
      const dto = syncRelationsToInteractionsSchema.parse(body);
      return this.relationService.syncToInteractions(dto);
    } catch (error: any) {
      throw new HttpException(
        error.errors || "VALIDATION_ERROR",
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(":studentNodeId/:knowledgeNodeId")
  async delete(
    @Param("studentNodeId") studentNodeId: string,
    @Param("knowledgeNodeId") knowledgeNodeId: string,
  ) {
    return this.relationService.delete(studentNodeId, knowledgeNodeId);
  }
}
