import { Controller, Get, Query } from "@nestjs/common";
import { ClassroomAnalysisService } from "./classroom-analysis.service";

@Controller("api/v1/classroom-analysis")
export class ClassroomAnalysisController {
  constructor(
    private readonly classroomAnalysisService: ClassroomAnalysisService,
  ) {}

  @Get()
  async getClassroomAnalysis(
    @Query("session_id") sessionId?: string,
    @Query("scenario_code") scenarioCode?: string,
    @Query("school_id") schoolId?: string,
    @Query("grade_id") gradeId?: string,
    @Query("class_id") classId?: string,
  ) {
    if (sessionId) {
      return this.classroomAnalysisService.getClassroomAnalysis(sessionId);
    }

    return this.classroomAnalysisService.getClassroomAnalysisByScenario({
      scenarioCode,
      schoolId,
      gradeId,
      classId,
    });
  }
}
