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

const dimCodes: Record<string, string[]> = {
  knowledgeReserve: ["COG_READING", "COG_LANGUAGE", "COG_SCIENCE_KNOWLEDGE"],
  learningEngagement: ["COG_SCIENCE_INQUIRY", "PRAC_PRACTICE", "PRAC_COLLABORATION"],
  cognitiveLoad: ["PSY_ANXIETY", "PSY_DEPRESSION", "PSY_PRESSURE"],
  learningMotivation: ["PSY_RESILIENCE"],
  computationalThinking: ["COG_COMPUTATIONAL"],
  humanAiTrust: ["COG_TECH_LITERACY"],
  learningMethod: ["PRAC_PROBLEM_SOLVING", "PRAC_COLLABORATION"],
  learningAttitude: ["PRAC_INNOVATION"],
  selfRegulatedLearning: ["PRAC_PROBLEM_SOLVING"],
  aiLiteracy: ["COG_TECH_LITERACY"],
};

const multipliers: Record<string, number> = {
  knowledgeReserve: 1 / 2,
  learningEngagement: 1 / 2,
  cognitiveLoad: 0.5,
  learningMotivation: 1 / 2,
  computationalThinking: 1 / 2,
  humanAiTrust: 1 / 2,
  learningMethod: 1 / 2,
  learningAttitude: 1 / 2,
  selfRegulatedLearning: 1 / 2,
  aiLiteracy: 1 / 2,
};

