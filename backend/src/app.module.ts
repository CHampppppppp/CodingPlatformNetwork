import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { StudentModule } from "./modules/student/student.module";
import { GraphModule } from "./modules/graph/graph.module";
import { ScenarioModule } from "./modules/scenario/scenario.module";
import { OrgModule } from "./modules/org/org.module";
import { NodeModule } from "./modules/node/node.module";
import { InteractionSessionModule } from "./modules/interaction-session/interaction-session.module";
import { InteractionModule } from "./modules/interaction/interaction.module";
import { ResourceModule } from "./modules/resource/resource.module";
import { ClassroomAnalysisModule } from "./modules/classroom-analysis/classroom-analysis.module";
import { StudentKnowledgeRelationModule } from "./modules/student-knowledge-relation/student-knowledge-relation.module";
import { IngestionModule } from "./modules/ingestion/ingestion.module";
import { PrismaModule } from "./shared/utils/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    PrismaModule,
    ScenarioModule,
    OrgModule,
    StudentModule,
    NodeModule,
    InteractionSessionModule,
    InteractionModule,
    GraphModule,
    ResourceModule,
    StudentKnowledgeRelationModule,
    ClassroomAnalysisModule,
    IngestionModule,
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class AppModule {}
