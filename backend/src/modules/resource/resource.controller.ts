import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ResourceService } from "./resource.service";
import { createResourceSchema, queryResourceSchema } from "./resource.dto";

@Controller("api/v1/resources")
export class ResourceController {
  constructor(private readonly resourceService: ResourceService) {}

  @Get()
  async queryResources(
    @Query("resource_type") resourceType?: string,
    @Query("knowledge_node_id") knowledgeNodeId?: string,
    @Query("page") page?: string,
    @Query("page_size") pageSize?: string,
  ) {
    try {
      const query = queryResourceSchema.parse({
        resourceType,
        knowledgeNodeId,
        page,
        pageSize,
      });
      return this.resourceService.queryResources(query);
    } catch (error: any) {
      throw new HttpException(
        error.errors || "VALIDATION_ERROR",
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(":id/student-rates")
  async getResourceStudentRates(
    @Param("id") id: string,
    @Query("student_ids") studentIds?: string,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 500;
    const parsedStudentIds = studentIds ? studentIds.split(",") : undefined;
    return this.resourceService.getResourceStudentRates(id, parsedStudentIds, parsedLimit);
  }

  @Post()
  async createResource(@Body() body: unknown) {
    try {
      const dto = createResourceSchema.parse(body);
      return this.resourceService.createResource(dto);
    } catch (error: any) {
      throw new HttpException(
        error.errors || "VALIDATION_ERROR",
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
