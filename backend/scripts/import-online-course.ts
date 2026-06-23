import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";
import { IngestionService } from "../src/modules/ingestion/services/ingestion.service";
import { OnlineCourseLongFormatAdapter } from "../src/modules/ingestion/adapters/online-course-long-format.adapter";

const DATAS_DIR = "datas/ONLINE_COURSE";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);
  const ingestionService = app.get(IngestionService);

  process.stdout.write("=== ONLINE_COURSE Data Import ===\n");

  // Check current state
  const scenario = await prisma.learningScenario.findFirst({
    where: { code: "ONLINE_COURSE" },
  });
  if (!scenario) {
    process.stderr.write("ONLINE_COURSE scenario not found!\n");
    await app.close();
    return;
  }

  const existingNodes = await prisma.graphNode.count({
    where: { scenarioId: scenario.id, nodeType: "Student" },
  });
  process.stdout.write(`Existing student nodes: ${existingNodes}\n`);

  if (existingNodes > 0) {
    process.stderr.write(
      "ONLINE_COURSE scenario already has student data. Clean up first.\n",
    );
    await app.close();
    return;
  }

  // Parse CSV
  const adapter = new OnlineCourseLongFormatAdapter(DATAS_DIR);
  process.stdout.write("Parsing CSV...\n");
  const data = await adapter.parse();

  process.stdout.write(`Parsed:\n`);
  process.stdout.write(`  Schools: ${data.schools.length}\n`);
  process.stdout.write(`  Classes: ${data.classes.length}\n`);
  process.stdout.write(`  Users (students): ${data.users.length}\n`);
  process.stdout.write(`  Knowledges: ${data.knowledges.length}\n`);
  process.stdout.write(`  Sessions: ${data.sessions.length}\n`);
  process.stdout.write(`  StudentKnowledgeRelations: ${data.studentKnowledgeRelations.length}\n`);
  process.stdout.write(`  Interactions: ${data.interactions.length}\n`);
  process.stdout.write(`  CognitiveProfiles: ${data.cognitiveProfiles?.length ?? 0}\n`);
  process.stdout.write(`  StudentWorks: ${data.studentWorks?.length ?? 0}\n`);

  // Import
  process.stdout.write("\nImporting to database...\n");
  const result = await ingestionService.importPlatformData(data, {
    skipWhenScenarioHasNodes: false,
    concurrency: 5,
  });

  process.stdout.write(`\nImport result:\n`);
  process.stdout.write(`  Skipped: ${result.skipped}\n`);
  process.stdout.write(`  Schools: ${result.schoolCount}\n`);
  process.stdout.write(`  Grades: ${result.gradeCount}\n`);
  process.stdout.write(`  Classes: ${result.classCount}\n`);
  process.stdout.write(`  Students: ${result.studentCount}\n`);
  process.stdout.write(`  Teachers: ${result.teacherCount}\n`);
  process.stdout.write(`  Knowledges: ${result.knowledgeCount}\n`);
  process.stdout.write(`  Sessions: ${result.sessionCount}\n`);
  process.stdout.write(`  Relations: ${result.relationCount}\n`);
  process.stdout.write(`  Study interactions: ${result.studyInteractionCount}\n`);
  process.stdout.write(`  Platform interactions: ${result.platformInteractionCount}\n`);
  process.stdout.write(`  Duplicates: ${result.duplicateCount}\n`);
  process.stdout.write(`  Cognitive profiles: ${result.cognitiveProfileCount}\n`);
  process.stdout.write(`  Student works: ${result.studentWorkCount}\n`);

  // Verify
  process.stdout.write("\n=== Verification ===\n");
  const vStudentNodes = await prisma.graphNode.count({
    where: { scenarioId: scenario.id, nodeType: "Student" },
  });
  const vKnowledgeNodes = await prisma.graphNode.count({
    where: { scenarioId: scenario.id, nodeType: "Knowledge" },
  });
  const vInteractions = await prisma.interaction.count({
    where: { session: { scenarioId: scenario.id } },
  });
  const vCognitiveProfiles = await prisma.studentCognitiveProfile.count();
  const vStudentWorks = await prisma.studentWork.count();
  process.stdout.write(`  Student nodes: ${vStudentNodes}\n`);
  process.stdout.write(`  Knowledge nodes: ${vKnowledgeNodes}\n`);
  process.stdout.write(`  Interactions: ${vInteractions}\n`);
  process.stdout.write(`  Cognitive profiles: ${vCognitiveProfiles}\n`);
  process.stdout.write(`  Student works: ${vStudentWorks}\n`);

  process.stdout.write("\nDone!\n");
  await app.close();
}

main().catch((e) => {
  process.stderr.write(e.message + "\n" + e.stack + "\n");
  process.exit(1);
});
