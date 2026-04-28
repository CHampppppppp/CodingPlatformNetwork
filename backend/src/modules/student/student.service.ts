import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../shared/utils/prisma.service";

@Injectable()
export class StudentService {
  constructor(private prisma: PrismaService) {}

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
      (d: any) => d.scoreValue <= 2 || d.scoreLevel?.includes("低")
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

    const knowledgeNodeIds = knowledgeNodes.map((n) => n.id);
    const resources = await this.prisma.resource.findMany({
      where: {
        knowledgeRelations: {
          some: {
            knowledgeNodeId: { in: knowledgeNodeIds },
          },
        },
      },
      include: {
        knowledgeRelations: {
          include: {
            knowledgeNode: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
      },
      take: 20,
    });

    const resourceIds = resources.map((r) => r.id);
    const rateGroups = await this.prisma.studentResourceRate.groupBy({
      by: ["resourceId"],
      where: { resourceId: { in: resourceIds } },
      _avg: { rate: true },
    });

    const rateMap = new Map(
      rateGroups.map((g) => [
        g.resourceId,
        g._avg.rate != null ? Number(g._avg.rate) : null,
      ])
    );

    const enrichedResources = resources.map((resource) => {
      const avgRate = rateMap.get(resource.id) ?? null;
      return {
        id: resource.id,
        title: resource.title,
        description: resource.description,
        url: resource.url,
        resourceType: resource.resourceType,
        acceptanceRate: avgRate != null ? (avgRate / 5) * 100 : null,
        knowledgeNodes: resource.knowledgeRelations.map((rel) => ({
          id: rel.knowledgeNode.id,
          name: rel.knowledgeNode.displayName,
        })),
      };
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
        })),
        connectedKnowledgeNodes: knowledgeNodes.map((n) => ({
          id: n.id,
          name: n.displayName,
          category: n.knowledgeProfile?.category || "",
        })),
        resources: enrichedResources,
      },
      meta: null,
      error: null,
    };
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

    const latestProfile = await this.prisma.studentCognitiveProfile.findFirst({
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

    const [school, grade, schoolClass] = await Promise.all([
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
        ? this.prisma.schoolClass.findUnique({
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
          grade: grade?.gradeName != null ? `${grade.gradeName}年级` : studentNode.gradeId ?? null,
          classId: schoolClass?.className ?? studentNode.classId ?? null,
          learningStylePreference:
            studentNode.studentProfile?.learningStylePreference ?? null,
          personality: studentNode.studentProfile?.personality ?? null,
          groupBehavior: studentNode.studentProfile?.groupBehavior ?? null,
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
