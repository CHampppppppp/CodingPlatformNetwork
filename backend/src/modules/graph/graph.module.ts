import { Module } from '@nestjs/common';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';
import { CognitiveProfileService } from './services/cognitive-profile.service';
import { GraphAssemblerService } from './services/graph-assembler.service';
import { GraphQueryService } from './services/graph-query.service';
import { ScenarioResolverService } from './services/scenario-resolver.service';
import { SurveyStatsService } from './services/survey-stats.service';

@Module({
  controllers: [GraphController],
  providers: [
    GraphService,
    ScenarioResolverService,
    GraphQueryService,
    GraphAssemblerService,
    CognitiveProfileService,
    SurveyStatsService,
  ],
  exports: [GraphService],
})
export class GraphModule {}
