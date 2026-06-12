import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared/utils/prisma.service";

@Injectable()
export class ScenarioResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveScenarioId(scenarioCode?: string): Promise<string | undefined> {
    if (!scenarioCode) {
      return undefined;
    }

    const scenario = await this.prisma.learningScenario.findUnique({
      where: { code: scenarioCode },
      select: { id: true },
    });

    return scenario?.id;
  }
}
