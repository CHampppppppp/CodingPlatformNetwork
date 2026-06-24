import {
  Controller,
  Get,
  Param,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { StudentService } from "./student.service";
import { ChatbotDimensionService } from "./chatbot-dimension.service";

@Controller("api/v1/students")
export class StudentController {
  constructor(
    private readonly studentService: StudentService,
    private readonly chatbotDimensionService: ChatbotDimensionService,
  ) {}

  @Get(":id/cognitive-template")
  async getCognitiveTemplate(@Param("id") id: string) {
    const result = await this.studentService.getLatestCognitiveTemplate(id);
    if (!result) {
      throw new HttpException("学生不存在", HttpStatus.NOT_FOUND);
    }
    return result;
  }

  @Get(":id/expert-intervention")
  async getExpertIntervention(@Param("id") id: string) {
    const result = await this.studentService.getExpertIntervention(id);
    if (!result || result.error) {
      throw new HttpException(
        result?.error || "获取专家干预数据失败",
        HttpStatus.NOT_FOUND,
      );
    }
    return result;
  }

  @Get(":id/chatbot-dimension-increment")
  async getChatbotDimensionIncrement(@Param("id") id: string) {
    const result =
      await this.chatbotDimensionService.getDimensionIncrement(id);
    if (!result) {
      throw new HttpException(
        "该学生无 chatbot 维度增量数据（仅展示场景 801 班可用）",
        HttpStatus.NOT_FOUND,
      );
    }
    return {
      data: result,
      meta: null,
      error: null,
    };
  }
}
