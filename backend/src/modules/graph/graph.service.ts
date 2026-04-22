import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../shared/utils/prisma.service";
import { GraphData, Link, Node } from "../../shared/types/graph-data.type";

/**
 * 图服务
 * 支持按场景隔离的图数据查询和统计
 */

type GraphQuery = {
  scenarioCode?: string;
  schoolId?: string;
  gradeId?: string;
  classId?: string;
  from?: string;
  to?: string;
};

@Injectable()
export class GraphService {
  constructor(private prisma: PrismaService) {}

  async getGraphData(params: GraphQuery) {
    const where = await this.buildSessionWhere(params);

    const sessions = await this.prisma.interactionSession.findMany({
      where,
      select: { id: true },
    });

    const schoolNames = await this.buildSchoolNameMap();
    const gradeNames = await this.buildGradeNameMap();
    const classNames = await this.buildClassNameMap();

    // 从params中获取scenarioCode，用于后续的场景过滤
    let scenarioId: string | undefined;
    if (params.scenarioCode) {
      const scenario = await this.prisma.learningScenario.findUnique({
        where: { code: params.scenarioCode },
        select: { id: true },
      });
      if (scenario) {
        scenarioId = scenario.id;
      }
    }

    // 只有当有会话时才查询交互
    let interactions = [];
    if (sessions.length > 0) {
      const sessionIds = sessions.map((session) => session.id);
      interactions = await this.prisma.interaction.findMany({
        where: {
          sessionId: { in: sessionIds },
          ...(scenarioId
            ? {
                sourceNode: { scenarioId },
                targetNode: { scenarioId },
              }
            : {}),
        },
        include: {
          sourceNode: {
            include: {
              studentProfile: true,
              teacherProfile: true,
              knowledgeProfile: true,
            },
          },
          targetNode: {
            include: {
              studentProfile: true,
              teacherProfile: true,
              knowledgeProfile: true,
            },
          },
        },
      });
    }

    const nodeMap = new Map<string, Node>();

    // 从交互中提取节点
    for (const interaction of interactions) {
      this.putNode(
        nodeMap,
        interaction.sourceNode,
        schoolNames,
        gradeNames,
        classNames,
      );
      this.putNode(
        nodeMap,
        interaction.targetNode,
        schoolNames,
        gradeNames,
        classNames,
      );
    }

    // 直接查询符合条件的所有节点（包括没有参与交互的教师节点）
    // 构建节点查询条件，确保使用正确的场景ID
    const nodeWhere: any = {
      ...(scenarioId ? { scenarioId } : {}),
    };

    // 只有当params中存在对应的ID时才添加到查询条件中
    if (params.schoolId) nodeWhere.schoolId = params.schoolId;
    if (params.gradeId) nodeWhere.gradeId = params.gradeId;
    if (params.classId) nodeWhere.classId = params.classId;

    const directNodes = await this.prisma.graphNode.findMany({
      where: {
        ...nodeWhere,
        nodeType: { not: "Knowledge" },
      },
      include: {
        studentProfile: true,
        teacherProfile: true,
        knowledgeProfile: true,
      },
    });

    // 添加直接查询到的节点
    for (const node of directNodes) {
      this.putNode(nodeMap, node, schoolNames, gradeNames, classNames);
    }

    const mapInteractionType = (type: string): "PHYSICAL" | "PLATFORM" => {
      return type === "PLATFORM" ? "PLATFORM" : "PHYSICAL";
    };

    const TEACHER_STUDENT_ACTIONS = ["TEACHER_EVALUATION", "HELP_SEEKING"];
    const filteredInteractions = interactions.filter((interaction) => {
      const isTeacherStudent =
        (interaction.sourceNode.nodeType === "Teacher" &&
          interaction.targetNode.nodeType === "Student") ||
        (interaction.sourceNode.nodeType === "Student" &&
          interaction.targetNode.nodeType === "Teacher");
      return !(
        isTeacherStudent &&
        interaction.actionType &&
        TEACHER_STUDENT_ACTIONS.includes(interaction.actionType)
      );
    });

    const links: Link[] = filteredInteractions.map((interaction) => ({
      source: interaction.sourceNodeId,
      target: interaction.targetNodeId,
      value: Number(interaction.strength),
      type: mapInteractionType(interaction.interactionType),
      actionType: interaction.actionType,
      createdAt: interaction.createdAt.toISOString(),
    }));

    const nodes = Array.from(nodeMap.values());

    const surveyStats = await this.computeSurveyStats(params);

    return {
      data: {
        nodes,
        links,
        meta: {
          nodeCount: nodes.length,
          linkCount: links.length,
          scenarioCode: params.scenarioCode ?? "ALL",
          surveyStats,
        },
      } as GraphData,
      meta: null,
      error: null,
    };
  }

