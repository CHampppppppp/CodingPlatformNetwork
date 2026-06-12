import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../shared/utils/prisma.service";

@Injectable()
export class ClassroomAnalysisService {
  constructor(private prisma: PrismaService) {}

  async getClassroomAnalysis(sessionId: string) {
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
  }) {
    const where: any = {};

    if (params.scenarioCode) {
      const scenario = await this.prisma.learningScenario.findUnique({
        where: { code: params.scenarioCode },
        select: { id: true },
      });
      if (scenario) {
        where.scenarioId = scenario.id;
      }
    }

    if (params.schoolId) where.schoolId = params.schoolId;
    if (params.gradeId) where.gradeId = params.gradeId;
    if (params.classId) where.classId = params.classId;

    const sessions = await this.prisma.interactionSession.findMany({
      where,
      select: { id: true },
    });

    if (sessions.length === 0) {
      return {
        data: null,
        meta: null,
        error: "NOT_FOUND",
      };
    }

    const analyses = await this.prisma.sessionClassroomAnalysis.findMany({
      where: {
        sessionId: { in: sessions.map((s) => s.id) },
      },
    });

    if (analyses.length === 0) {
      return {
        data: null,
        meta: null,
        error: "NOT_FOUND",
      };
    }

    return {
      data: analyses[0],
      meta: null,
      error: null,
    };
  }
}
