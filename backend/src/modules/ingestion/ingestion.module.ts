import { Module } from "@nestjs/common";
import { PrismaModule } from "../../shared/utils/prisma.module";
import { IngestionService } from "./services/ingestion.service";

@Module({
  imports: [PrismaModule],
  providers: [IngestionService],
  exports: [IngestionService],
})
export class IngestionModule {}