  private async computeSurveyStats(params: GraphQuery) {
    try {
      let scenarioId: string | undefined;
      if (params.scenarioCode) {
        const scenario = await this.prisma.learningScenario.findUnique({
          where: { code: params.scenarioCode },
          select: { id: true },
        });
        if (scenario) scenarioId = scenario.id;
      }

      const where: any = {};
      if (scenarioId) where.scenarioId = scenarioId;

      let studentNodeIds: string[] | undefined;
      if (params.classId || params.gradeId || params.schoolId) {
        const nodeWhere: any = { nodeType: 'Student' };
        if (params.schoolId) nodeWhere.schoolId = params.schoolId;
        if (params.gradeId) nodeWhere.gradeId = params.gradeId;
        if (params.classId) nodeWhere.classId = params.classId;
        if (scenarioId) nodeWhere.scenarioId = scenarioId;

        const studentNodes = await this.prisma.graphNode.findMany({
          where: nodeWhere,
          select: { id: true },
        });
        studentNodeIds = studentNodes.map((n) => n.id);
        if (studentNodeIds.length > 0) {
          where.studentNodeId = { in: studentNodeIds };
        } else {
          return null;
        }
      }

      const responses = await this.prisma.studentSurveyResponse.findMany({
        where,
        select: {
          aiContentSatisfaction: true,
          resourceHelpfulness: true,
          posterSatisfaction: true,
          motivationScore: true,
          attitudeScore: true,
          engagementScore: true,
          selfRegulationScore: true,
          computationalThinkingScore: true,
          learningMethodScore: true,
          cognitiveLoadScore: true,
          humanAiTrustScore: true,
          aiLiteracyScore: true,
          priorKnowledgeScore: true,
        },
      });

      if (responses.length === 0) {
        return null;
      }

      const validSatisfactionResponses = responses.filter(
        (r) =>
          r.aiContentSatisfaction !== null &&
          r.resourceHelpfulness !== null &&
          r.posterSatisfaction !== null,
      );
      const personalSatisfactionScores = validSatisfactionResponses.map((r) => {
        const q4 = Number(r.aiContentSatisfaction);
        const q5 = Number(r.resourceHelpfulness);
        const q6 = Number(r.posterSatisfaction);
        return (q4 + q5 + q6) / 3;
      });
      const overallSatisfactionAvg =
        personalSatisfactionScores.length > 0
          ? Number(
              (
                personalSatisfactionScores.reduce((a, b) => a + b, 0) /
                personalSatisfactionScores.length
              ).toFixed(2),
            )
          : 0;

      const sum = (key: keyof (typeof responses)[0]) =>
        responses.reduce(
          (acc, r) => acc + (r[key] !== null ? Number(r[key]) : 0),
          0,
        );
      const count = (key: keyof (typeof responses)[0]) =>
        responses.filter((r) => r[key] !== null).length;
      const avg = (key: keyof (typeof responses)[0]) => {
        const c = count(key);
        return c > 0 ? Number((sum(key) / c).toFixed(2)) : 0;
      };

      return {
        pushed: responses.length,
        filled: validSatisfactionResponses.length,
        score: Number(overallSatisfactionAvg.toFixed(1)),
        percentage: Math.round((overallSatisfactionAvg / 5) * 100),
        knowledgeReserve: avg("priorKnowledgeScore"),
        learningEngagement: avg("engagementScore"),
        cognitiveLoad: avg("cognitiveLoadScore"),
        learningMotivation: avg("motivationScore"),
        computationalThinking: avg("computationalThinkingScore"),
        humanAiTrust: avg("humanAiTrustScore"),
        learningMethod: avg("learningMethodScore"),
        learningAttitude: avg("attitudeScore"),
        selfRegulatedLearning: avg("selfRegulationScore"),
        aiLiteracy: avg("aiLiteracyScore"),
      };
    } catch {
      return null;
    }
  }

