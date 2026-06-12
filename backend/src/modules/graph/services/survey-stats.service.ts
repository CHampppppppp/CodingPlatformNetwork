import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared/utils/prisma.service";
import { CognitiveProfileService } from "./cognitive-profile.service";

@Injectable()
export class SurveyStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cognitiveProfileService: CognitiveProfileService,
  ) {}

  async compute(studentNodeIds: string[]) {
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
      (response) =>
        response.aiContentSatisfaction !== null &&
        response.resourceHelpfulness !== null &&
        response.posterSatisfaction !== null,
    );
    const personalSatisfactionScores = validSatisfactionResponses.map(
      (response) => {
        const q4 = Number(response.aiContentSatisfaction);
        const q5 = Number(response.resourceHelpfulness);
        const q6 = Number(response.posterSatisfaction);
        return (q4 + q5 + q6) / 3;
      },
    );
    const overallSatisfactionAvg =
      personalSatisfactionScores.length > 0
        ? Number(
            (
              personalSatisfactionScores.reduce((a, b) => a + b, 0) /
              personalSatisfactionScores.length
            ).toFixed(2),
          )
        : 0;

    const cognitiveStats =
      (await this.cognitiveProfileService.computeStats(studentNodeIds)) ??
      this.cognitiveProfileService.emptyStats();

    return {
      pushed: profiles.length,
      filled: validSatisfactionResponses.length,
      score: Number(overallSatisfactionAvg.toFixed(1)),
      percentage: Math.round((overallSatisfactionAvg / 5) * 100),
      ...cognitiveStats,
    };
  }
}
