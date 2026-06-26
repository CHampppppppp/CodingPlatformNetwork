import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);

  for (const code of ["TEACHER_QA", "HOME_LEARNING"]) {
    const scenario = await prisma.learningScenario.findUnique({
      where: { code },
    });
    if (!scenario) continue;

    await prisma.$transaction([
      prisma.studentCognitiveDimensionScore.deleteMany({
        where: { profile: { studentNode: { scenarioId: scenario.id } } },
      }),
      prisma.studentCognitiveProfile.deleteMany({
        where: { studentNode: { scenarioId: scenario.id } },
      }),
      prisma.studentWork.deleteMany({
        where: { session: { scenarioId: scenario.id } },
      }),
      prisma.interaction.deleteMany({
        where: { session: { scenarioId: scenario.id } },
      }),
      prisma.studentKnowledgeRelation.deleteMany({
        where: { studentNode: { scenarioId: scenario.id } },
      }),
      prisma.interactionSession.deleteMany({
        where: { scenarioId: scenario.id },
      }),
      prisma.class.updateMany({
        where: { grade: { school: { scenarioId: scenario.id } } },
        data: { teacherId: null },
      }),
      prisma.teacherProfile.deleteMany({
        where: { node: { scenarioId: scenario.id } },
      }),
      prisma.studentProfile.deleteMany({
        where: { node: { scenarioId: scenario.id } },
      }),
      prisma.knowledgeProfile.deleteMany({
        where: { node: { scenarioId: scenario.id } },
      }),
      prisma.graphNode.deleteMany({
        where: { scenarioId: scenario.id },
      }),
      prisma.class.deleteMany({
        where: { grade: { school: { scenarioId: scenario.id } } },
      }),
      prisma.grade.deleteMany({
        where: { school: { scenarioId: scenario.id } },
      }),
      prisma.school.deleteMany({
        where: { scenarioId: scenario.id },
      }),
    ]);
    process.stdout.write(`Deleted data for ${code}\n`);
  }

  await app.close();
}

main().catch((e) => {
  process.stderr.write(e.message + "\n" + e.stack + "\n");
  process.exit(1);
});
