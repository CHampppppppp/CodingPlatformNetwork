import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";
import { IngestionService } from "../src/modules/ingestion/services/ingestion.service";
import {
  MockScenarioAdapter,
  MockScenarioOptions,
} from "../src/modules/ingestion/adapters/mock-scenario.adapter";
import { NormalizedPlatformData } from "../src/modules/ingestion/types/normalized-platform-data";

const ALLOWED_SCENARIOS = ["TEACHER_QA", "HOME_LEARNING"] as const;
type ScenarioCode = (typeof ALLOWED_SCENARIOS)[number];

function printUsage(): void {
  process.stdout.write(
    `用法：npx ts-node scripts/import-mock-scenario.ts <scenarioCode> [options]\n\n` +
      `scenarioCode: TEACHER_QA | HOME_LEARNING\n\n` +
      `选项：\n` +
      `  --execute              真正写入数据库（默认仅 dry-run）\n` +
      `  --schools=N            学校数量（默认 2）\n` +
      `  --classes-per-school=N 每校班级上限（默认 3）\n` +
      `  --min-students=N       每班最少学生（默认 20）\n` +
      `  --max-students=N       每班最多学生（默认 40）\n` +
      `  --seed=N               随机种子（默认 42）\n`,
  );
}

function parseNumberFlag(
  flags: string[],
  name: string,
  defaultValue: number,
): number {
  const prefix = `${name}=`;
  for (let i = 0; i < flags.length; i++) {
    const arg = flags[i];
    if (arg === name) {
      const next = flags[i + 1];
      if (next && !next.startsWith("--")) {
        const value = Number(next);
        if (!Number.isNaN(value)) return value;
      }
    }
    if (arg.startsWith(prefix)) {
      const value = Number(arg.slice(prefix.length));
      if (!Number.isNaN(value)) return value;
    }
  }
  return defaultValue;
}

function hasFlag(flags: string[], name: string): boolean {
  return flags.some((arg) => arg === name || arg.startsWith(`${name}=`));
}

function parseArgs(): {
  scenarioCode: ScenarioCode;
  execute: boolean;
  options: MockScenarioOptions;
} {
  const rawArgs = process.argv.slice(2);
  const positional = rawArgs.filter((a) => !a.startsWith("--"));
  const flags = rawArgs.filter((a) => a.startsWith("--"));

  if (positional.length === 0) {
    printUsage();
    process.exit(1);
  }

  const scenarioCode = positional[0];
  if (!ALLOWED_SCENARIOS.includes(scenarioCode as ScenarioCode)) {
    process.stderr.write(
      `Error: unsupported scenario code "${scenarioCode}". Allowed: ${ALLOWED_SCENARIOS.join(", ")}\n`,
    );
    printUsage();
    process.exit(1);
  }

  const execute = hasFlag(flags, "--execute");

  const options: MockScenarioOptions = {
    schoolCount: parseNumberFlag(flags, "--schools", 2),
    classesPerSchool: parseNumberFlag(flags, "--classes-per-school", 3),
    minStudentsPerClass: parseNumberFlag(flags, "--min-students", 20),
    maxStudentsPerClass: parseNumberFlag(flags, "--max-students", 40),
    seed: parseNumberFlag(flags, "--seed", 42),
  };

  return { scenarioCode: scenarioCode as ScenarioCode, execute, options };
}

function printDataStats(data: NormalizedPlatformData): void {
  const studentCount = data.users.filter((u) => u.role === "STUDENT").length;
  const teacherCount = data.users.filter((u) => u.role === "TEACHER").length;

  process.stdout.write(`\nMock data statistics:\n`);
  process.stdout.write(`  Scenario code: ${data.scenario.code}\n`);
  process.stdout.write(`  Scenario name: ${data.scenario.nameZh}\n`);
  process.stdout.write(`  Schools: ${data.schools.length}\n`);
  process.stdout.write(`  Classes: ${data.classes.length}\n`);
  process.stdout.write(`  Users: ${data.users.length}\n`);
  process.stdout.write(`    Students: ${studentCount}\n`);
  process.stdout.write(`    Teachers: ${teacherCount}\n`);
  process.stdout.write(`  Knowledges: ${data.knowledges.length}\n`);
  process.stdout.write(`  Sessions: ${data.sessions.length}\n`);
  process.stdout.write(
    `  Student-knowledge relations: ${data.studentKnowledgeRelations.length}\n`,
  );
  process.stdout.write(`  Platform interactions: ${data.interactions.length}\n`);
  process.stdout.write(`  Cognitive profiles: ${data.cognitiveProfiles?.length ?? 0}\n`);
  process.stdout.write(`  Student works: ${data.studentWorks?.length ?? 0}\n`);
}

async function main() {
  const { scenarioCode, execute, options } = parseArgs();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });

  try {
    process.stdout.write(`=== Mock Scenario Import: ${scenarioCode} ===\n`);
    process.stdout.write(
      `Mode: ${execute ? "EXECUTE (write to DB)" : "DRY-RUN (no DB writes)"}\n`,
    );
    process.stdout.write(`Options: ${JSON.stringify(options)}\n`);

    const adapter = new MockScenarioAdapter(scenarioCode, options);
    const data = await adapter.parse();

    printDataStats(data);

    if (!execute) {
      process.stdout.write(
        `\nDry-run complete. Add --execute to import into the database.\n`,
      );
      return;
    }

    const prisma = app.get(PrismaService);
    const ingestionService = app.get(IngestionService);

    const scenario = await prisma.learningScenario.findFirst({
      where: { code: scenarioCode },
    });
    if (!scenario) {
      process.stderr.write(
        `Error: scenario "${scenarioCode}" not found in LearningScenario table.\n`,
      );
      return;
    }

    process.stdout.write(`\nImporting into database...\n`);
    const result = await ingestionService.importPlatformData(data, {
      skipWhenScenarioHasNodes: false,
      concurrency: 5,
    });

    process.stdout.write(`\nImport result:\n`);
    process.stdout.write(`  Scenario code: ${result.scenarioCode}\n`);
    process.stdout.write(`  Skipped: ${result.skipped}\n`);
    process.stdout.write(`  Schools: ${result.schoolCount}\n`);
    process.stdout.write(`  Grades: ${result.gradeCount}\n`);
    process.stdout.write(`  Classes: ${result.classCount}\n`);
    process.stdout.write(`  Students: ${result.studentCount}\n`);
    process.stdout.write(`  Teachers: ${result.teacherCount}\n`);
    process.stdout.write(`  Knowledges: ${result.knowledgeCount}\n`);
    process.stdout.write(`  Sessions: ${result.sessionCount}\n`);
    process.stdout.write(`  Study interactions: ${result.studyInteractionCount}\n`);
    process.stdout.write(
      `  Platform interactions: ${result.platformInteractionCount}\n`,
    );
    process.stdout.write(`  Cognitive profiles: ${result.cognitiveProfileCount}\n`);
    process.stdout.write(`  Duplicates: ${result.duplicateCount}\n`);
    process.stdout.write(`\nDone!\n`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  process.stderr.write(e.message + "\n" + e.stack + "\n");
  process.exit(1);
});
