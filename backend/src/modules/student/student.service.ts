import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../shared/utils/prisma.service";
import {
  computeAggregateDimensionScores,
  scoreLevel,
  AGGREGATE_DIMENSION_KEYS,
  AGGREGATE_DIMENSION_NAME_ZH,
  AGGREGATE_DIMENSION_CATEGORY,
  generateMockBaseDimensionScores,
  BASE_DIMENSION_CODES,
  AggregateDimensionScores,
} from "../../shared/utils/cognitive-dimensions";
import { ResourceRecommendationService } from "./services/resource-recommendation.service";

const dimensionCodeToStrategyKey: Record<string, string> = {
  COG_READING: "knowledgeReserve",
  COG_LANGUAGE: "knowledgeReserve",
  COG_SCIENCE_KNOWLEDGE: "knowledgeReserve",
  COG_SCIENCE_INQUIRY: "learningEngagement",
  COG_COMPUTATIONAL: "computationalThinking",
  COG_TECH_LITERACY: "aiLiteracy",
  PSY_ANXIETY: "cognitiveLoad",
  PSY_DEPRESSION: "cognitiveLoad",
  PSY_PRESSURE: "cognitiveLoad",
  PSY_LIFE_SATISFACTION: "cognitiveLoad",
  PSY_RESILIENCE: "learningMotivation",
  PSY_INTEREST_STABILITY: "learningMotivation",
  PRAC_INNOVATION: "learningAttitude",
  PRAC_PROBLEM_SOLVING: "selfRegulatedLearning",
  PRAC_COLLABORATION: "learningMethod",
  PRAC_PRACTICE: "learningEngagement",
  knowledgeReserve: "knowledgeReserve",
  learningEngagement: "learningEngagement",
  cognitiveLoad: "cognitiveLoad",
  learningMotivation: "learningMotivation",
  computationalThinking: "computationalThinking",
  humanAiTrust: "humanAiTrust",
  learningMethod: "learningMethod",
  learningAttitude: "learningAttitude",
  selfRegulatedLearning: "selfRegulatedLearning",
  aiLiteracy: "aiLiteracy",
};

@Injectable()
export class StudentService {
  constructor(
    private prisma: PrismaService,
    private resourceRecommendationService: ResourceRecommendationService,
  ) {}

  async getExpertIntervention(studentNodeId: string) {
    const cognitiveTemplate = await this.getLatestCognitiveTemplate(studentNodeId);
    if (!cognitiveTemplate || cognitiveTemplate.error) {
      return {
        data: null,
        meta: null,
        error: "学生不存在或无法获取认知模板",
      };
    }

    const studentData = cognitiveTemplate.data;
    const weakDimensions = studentData.dimensions.filter(
      (d: any) => d.scoreValue <= 2 || d.scoreLevel?.includes("低"),
    );

    const interactions = await this.prisma.interaction.findMany({
      where: {
        OR: [
          { sourceNodeId: studentNodeId },
          { targetNodeId: studentNodeId },
        ],
      },
      select: {
        sourceNodeId: true,
        targetNodeId: true,
      },
    });

    const connectedNodeIds = new Set<string>();
    for (const interaction of interactions) {
      if (interaction.sourceNodeId !== studentNodeId) {
        connectedNodeIds.add(interaction.sourceNodeId);
      }
      if (interaction.targetNodeId !== studentNodeId) {
        connectedNodeIds.add(interaction.targetNodeId);
      }
    }

    const knowledgeNodes = await this.prisma.graphNode.findMany({
      where: {
        id: { in: Array.from(connectedNodeIds) },
        nodeType: "KNOWLEDGE",
      },
      select: {
        id: true,
        displayName: true,
        knowledgeProfile: {
          select: {
            category: true,
            content: true,
          },
        },
      },
    });

    const knowledgeReserveScore = this.resolveKnowledgeReserve(
      studentData.dimensions,
    );
    const totalDegree = studentData.student.totalDegree ?? 0;

    const recommendedResources =
      await this.resourceRecommendationService.recommend({
        knowledgeReserveScore,
        totalDegree,
        limit: 10,
      });

    return {
      data: {
        student: studentData.student,
        profile: studentData.profile,
        dimensions: studentData.dimensions,
        weakDimensions: weakDimensions.map((d: any) => ({
          dimensionCode: d.dimensionCode,
          dimensionNameZh: d.dimensionNameZh,
          category: d.category,
          scoreValue: d.scoreValue,
          scoreLevel: d.scoreLevel,
          strategyKey: dimensionCodeToStrategyKey[d.dimensionCode] || null,
        })),
        connectedKnowledgeNodes: knowledgeNodes.map((n) => ({
          id: n.id,
          name: n.displayName,
          category: n.knowledgeProfile?.category || "",
        })),
        resources: recommendedResources,
      },
      meta: null,
      error: null,
    };
  }

