import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared/utils/prisma.service";
import { Node } from "../../../shared/types/graph-data.type";

const dimensionCodes: Record<string, string[]> = {
  knowledgeReserve: ["COG_READING", "COG_LANGUAGE", "COG_SCIENCE_KNOWLEDGE"],
  learningEngagement: [
    "COG_SCIENCE_INQUIRY",
    "PRAC_PRACTICE",
    "PRAC_COLLABORATION",
  ],
  cognitiveLoad: [
    "PSY_ANXIETY",
    "PSY_DEPRESSION",
    "PSY_PRESSURE",
    "PSY_LIFE_SATISFACTION",
  ],
  learningMotivation: ["PSY_RESILIENCE", "PSY_INTEREST_STABILITY"],
  computationalThinking: ["COG_COMPUTATIONAL"],
  humanAiTrust: ["COG_TECH_LITERACY"],
  learningMethod: ["PRAC_PROBLEM_SOLVING", "PRAC_COLLABORATION"],
  learningAttitude: ["PRAC_INNOVATION"],
  selfRegulatedLearning: ["PRAC_PROBLEM_SOLVING"],
  aiLiteracy: ["COG_TECH_LITERACY"],
};

const dimensionMultipliers: Record<string, number> = {
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

const precomputedDimensionKeys = [
  "knowledgeReserve",
  "learningEngagement",
  "cognitiveLoad",
  "learningMotivation",
  "computationalThinking",
  "humanAiTrust",
  "learningMethod",
  "learningAttitude",
  "selfRegulatedLearning",
  "aiLiteracy",
] as const;

type CognitiveStats = Record<(typeof precomputedDimensionKeys)[number], number>;

function computeDimension(
  dimMap: Map<string, number>,
  codes: string[],
  multiplier: number,
): number {
  const values = codes
    .map((code) => dimMap.get(code) ?? 0)
    .filter((value) => value > 0);
  if (values.length === 0) return 0;
  return (values.reduce((a, b) => a + b, 0) / values.length) * multiplier;
}

@Injectable()
export class CognitiveProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async enrichStudentNodes(nodes: Node[]) {
    const studentNodes = nodes.filter((node) => node.type === "STUDENT");
    if (studentNodes.length === 0) return;

    const latestProfileMap = await this.getLatestProfileMap(
      studentNodes.map((node) => node.id),
    );

    for (const node of studentNodes) {
      const profile = latestProfileMap.get(node.id);

      if (!profile || profile.dimensionScores.length === 0) {
        continue;
      }

      const dimMap = new Map(
        profile.dimensionScores.map((score) => [
          score.dimensionCode,
          Number(score.scoreValue),
        ]),
      );

      if (this.hasPrecomputedDimensions(dimMap)) {
        node.studentProfile = {
          ...node.studentProfile,
          knowledgeReserve: dimMap.get("knowledgeReserve"),
          learningEngagement: dimMap.get("learningEngagement"),
          cognitiveLoad: dimMap.get("cognitiveLoad"),
          learningMotivation: dimMap.get("learningMotivation"),
          computationalThinking: dimMap.get("computationalThinking"),
          humanAiTrust: dimMap.get("humanAiTrust"),
          learningMethod: dimMap.get("learningMethod"),
          learningAttitude: dimMap.get("learningAttitude"),
          selfRegulatedLearning: dimMap.get("selfRegulatedLearning"),
          aiLiteracy: dimMap.get("aiLiteracy"),
        };
        continue;
      }

      node.studentProfile = {
        ...node.studentProfile,
        ...this.computeAggregateDimensions(dimMap),
      };
    }
  }

  async computeStats(studentNodeIds: string[]): Promise<CognitiveStats | null> {
    const latestProfiles = Array.from(
      (await this.getLatestProfileMap(studentNodeIds)).values(),
    );

    if (latestProfiles.length === 0) {
      return null;
    }

    const studentDimensions = latestProfiles.map((profile) => {
      const dimMap = new Map(
        profile.dimensionScores.map((score) => [
          score.dimensionCode,
          Number(score.scoreValue),
        ]),
      );

      if (this.hasPrecomputedDimensions(dimMap)) {
        return Object.fromEntries(
          precomputedDimensionKeys.map((key) => [key, dimMap.get(key) ?? 0]),
        ) as CognitiveStats;
      }

      return this.computeAggregateDimensions(dimMap);
    });

    const average = (key: keyof CognitiveStats) => {
      const values = studentDimensions
        .map((dimensions) => dimensions[key])
        .filter((value): value is number => value > 0);
      return values.length > 0
        ? Number(
            (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
          )
        : 0;
    };

    return {
      knowledgeReserve: average("knowledgeReserve"),
      learningEngagement: average("learningEngagement"),
      cognitiveLoad: average("cognitiveLoad"),
      learningMotivation: average("learningMotivation"),
      computationalThinking: average("computationalThinking"),
      humanAiTrust: average("humanAiTrust"),
      learningMethod: average("learningMethod"),
      learningAttitude: average("learningAttitude"),
      selfRegulatedLearning: average("selfRegulatedLearning"),
      aiLiteracy: average("aiLiteracy"),
    };
  }

  emptyStats(): CognitiveStats {
    return {
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

  private async getLatestProfileMap(studentNodeIds: string[]) {
    if (studentNodeIds.length === 0) {
      return new Map<
        string,
        Awaited<ReturnType<typeof this.findProfiles>>[number]
      >();
    }

    const profiles = await this.findProfiles(studentNodeIds);
    const latestProfileMap = new Map<string, (typeof profiles)[number]>();

    for (const profile of profiles) {
      if (!latestProfileMap.has(profile.studentNodeId)) {
        latestProfileMap.set(profile.studentNodeId, profile);
      }
    }

    return latestProfileMap;
  }

  private findProfiles(studentNodeIds: string[]) {
    return this.prisma.studentCognitiveProfile.findMany({
      where: { studentNodeId: { in: studentNodeIds } },
      orderBy: { generatedAt: "desc" },
      include: {
        dimensionScores: true,
      },
    });
  }

  private hasPrecomputedDimensions(dimMap: Map<string, number>) {
    return precomputedDimensionKeys.some(
      (key) => dimMap.has(key) && (dimMap.get(key) ?? 0) > 0,
    );
  }

  private computeAggregateDimensions(dimMap: Map<string, number>): CognitiveStats {
    return {
      knowledgeReserve: computeDimension(
        dimMap,
        dimensionCodes.knowledgeReserve,
        dimensionMultipliers.knowledgeReserve,
      ),
      learningEngagement: computeDimension(
        dimMap,
        dimensionCodes.learningEngagement,
        dimensionMultipliers.learningEngagement,
      ),
      cognitiveLoad: computeDimension(
        dimMap,
        dimensionCodes.cognitiveLoad,
        dimensionMultipliers.cognitiveLoad,
      ),
      learningMotivation: computeDimension(
        dimMap,
        dimensionCodes.learningMotivation,
        dimensionMultipliers.learningMotivation,
      ),
      computationalThinking: computeDimension(
        dimMap,
        dimensionCodes.computationalThinking,
        dimensionMultipliers.computationalThinking,
      ),
      humanAiTrust: computeDimension(
        dimMap,
        dimensionCodes.humanAiTrust,
        dimensionMultipliers.humanAiTrust,
      ),
      learningMethod: computeDimension(
        dimMap,
        dimensionCodes.learningMethod,
        dimensionMultipliers.learningMethod,
      ),
      learningAttitude: computeDimension(
        dimMap,
        dimensionCodes.learningAttitude,
        dimensionMultipliers.learningAttitude,
      ),
      selfRegulatedLearning: computeDimension(
        dimMap,
        dimensionCodes.selfRegulatedLearning,
        dimensionMultipliers.selfRegulatedLearning,
      ),
      aiLiteracy: computeDimension(
        dimMap,
        dimensionCodes.aiLiteracy,
        dimensionMultipliers.aiLiteracy,
      ),
    };
  }
}