function computeDimension(
  dimMap: Map<string, number>,
  codes: string[],
  multiplier: number,
): number {
  const values = codes
    .map((code) => dimMap.get(code) ?? 0)
    .filter((v) => v > 0);
  if (values.length === 0) return 0;
  return (values.reduce((a, b) => a + b, 0) / values.length) * multiplier;
}

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

    await this.addMockTeacherNodes(nodeMap, scenarioId, schoolNames, gradeNames, classNames);

    const mapInteractionType = (type: string): "PHYSICAL" | "PLATFORM" => {
      return type === "PHYSICAL" ? "PHYSICAL" : "PLATFORM";
    };

    const TEACHER_STUDENT_ACTIONS = ["TEACHER_EVALUATION", "HELP_SEEKING"];
    const filteredInteractions = interactions.filter((interaction) => {
      const isTeacherStudent =
        (interaction.sourceNode.nodeType === "Teacher" &&
          interaction.targetNode.nodeType === "Student") ||
        (interaction.sourceNode.nodeType === "Student" &&
          interaction.targetNode.nodeType === "Teacher");
      if (!isTeacherStudent) return true;
      return (
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

    await this.enrichStudentNodesWithCognitiveProfiles(nodes);

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

      const nodeWhere: any = { nodeType: 'Student' };
      if (params.schoolId) nodeWhere.schoolId = params.schoolId;
      if (params.gradeId) nodeWhere.gradeId = params.gradeId;
      if (params.classId) nodeWhere.classId = params.classId;
      if (scenarioId) nodeWhere.scenarioId = scenarioId;

      const studentNodes = await this.prisma.graphNode.findMany({
        where: nodeWhere,
        select: { id: true },
      });
      const studentNodeIds = studentNodes.map((n) => n.id);

      if (studentNodeIds.length === 0) {
        return null;
      }

      const profiles = await this.prisma.studentProfile.findMany({
        where: { nodeId: { in: studentNodeIds } },
        select: {
          aiContentSatisfaction: true,
          resourceHelpfulness: true,
          posterSatisfaction: true,
        },
      });

      const validSatisfactionResponses = profiles.filter(
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

      const cognitiveStats = await this.computeStatsFromCognitiveProfiles(studentNodeIds);
      if (!cognitiveStats) {
        return {
          pushed: profiles.length,
          filled: validSatisfactionResponses.length,
          score: Number(overallSatisfactionAvg.toFixed(1)),
          percentage: Math.round((overallSatisfactionAvg / 5) * 100),
          knowledgeReserve: 0,
          learningEngagement: 0,
          cognitiveLoad: 0,
          learningMotivation: 0,
          computationalThinking: 0,
          humanAiTrust: 0,
          learningMethod: 0,
          learningAttitude: 0,
          selfRegulatedLearning: 0,
          aiLiteracy: 0,
        };
      }

      return {
        pushed: profiles.length,
        filled: validSatisfactionResponses.length,
        score: Number(overallSatisfactionAvg.toFixed(1)),
        percentage: Math.round((overallSatisfactionAvg / 5) * 100),
        ...cognitiveStats,
      };
    } catch {
      return null;
    }
  }

  private async computeStatsFromCognitiveProfiles(studentNodeIds: string[]) {
    const profiles = await this.prisma.studentCognitiveProfile.findMany({
      where: { studentNodeId: { in: studentNodeIds } },
      orderBy: { generatedAt: "desc" },
      include: {
        dimensionScores: true,
      },
    });

    if (profiles.length === 0) {
      return null;
    }

    const latestProfileMap = new Map<string, (typeof profiles)[0]>();
    for (const profile of profiles) {
      if (!latestProfileMap.has(profile.studentNodeId)) {
        latestProfileMap.set(profile.studentNodeId, profile);
      }
    }
    const latestProfiles = Array.from(latestProfileMap.values());

    const studentDimensions = latestProfiles.map((profile) => {
      const dimMap = new Map(
        profile.dimensionScores.map((ds) => [ds.dimensionCode, Number(ds.scoreValue)]),
      );

      const result: Record<string, number> = {};
      for (const [key, codes] of Object.entries(dimCodes)) {
        result[key] = computeDimension(dimMap, codes, multipliers[key] ?? 1);
      }
      return result;
    });

    const avg = (key: string) => {
      const values = studentDimensions
        .map((d) => d[key])
        .filter((v): v is number => v > 0);
      return values.length > 0
        ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2))
        : 0;
    };

    return {
      knowledgeReserve: avg("knowledgeReserve"),
      learningEngagement: avg("learningEngagement"),
      cognitiveLoad: avg("cognitiveLoad"),
      learningMotivation: avg("learningMotivation"),
      computationalThinking: avg("computationalThinking"),
      humanAiTrust: avg("humanAiTrust"),
      learningMethod: avg("learningMethod"),
      learningAttitude: avg("learningAttitude"),
      selfRegulatedLearning: avg("selfRegulatedLearning"),
      aiLiteracy: avg("aiLiteracy"),
    };
  }

  private async enrichStudentNodesWithCognitiveProfiles(nodes: Node[]) {
    const studentNodes = nodes.filter((n) => n.type === "STUDENT");
    if (studentNodes.length === 0) return;

    const studentNodeIds = studentNodes.map((n) => n.id);

    const profiles = await this.prisma.studentCognitiveProfile.findMany({
      where: { studentNodeId: { in: studentNodeIds } },
      orderBy: { generatedAt: "desc" },
      include: {
        dimensionScores: true,
      },
    });

    const latestProfileMap = new Map<string, (typeof profiles)[0]>();
    for (const profile of profiles) {
      if (!latestProfileMap.has(profile.studentNodeId)) {
        latestProfileMap.set(profile.studentNodeId, profile);
      }
    }

    const seededRandom = (seed: string) => {
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
      }
      return ((hash >>> 0) % 1000) / 1000;
    };

    for (const node of studentNodes) {
      const profile = latestProfileMap.get(node.id);

      if (profile && profile.dimensionScores.length > 0) {
        const dimMap = new Map(
          profile.dimensionScores.map((ds) => [ds.dimensionCode, Number(ds.scoreValue)]),
        );

        const precomputedKeys = [
          'knowledgeReserve',
          'learningEngagement',
          'cognitiveLoad',
          'learningMotivation',
          'computationalThinking',
          'humanAiTrust',
          'learningMethod',
          'learningAttitude',
          'selfRegulatedLearning',
          'aiLiteracy',
        ];
        const hasPrecomputedDimensions = precomputedKeys.some(
          (key) => dimMap.has(key) && (dimMap.get(key) ?? 0) > 0,
        );

        if (hasPrecomputedDimensions) {
          node.studentProfile = {
            ...node.studentProfile,
            knowledgeReserve: dimMap.get('knowledgeReserve') ?? 0,
            learningEngagement: dimMap.get('learningEngagement') ?? 0,
            cognitiveLoad: dimMap.get('cognitiveLoad') ?? 0,
            learningMotivation: dimMap.get('learningMotivation') ?? 0,
            computationalThinking: dimMap.get('computationalThinking') ?? 0,
            humanAiTrust: dimMap.get('humanAiTrust') ?? 0,
            learningMethod: dimMap.get('learningMethod') ?? 0,
            learningAttitude: dimMap.get('learningAttitude') ?? 0,
            selfRegulatedLearning: dimMap.get('selfRegulatedLearning') ?? 0,
            aiLiteracy: dimMap.get('aiLiteracy') ?? 0,
          };
        } else {
          node.studentProfile = {
            ...node.studentProfile,
            knowledgeReserve: computeDimension(dimMap, dimCodes.knowledgeReserve, multipliers.knowledgeReserve),
            learningEngagement: computeDimension(dimMap, dimCodes.learningEngagement, multipliers.learningEngagement),
            cognitiveLoad: computeDimension(dimMap, dimCodes.cognitiveLoad, multipliers.cognitiveLoad),
            learningMotivation: computeDimension(dimMap, dimCodes.learningMotivation, multipliers.learningMotivation),
            computationalThinking: computeDimension(dimMap, dimCodes.computationalThinking, multipliers.computationalThinking),
            humanAiTrust: computeDimension(dimMap, dimCodes.humanAiTrust, multipliers.humanAiTrust),
            learningMethod: computeDimension(dimMap, dimCodes.learningMethod, multipliers.learningMethod),
            learningAttitude: computeDimension(dimMap, dimCodes.learningAttitude, multipliers.learningAttitude),
            selfRegulatedLearning: computeDimension(dimMap, dimCodes.selfRegulatedLearning, multipliers.selfRegulatedLearning),
            aiLiteracy: computeDimension(dimMap, dimCodes.aiLiteracy, multipliers.aiLiteracy),
          };
        }
        continue;
      }

      const seed = node.id;
      const mockValue = (min: number, max: number, offset: number) => {
        const raw = seededRandom(seed + offset);
        return Number((min + raw * (max - min)).toFixed(1));
      };

      node.studentProfile = {
        ...node.studentProfile,
        knowledgeReserve: mockValue(1.5, 3.5, 1),
        learningEngagement: mockValue(1.5, 3.5, 2),
        cognitiveLoad: mockValue(2.0, 4.0, 3),
        learningMotivation: mockValue(1.5, 3.5, 4),
        computationalThinking: mockValue(1.5, 3.5, 5),
        humanAiTrust: mockValue(1.5, 3.5, 6),
        learningMethod: mockValue(1.5, 3.5, 7),
        learningAttitude: mockValue(1.5, 3.5, 8),
        selfRegulatedLearning: mockValue(1.5, 3.5, 9),
        aiLiteracy: mockValue(1.5, 3.5, 10),
      };
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

  private async buildWorkInteractionLinks(
    nodeMap: Map<string, Node>,
    scenarioId: string | undefined,
  ): Promise<Link[]> {
    if (nodeMap.size === 0) return [];

    const studentIdSet = new Set<string>();
    const nameMap = new Map<string, string>();

    for (const [id, node] of nodeMap) {
      if (node.type === "STUDENT") {
        studentIdSet.add(id);
        nameMap.set(node.name, id);
      }
    }

    const studentIds = Array.from(studentIdSet);
    if (studentIds.length === 0) return [];

    const works = await this.prisma.studentWork.findMany({
      where: { studentNodeId: { in: studentIds } },
    });

    const links: Link[] = [];
    const seen = new Set<string>();

    for (const work of works) {
      const authorId = work.studentNodeId;

      if (work.likeDetails) {
        const likerIds = work.likeDetails.split(";").filter((s) => s.trim());
        for (const likerId of likerIds) {
          const trimmedId = likerId.trim();
          if (studentIdSet.has(trimmedId) && trimmedId !== authorId) {
            const key = `${trimmedId}_${authorId}_LIKE`;
            if (!seen.has(key)) {
              seen.add(key);
              links.push({
                source: trimmedId,
                target: authorId,
                value: 1.5,
                type: "PLATFORM",
                actionType: "LIKE",
              });
            }
          }
        }
      }

      if (work.commentDetails) {
        const comments = work.commentDetails.split("|").filter((s) => s.trim());
        for (const comment of comments) {
          const colonIdx = comment.indexOf(":");
          if (colonIdx <= 0) continue;
          const commenterName = comment.substring(0, colonIdx).trim();
          const commenterNodeId = nameMap.get(commenterName);
          if (commenterNodeId && commenterNodeId !== authorId) {
            const key = `${commenterNodeId}_${authorId}_COMMENT`;
            if (!seen.has(key)) {
              seen.add(key);
              links.push({
                source: commenterNodeId,
                target: authorId,
                value: 2.5,
                type: "PLATFORM",
                actionType: "COMMENT",
              });
            }
          }
        }
      }
    }

    return links;
  }

  private async buildCollaborationLinksFromKnowledge(
    nodeMap: Map<string, Node>,
    scenarioId: string | undefined,
  ): Promise<Link[]> {
    if (nodeMap.size === 0) return [];

    const studentIds: string[] = [];
    for (const [id, node] of nodeMap) {
      if (node.type === "STUDENT") {
        studentIds.push(id);
      }
    }

    if (studentIds.length === 0) return [];

    const relations = await this.prisma.studentKnowledgeRelation.findMany({
      where: { studentNodeId: { in: studentIds } },
      select: { studentNodeId: true, knowledgeNodeId: true },
    });

    const knowledgeToStudents = new Map<string, Set<string>>();
    for (const r of relations) {
      const set = knowledgeToStudents.get(r.knowledgeNodeId) || new Set<string>();
      set.add(r.studentNodeId);
      knowledgeToStudents.set(r.knowledgeNodeId, set);
    }

    const pairStrength = new Map<string, number>();
    for (const [, students] of knowledgeToStudents) {
      const studentList = Array.from(students);
      for (let i = 0; i < studentList.length; i++) {
        for (let j = i + 1; j < studentList.length; j++) {
          const s1 = studentList[i];
          const s2 = studentList[j];
          const key = s1 < s2 ? `${s1}#${s2}` : `${s2}#${s1}`;
          pairStrength.set(key, (pairStrength.get(key) || 0) + 1);
        }
      }
    }

    const MIN_SHARED_KNOWLEDGE = studentIds.length < 50 ? 2 : 3;
    const MAX_COLLABORATION_LINKS = studentIds.length < 50 ? 100 : 200;

    const qualifiedPairs = Array.from(pairStrength.entries())
      .filter(([, strength]) => strength >= MIN_SHARED_KNOWLEDGE)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_COLLABORATION_LINKS);

    const links: Link[] = [];

    for (const [key, strength] of qualifiedPairs) {
      const [s1, s2] = key.split("#");

      const value = Math.min(2, 1 + strength * 0.2);
      links.push({
        source: s1,
        target: s2,
        value,
        type: "PLATFORM",
        actionType: "COLLABORATION",
      });
    }

    return links;
  }

  private async addMockTeacherNodes(
    nodeMap: Map<string, Node>,
    scenarioId: string | undefined,
    schoolNames: Map<string, string>,
    gradeNames: Map<string, string>,
    classNames: Map<string, string>,
  ): Promise<void> {
    if (!scenarioId) return;

    // 如果已经存在任何教师节点，不再创建 mock 教师
    const hasAnyTeacher = Array.from(nodeMap.values()).some(
      (n) => n.type === "TEACHER",
    );
    if (hasAnyTeacher) return;

    const classStudentMap = new Map<string, Node[]>();
    for (const node of nodeMap.values()) {
      if (node.type === "STUDENT" && node.studentProfile?.classId) {
        const list = classStudentMap.get(node.studentProfile.classId) || [];
        list.push(node);
        classStudentMap.set(node.studentProfile.classId, list);
      }
    }

    for (const [classId, students] of classStudentMap) {
      const hasTeacher = Array.from(nodeMap.values()).some(
        (n) => n.type === "TEACHER" && n.teacherProfile?.teachingClass === classId,
      );

      if (hasTeacher) continue;

      const firstStudent = students[0];
      const schoolId =
        firstStudent.studentProfile?.school ||
        Object.keys(schoolNames).find((k) => schoolNames.get(k) === firstStudent.studentProfile?.school) ||
        "";
      const gradeId =
        Object.keys(gradeNames).find((k) => gradeNames.get(k) === firstStudent.studentProfile?.grade) || "";
      const className = classNames.get(classId) || classId;

      const mockTeacherId = `mock-teacher-${classId}`;
      nodeMap.set(mockTeacherId, {
        id: mockTeacherId,
        type: "TEACHER",
        name: `${className}教师`,
        group: 1,
        val: 25,
        teacherProfile: {
          school: firstStudent.studentProfile?.school || null,
          teachingGrade: firstStudent.studentProfile?.grade || null,
          teachingClass: className,
          subject: "社团课",
        },
      });
    }
  }
}