  private resolveKnowledgeReserve(dimensions: any[]): number {
    const direct = dimensions.find(
      (d: any) => d.dimensionCode === "knowledgeReserve",
    );
    if (direct) {
      return direct.scoreValue;
    }

    const dimMap = new Map<string, number>();
    for (const d of dimensions) {
      if (typeof d.scoreValue === "number") {
        dimMap.set(d.dimensionCode, d.scoreValue);
      }
    }

    const aggregate = computeAggregateDimensionScores(dimMap);
    return aggregate.knowledgeReserve;
  }

  async getLatestCognitiveTemplate(studentNodeId: string) {
    const studentNode = await this.prisma.graphNode.findFirst({
      where: {
        id: studentNodeId,
        nodeType: "STUDENT",
      },
      include: {
        studentProfile: true,
      },
    });

    if (!studentNode) {
      return null;
    }

    let latestProfile = await this.prisma.studentCognitiveProfile.findFirst({
      where: { studentNodeId },
      orderBy: {
        generatedAt: "desc",
      },
      include: {
        dimensionScores: {
          include: {
            dimensionDef: true,
          },
          orderBy: {
            dimensionDef: {
              sortOrder: "asc",
            },
          },
        },
      },
    });

    const hasBaseDimensions = latestProfile?.dimensionScores.some((item) =>
      BASE_DIMENSION_CODES.includes(item.dimensionCode as any),
    );

    const aggregateScoreMap = new Map<string, number>();
    for (const item of latestProfile?.dimensionScores ?? []) {
      if (AGGREGATE_DIMENSION_KEYS.includes(item.dimensionCode as any)) {
        aggregateScoreMap.set(item.dimensionCode, Number(item.scoreValue));
      }
    }

    if (!hasBaseDimensions && aggregateScoreMap.size > 0) {
      const aggregateScores = Object.fromEntries(
        AGGREGATE_DIMENSION_KEYS.map((key) => [key, aggregateScoreMap.get(key) ?? 0]),
      ) as Partial<AggregateDimensionScores>;

      const baseScores = generateMockBaseDimensionScores(
        aggregateScores,
        studentNodeId,
      );

      const newProfile = await this.prisma.studentCognitiveProfile.create({
        data: {
          studentNodeId,
          profileVersion: "mock-v1",
          generatedAt: new Date(),
          totalScore: latestProfile?.totalScore ?? 0,
          dimensionScores: {
            create: Array.from(baseScores.entries()).map(([dimensionCode, scoreValue]) => ({
              dimensionCode,
              scoreValue,
              scoreLevel: scoreLevel(scoreValue, 0, 10),
            })),
          },
        },
        include: {
          dimensionScores: {
            include: { dimensionDef: true },
            orderBy: { dimensionDef: { sortOrder: "asc" } },
          },
        },
      });

      latestProfile = newProfile;
    }

    const [school, grade, classRecord] = await Promise.all([
      studentNode.schoolId
        ? this.prisma.school.findUnique({
            where: { id: studentNode.schoolId },
            select: { name: true },
          })
        : Promise.resolve(null),
      studentNode.gradeId
        ? this.prisma.grade.findUnique({
            where: { id: studentNode.gradeId },
            select: { gradeName: true },
          })
        : Promise.resolve(null),
      studentNode.classId
        ? this.prisma.class.findUnique({
            where: { id: studentNode.classId },
            select: { className: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      data: {
        student: {
          id: studentNode.id,
          name: studentNode.displayName,
          school: school?.name ?? studentNode.schoolId ?? null,
          grade:
            grade?.gradeName != null
              ? `${grade.gradeName}年级`
              : studentNode.gradeId ?? null,
          classId: classRecord?.className ?? studentNode.classId ?? null,
          totalDegree: studentNode.studentProfile?.totalDegree ?? 0,
        },
        profile: latestProfile
          ? {
              profileVersion: latestProfile.profileVersion,
              generatedAt: latestProfile.generatedAt,
              totalScore: Number(latestProfile.totalScore),
            }
          : null,
        dimensions:
          latestProfile?.dimensionScores.map((item) => ({
            dimensionCode: item.dimensionCode,
            dimensionNameZh: item.dimensionDef.dimensionNameZh,
            category: item.dimensionDef.category,
            scoreValue: Number(item.scoreValue),
            scoreLevel: item.scoreLevel,
          })) ?? [],
      },
      meta: null,
      error: null,
    };
  }
}
