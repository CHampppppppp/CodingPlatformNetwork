import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared/utils/prisma.service";
import { Node } from "../../../shared/types/graph-data.type";
import {
  AGGREGATE_DIMENSION_KEYS,
  AggregateDimensionScores,
  computeAggregateDimensionScores,
  emptyAggregateDimensionScores,
  hasAnyAggregateDimensionScore,
} from "../../../shared/utils/cognitive-dimensions";

type CognitiveStats = AggregateDimensionScores;

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

      if (hasAnyAggregateDimensionScore(dimMap)) {
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
        ...computeAggregateDimensionScores(dimMap),
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

      if (hasAnyAggregateDimensionScore(dimMap)) {
        return {
          knowledgeReserve: dimMap.get("knowledgeReserve") ?? 0,
          learningEngagement: dimMap.get("learningEngagement") ?? 0,
          cognitiveLoad: dimMap.get("cognitiveLoad") ?? 0,
          learningMotivation: dimMap.get("learningMotivation") ?? 0,
          computationalThinking: dimMap.get("computationalThinking") ?? 0,
          humanAiTrust: dimMap.get("humanAiTrust") ?? 0,
          learningMethod: dimMap.get("learningMethod") ?? 0,
          learningAttitude: dimMap.get("learningAttitude") ?? 0,
          selfRegulatedLearning: dimMap.get("selfRegulatedLearning") ?? 0,
          aiLiteracy: dimMap.get("aiLiteracy") ?? 0,
        };
      }

      return computeAggregateDimensionScores(dimMap);
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
    return emptyAggregateDimensionScores();
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
}
