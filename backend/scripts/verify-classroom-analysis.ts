import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);

  const scenarios = await prisma.learningScenario.findMany({
    orderBy: { sortOrder: "asc" },
  });

  console.log("=== 课堂视频分析按场景计数 ===");
  for (const s of scenarios) {
    const classCount = await prisma.class.count({
      where: { grade: { school: { scenarioId: s.id } } },
    });
    const analysisCount = await prisma.sessionClassroomAnalysis.count({
      where: {
        session: { scenarioId: s.id },
      },
    });
    console.log(
      `${s.code}: classes=${classCount}, analyses=${analysisCount} ${
        classCount === analysisCount ? "✓" : "✗"
      }`,
    );
  }

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
