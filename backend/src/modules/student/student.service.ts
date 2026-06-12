import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../shared/utils/prisma.service";

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
  PSY_RESILIENCE: "learningMotivation",
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

const strategyKeyToResourceTypes: Record<string, string[]> = {
  knowledgeReserve: ["DOCUMENT", "VIDEO", "ARTICLE"],
  learningEngagement: ["GAME", "VIDEO", "PRACTICE"],
  cognitiveLoad: ["DOCUMENT", "VIDEO", "GAME"],
  learningMotivation: ["GAME", "VIDEO"],
  computationalThinking: ["PRACTICE", "GAME", "DOCUMENT"],
  humanAiTrust: ["ARTICLE", "VIDEO", "DOCUMENT"],
  learningMethod: ["GAME", "PRACTICE", "VIDEO"],
  learningAttitude: ["GAME", "VIDEO", "PRACTICE"],
  selfRegulatedLearning: ["DOCUMENT", "PRACTICE"],
  aiLiteracy: ["ARTICLE", "VIDEO", "DOCUMENT"],
};

const strategyKeyToDimensionName: Record<string, string> = {
  knowledgeReserve: "知识储备",
  learningEngagement: "学习投入",
  cognitiveLoad: "认知负荷",
  learningMotivation: "学习动机",
  computationalThinking: "计算思维",
  humanAiTrust: "人机信任度",
  learningMethod: "学习方法与协作",
  learningAttitude: "学习态度",
  selfRegulatedLearning: "自我调节学习",
  aiLiteracy: "人工智能素养",
};

function buildSearchUrl(title: string, resourceType: string): string {
  const encoded = encodeURIComponent(title);
  switch (resourceType) {
    case "VIDEO":
      return `https://duckduckgo.com/?q=!ducky+site%3Abilibili.com+${encoded}`;
    case "ARTICLE":
      return `https://duckduckgo.com/?q=!ducky+site%3Azhihu.com+${encoded}`;
    case "DOCUMENT":
      return `https://duckduckgo.com/?q=!ducky+site%3Awenku.baidu.com+${encoded}`;
    case "PRACTICE":
      return `https://duckduckgo.com/?q=!ducky+${encoded}`;
    case "GAME":
      return `https://duckduckgo.com/?q=!ducky+${encoded}`;
    default:
      return `https://duckduckgo.com/?q=!ducky+${encoded}`;
  }
}

function resolveResourceUrl(
  title: string,
  resourceType: string,
  existingUrl: string | null,
): string {
  if (existingUrl && !existingUrl.includes("example.com")) {
    return existingUrl;
  }
  return buildSearchUrl(title, resourceType);
}

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

    const weakDimMap = new Map<
      string,
      { strategyKey: string; dimensionName: string; scoreValue: number }
    >();
    for (const dim of weakDimensions) {
      const strategyKey = dimensionCodeToStrategyKey[dim.dimensionCode];
      if (strategyKey) {
        weakDimMap.set(dim.dimensionCode, {
          strategyKey,
          dimensionName: dim.dimensionNameZh,
          scoreValue: dim.scoreValue,
        });
      }
    }

    const weakStrategyKeys = new Set<string>();
    for (const { strategyKey } of weakDimMap.values()) {
      weakStrategyKeys.add(strategyKey);
    }

    const prioritizedTypes: string[] = [];
    for (const key of weakStrategyKeys) {
      const types = strategyKeyToResourceTypes[key] || [];
      for (const t of types) {
        if (!prioritizedTypes.includes(t)) {
          prioritizedTypes.push(t);
        }
      }
    }

    let resources: any[] = [];
    const dimensionNames = Array.from(weakDimMap.values()).map(
      (d) => d.dimensionName,
    );

    if (knowledgeNodeIds.length > 0) {
      const dimSpecificLinkedResources = await this.prisma.resource.findMany({
        where: {
          OR: dimensionNames.flatMap((name) => [
            { title: { contains: name } },
            { description: { contains: name } },
          ]),
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
        take: 10,
      });

      const linkedIds = new Set(dimSpecificLinkedResources.map((r) => r.id));

      const dimSpecificUnlinkedResources = await this.prisma.resource.findMany({
        where: {
          OR: dimensionNames.flatMap((name) => [
            { title: { contains: name } },
            { description: { contains: name } },
          ]),
          id: { notIn: Array.from(linkedIds) },
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
        take: 8,
      });

      const dimSpecificIds = new Set([
        ...dimSpecificLinkedResources.map((r) => r.id),
        ...dimSpecificUnlinkedResources.map((r) => r.id),
      ]);

      const typeMatchedResources = await this.prisma.resource.findMany({
        where: {
          id: { notIn: Array.from(dimSpecificIds) },
          resourceType: { in: prioritizedTypes },
          knowledgeRelations: {
            some: {
              knowledgeNodeId: { in: knowledgeNodeIds },
            },
          },
          NOT: {
            title: { contains: "教学资源" },
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
        take: 8,
      });

      resources = [
        ...dimSpecificLinkedResources,
        ...dimSpecificUnlinkedResources,
        ...typeMatchedResources,
      ];
    } else if (dimensionNames.length > 0) {
      const genericResources = await this.prisma.resource.findMany({
        where: {
          OR: dimensionNames.flatMap((name) => [
            { title: { contains: name } },
            { description: { contains: name } },
          ]),
          NOT: {
            title: { contains: "教学资源" },
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
        take: 15,
      });

      resources = genericResources;
    }

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
      ]),
    );

    const enrichedResources = resources.map((resource) => {
      const avgRate = rateMap.get(resource.id) ?? null;

      const matchedDimensions: string[] = [];
      for (const [dimCode, dimInfo] of weakDimMap.entries()) {
        const types = strategyKeyToResourceTypes[dimInfo.strategyKey] || [];
        if (types.includes(resource.resourceType)) {
          matchedDimensions.push(dimInfo.dimensionName);
        }
      }

      for (const [dimCode, dimInfo] of weakDimMap.entries()) {
        const name = dimInfo.dimensionName;
        if (
          !matchedDimensions.includes(name) &&
          (resource.title?.includes(name) || resource.description?.includes(name))
        ) {
          matchedDimensions.push(name);
        }
      }

      const recommendReason =
        matchedDimensions.length > 0
          ? `针对${matchedDimensions.join("、")}薄弱维度推荐`
          : weakDimMap.size > 0
            ? "辅助学习资源"
            : "关联知识点资源";

      return {
        id: resource.id,
        title: resource.title,
        description: resource.description,
        url: resolveResourceUrl(
          resource.title,
          resource.resourceType,
          resource.url,
        ),
        resourceType: resource.resourceType,
        acceptanceRate: avgRate != null ? (avgRate / 5) * 100 : null,
        knowledgeNodes: resource.knowledgeRelations.map((rel: any) => ({
          id: rel.knowledgeNode.id,
          name: rel.knowledgeNode.displayName,
        })),
        recommendReason,
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
          strategyKey: dimensionCodeToStrategyKey[d.dimensionCode] || null,
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
