import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { OrgService } from "./org.service";

@Controller("api/v1/org")
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Get("schools")
  async getSchools(@Query("scenario_code") scenarioCode?: string) {
    return this.orgService.getSchools(scenarioCode);
  }

  @Get("grades")
  async getGrades(
    @Query("school_id") schoolId?: string,
    @Query("school") school?: string,
    @Query("scenario_code") scenarioCode?: string,
  ) {
    if (!schoolId) {
      if (school) {
        throw new BadRequestException("仅支持 school_id 参数");
      }
      throw new BadRequestException("school_id 为必填参数");
    }

    return this.orgService.getGrades(schoolId, scenarioCode);
  }

  @Get("classes")
  async getClasses(
    @Query("grade_id") gradeId?: string,
    @Query("grade") grade?: string,
    @Query("scenario_code") scenarioCode?: string,
  ) {
    if (!gradeId) {
      if (grade) {
        throw new BadRequestException("仅支持 grade_id 参数");
      }
      throw new BadRequestException("grade_id 为必填参数");
    }

    return this.orgService.getClasses(gradeId, scenarioCode);
  }

  @Get("hierarchy")
  async getOrgHierarchy(@Query("scenario_code") scenarioCode?: string) {
    return this.orgService.getOrgHierarchy(scenarioCode);
  }
}
