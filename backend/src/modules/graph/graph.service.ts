import { Injectable } from "@nestjs/common";
import { GraphData } from "../../shared/types/graph-data.type";
import {
  GraphQuery,
  ScenarioStatsQuery,
} from "./types/graph-query.type";
import { CognitiveProfileService } from "./services/cognitive-profile.service";
import { GraphAssemblerService } from "./services/graph-assembler.service";
import { GraphQueryService } from "./services/graph-query.service";
import { ScenarioResolverService } from "./services/scenario-resolver.service";
import { SurveyStatsService } from "./services/survey-stats.service";

@Injectable()
export class GraphService {
  constructor(
    private readonly scenarioResolver: ScenarioResolverService,
    private readonly graphQuery: GraphQueryService,
    private readonly graphAssembler: GraphAssemblerService,
    private readonly cognitiveProfiles: CognitiveProfileService,
    private readonly surveyStats: SurveyStatsService,
  ) {}

  async getGraphData(params: GraphQuery) {
    const scenarioId = await this.scenarioResolver.resolveScenarioId(
      params.scenarioCode,
    );

    const [orgNames, interactions, directNodes, studentNodeIds] =
      await Promise.all([
        this.graphQuery.getOrgNameMaps(),
        this.graphQuery.findInteractions(params, scenarioId),
        this.graphQuery.findDirectNodes(params, scenarioId),
        this.graphQuery.findStudentNodeIds(params, scenarioId),
      ]);

    const nodes = this.graphAssembler.buildNodes(
      interactions,
      directNodes,
      orgNames,
      params.classId,
    );
    const links = this.graphAssembler.buildLinks(interactions);

    await this.cognitiveProfiles.enrichStudentNodes(nodes);
    const surveyStats = await this.surveyStats.compute(studentNodeIds);

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

  async getScenarioStats(params: ScenarioStatsQuery) {
    const stats = await this.graphQuery.getScenarioStats(params);

    return {
      data: stats,
      meta: null,
      error: null,
    };
  }
}
