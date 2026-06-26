import { Module } from "@nestjs/common";
import { PrismaModule } from "../../shared/utils/prisma.module";
import { OrgModule } from "../org/org.module";
import { IngestionService } from "./services/ingestion.service";

@Module({
  imports: [PrismaModule, OrgModule],
  providers: [IngestionService],
  exports: [IngestionService],
})
export class IngestionModule {}