  async getScenarioStats(params: Omit<GraphQuery, "scenarioCode">) {
    const scenarios = await this.prisma.learningScenario.findMany({
      where: { isActive: true },
      select: { id: true, code: true, nameZh: true },
      orderBy: { sortOrder: "asc" },
    });

    const stats = [] as Array<{
      scenarioCode: string;
      scenarioNameZh: string;
      nodeCount: number;
      linkCount: number;
      avgStrength: number;
      density: number;
      studentTeacherRatio: number;
    }>;

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
        where: { sessionId: { in: sessions.map((s) => s.id) } },
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

    return {
      data: stats,
      meta: null,
      error: null,
    };
  }

  private async buildSessionWhere(params: GraphQuery) {
    let scenarioId: string | undefined;

    if (params.scenarioCode) {
      const scenario = await this.prisma.learningScenario.findUnique({
        where: { code: params.scenarioCode },
        select: { id: true },
      });

      if (!scenario) {
        throw new BadRequestException("SCENARIO_CODE_INVALID");
      }

      scenarioId = scenario.id;
    }

    return {
      ...(scenarioId ? { scenarioId } : {}),
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
    } as Prisma.InteractionSessionWhereInput;
  }

  private putNode(
    nodeMap: Map<string, Node>,
    node: any,
    schoolNames: Map<string, string>,
    gradeNames: Map<string, string>,
    classNames: Map<string, string>,
  ) {
    if (nodeMap.has(node.id)) {
      return;
    }

    if (node.nodeType?.toUpperCase() === "STUDENT") {
      nodeMap.set(node.id, {
        id: node.id,
        type: "STUDENT",
        name: node.displayName,
        group: 3,
        val: 8,
        studentProfile: {
          school: node.schoolId
            ? schoolNames.get(node.schoolId) ?? node.schoolId
            : null,
          grade: node.gradeId
            ? gradeNames.get(node.gradeId) ?? node.gradeId
            : null,
          classId: node.classId
            ? classNames.get(node.classId) ?? node.classId
            : null,
          externalUserId: node.studentProfile?.externalUserId ?? null,
          learningStylePreference:
            node.studentProfile?.learningStylePreference ?? null,
          personality: node.studentProfile?.personality ?? null,
          groupBehavior: node.studentProfile?.groupBehavior ?? null,
        },
      });
      return;
    }

    if (node.nodeType?.toUpperCase() === "TEACHER") {
      nodeMap.set(node.id, {
        id: node.id,
        type: "TEACHER",
        name: node.displayName,
        group: 1,
        val: 25,
        teacherProfile: {
          school: node.schoolId
            ? schoolNames.get(node.schoolId) ?? node.schoolId
            : null,
          teachingGrade:
            node.teacherProfile?.teachingGrade ??
            (node.gradeId
              ? gradeNames.get(node.gradeId) ?? node.gradeId
              : null),
          teachingClass:
            node.teacherProfile?.teachingClass ??
            (node.classId
              ? classNames.get(node.classId) ?? node.classId
              : null),
          subject: node.teacherProfile?.subject ?? null,
        },
      });
      return;
    }

    nodeMap.set(node.id, {
      id: node.id,
      type: "KNOWLEDGE",
      name: node.displayName,
      group: 2,
      val: 15,
      knowledgeProfile: {
        content: node.knowledgeProfile?.content ?? null,
        type: node.knowledgeProfile?.knowledgeType ?? null,
        category: node.knowledgeProfile?.category ?? null,
        parentId: node.knowledgeProfile?.parentNodeId ?? null,
      },
    });
  }

  private async buildSchoolNameMap(): Promise<Map<string, string>> {
    const schoolNames = new Map<string, string>();
    const schools = await this.prisma.school.findMany({
      select: { id: true, name: true },
    });
    for (const school of schools) {
      schoolNames.set(school.id, school.name);
    }
    return schoolNames;
  }

  private async buildGradeNameMap(): Promise<Map<string, string>> {
    const gradeNames = new Map<string, string>();
    const grades = await this.prisma.grade.findMany({
      select: { id: true, gradeName: true },
    });
    for (const grade of grades) {
      gradeNames.set(grade.id, grade.gradeName.toString());
    }
    return gradeNames;
  }

  private async buildClassNameMap(): Promise<Map<string, string>> {
    const classNames = new Map<string, string>();
    const classes = await this.prisma.schoolClass.findMany({
      select: { id: true, className: true },
    });
    for (const cls of classes) {
      classNames.set(cls.id, String(cls.className));
    }
    return classNames;
  }
}
