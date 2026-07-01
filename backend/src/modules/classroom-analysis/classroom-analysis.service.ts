import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../shared/utils/prisma.service";

type ClassroomAnalysisResponse = {
  data: Prisma.SessionClassroomAnalysisGetPayload<{}> | null;
  meta: null;
  error: string | null;
};

@Injectable()
export class ClassroomAnalysisService {
  constructor(private prisma: PrismaService) {}

  async getClassroomAnalysis(sessionId: string): Promise<ClassroomAnalysisResponse> {
    const analysis = await this.prisma.sessionClassroomAnalysis.findUnique({
      where: { sessionId },
    });

    if (!analysis) {
      return {
        data: null,
        meta: null,
        error: "NOT_FOUND",
      };
    }

    return {
      data: analysis,
      meta: null,
      error: null,
    };
  }

  async getClassroomAnalysisByScenario(params: {
    scenarioCode?: string;
    schoolId?: string;
    gradeId?: string;
    classId?: string;
  }): Promise<ClassroomAnalysisResponse> {
    const where: Prisma.InteractionSessionWhereInput = {};

    if (params.scenarioCode) {
      const scenario = await this.prisma.learningScenario.findUnique({
        where: { code: params.scenarioCode },
        select: { id: true },
      });
      if (!scenario) {
        return {
          data: null,
          meta: null,
          error: "SCENARIO_NOT_FOUND",
        };
      }
      where.scenarioId = scenario.id;
    }

    if (params.schoolId) where.schoolId = params.schoolId;
    if (params.gradeId) where.gradeId = params.gradeId;
    if (params.classId) where.classId = params.classId;

    const session = await this.prisma.interactionSession.findFirst({
      where: {
        ...where,
        classroomAnalysis: { isNot: null },
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      include: { classroomAnalysis: true },
    });

    if (!session) {
      return { data: null, meta: null, error: "NOT_FOUND" };
    }

    return {
      data: session.classroomAnalysis,
      meta: null,
      error: null,
    };
  }
}
