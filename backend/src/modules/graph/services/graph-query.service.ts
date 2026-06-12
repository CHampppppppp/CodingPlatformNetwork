import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared/utils/prisma.service";
import { GraphQuery, ScenarioStatsQuery } from "../types/graph-query.type";

const graphNodeInclude = {
  studentProfile: true,
  teacherProfile: true,
  knowledgeProfile: true,
} satisfies Prisma.GraphNodeInclude;

const interactionInclude = {
  sourceNode: {
    include: graphNodeInclude,
  },
  targetNode: {
    include: graphNodeInclude,
  },
} satisfies Prisma.InteractionInclude;

export type GraphNodeWithProfiles = Prisma.GraphNodeGetPayload<{
  include: typeof graphNodeInclude;
}>;

export type InteractionWithNodes = Prisma.InteractionGetPayload<{
  include: typeof interactionInclude;
}>;

export type OrgNameMaps = {
  schoolNames: Map<string, string>;
  gradeNames: Map<string, string>;
  classNames: Map<string, string>;
};

@Injectable()
export class GraphQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findInteractions(
    params: GraphQuery,
    scenarioId?: string,
  ): Promise<InteractionWithNodes[]> {
    const sourceNodeWhere: Prisma.GraphNodeWhereInput = {};
    if (scenarioId) sourceNodeWhere.scenarioId = scenarioId;
    if (params.schoolId) sourceNodeWhere.schoolId = params.schoolId;
    if (params.gradeId) sourceNodeWhere.gradeId = params.gradeId;
    if (params.classId) sourceNodeWhere.classId = params.classId;

    const interactionWhere: Prisma.InteractionWhereInput = {};
    if (Object.keys(sourceNodeWhere).length > 0) {
      interactionWhere.sourceNode = sourceNodeWhere;
    }

    const interactions = await this.prisma.interaction.findMany({
      where: interactionWhere,
      include: interactionInclude,
    });

    if (!params.classId) {
      return interactions;
    }

    return interactions.filter((interaction) => {
      if (interaction.targetNode.nodeType === "Student") {
        return interaction.targetNode.classId === params.classId;
      }
      return true;
    });
  }

  async findDirectNodes(
    params: GraphQuery,
    scenarioId?: string,
  ): Promise<GraphNodeWithProfiles[]> {
    const nodeWhere: Prisma.GraphNodeWhereInput = {
      nodeType: { not: "Knowledge" },
    };

    if (scenarioId) nodeWhere.scenarioId = scenarioId;
    if (params.schoolId) nodeWhere.schoolId = params.schoolId;
    if (params.gradeId) nodeWhere.gradeId = params.gradeId;
    if (params.classId) nodeWhere.classId = params.classId;

    return this.prisma.graphNode.findMany({
      where: nodeWhere,
      include: graphNodeInclude,
    });
  }

  async findStudentNodeIds(
    params: GraphQuery,
    scenarioId?: string,
  ): Promise<string[]> {
    const nodeWhere: Prisma.GraphNodeWhereInput = { nodeType: "Student" };
    if (params.schoolId) nodeWhere.schoolId = params.schoolId;
    if (params.gradeId) nodeWhere.gradeId = params.gradeId;
    if (params.classId) nodeWhere.classId = params.classId;
    if (scenarioId) nodeWhere.scenarioId = scenarioId;

    const studentNodes = await this.prisma.graphNode.findMany({
      where: nodeWhere,
      select: { id: true },
    });

    return studentNodes.map((node) => node.id);
  }

  async getOrgNameMaps(): Promise<OrgNameMaps> {
    const [schools, grades, classes] = await Promise.all([
      this.prisma.school.findMany({ select: { id: true, name: true } }),
      this.prisma.grade.findMany({ select: { id: true, gradeName: true } }),
      this.prisma.schoolClass.findMany({
        select: { id: true, className: true },
      }),
    ]);

    return {
      schoolNames: new Map(schools.map((school) => [school.id, school.name])),
      gradeNames: new Map(
        grades.map((grade) => [grade.id, grade.gradeName.toString()]),
      ),
      classNames: new Map(
        classes.map((schoolClass) => [
          schoolClass.id,
          String(schoolClass.className),
        ]),
      ),
    };
  }

  async getScenarioStats(params: ScenarioStatsQuery) {
    const scenarios = await this.prisma.learningScenario.findMany({
      where: { isActive: true },
      select: { id: true, code: true, nameZh: true },
      orderBy: { sortOrder: "asc" },
    });

    const stats: Array<{
      scenarioCode: string;
      scenarioNameZh: string;
      nodeCount: number;
      linkCount: number;
      avgStrength: number;
      density: number;
      studentTeacherRatio: number;
    }> = [];

    for (const scenario of scenarios) {
      const sessions = await this.prisma.interactionSession.findMany({
        where: {
          scenarioId: scenario.id,
          ...(params.schoolId ? { schoolId: params.schoolId } : {}),
          ...(params.gradeId ? { gradeId: params.gradeId } : {}),
          ...(params.classId ? { classId: params.classId } : {}),
          ...(params.from || params.to
            ? {
                occurredAt: {
                  ...(params.from ? { gte: new Date(params.from) } : {}),
                  ...(params.to ? { lte: new Date(params.to) } : {}),
                },
              }
            : {}),
        },
        select: { id: true },
      });

      if (sessions.length === 0) {
        stats.push({
          scenarioCode: scenario.code,
          scenarioNameZh: scenario.nameZh,
          nodeCount: 0,
          linkCount: 0,
          avgStrength: 0,
          density: 0,
          studentTeacherRatio: 0,
        });
        continue;
      }

      const interactions = await this.prisma.interaction.findMany({
        where: { sessionId: { in: sessions.map((session) => session.id) } },
        select: {
          sourceNodeId: true,
          targetNodeId: true,
          strength: true,
          sourceNode: { select: { nodeType: true } },
          targetNode: { select: { nodeType: true } },
        },
      });

      const nodeIds = new Set<string>();
      let totalStrength = 0;
      let studentNodeCount = 0;
      let teacherNodeCount = 0;
      const seenNodeTypes = new Map<string, string>();

      for (const item of interactions) {
        nodeIds.add(item.sourceNodeId);
        nodeIds.add(item.targetNodeId);
        totalStrength += Number(item.strength);

        if (!seenNodeTypes.has(item.sourceNodeId)) {
          seenNodeTypes.set(item.sourceNodeId, item.sourceNode.nodeType);
        }
        if (!seenNodeTypes.has(item.targetNodeId)) {
          seenNodeTypes.set(item.targetNodeId, item.targetNode.nodeType);
        }
      }

      for (const nodeType of seenNodeTypes.values()) {
        if (nodeType === "STUDENT") {
          studentNodeCount += 1;
        }
        if (nodeType === "TEACHER") {
          teacherNodeCount += 1;
        }
      }

      const nodeCount = nodeIds.size;
      const linkCount = interactions.length;
      const avgStrength = linkCount === 0 ? 0 : totalStrength / linkCount;
      const density =
        nodeCount <= 1 ? 0 : linkCount / (nodeCount * (nodeCount - 1));
      const studentTeacherRatio =
        teacherNodeCount === 0 ? 0 : studentNodeCount / teacherNodeCount;

      stats.push({
        scenarioCode: scenario.code,
        scenarioNameZh: scenario.nameZh,
        nodeCount,
        linkCount,
        avgStrength: Number(avgStrength.toFixed(3)),
        density: Number(density.toFixed(3)),
        studentTeacherRatio: Number(studentTeacherRatio.toFixed(3)),
      });
    }

    return stats;
  }
}
