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
    `Usage: npx ts-node scripts/import-mock-scenario.ts <scenarioCode> [options]\n\n` +
      `scenarioCode: TEACHER_QA | HOME_LEARNING\n\n` +
      `Options:\n` +
      `  --execute              Actually write to the database (default: dry-run only)\n` +
      `  --schools=N            Number of schools (default: 2)\n` +
      `  --classes-per-school=N Max classes per school (default: 3)\n` +
      `  --min-students=N       Minimum students per class (default: 20)\n` +
      `  --max-students=N       Maximum students per class (default: 40)\n` +
      `  --seed=N               Random seed (default: 42)\n`,
  );
}

function parseNumberFlag(
  flags: string[],
  name: string,
  defaultValue: number,
): number {
  const prefix = `${name}=`;
  let rawValue: string | undefined;

  for (let i = 0; i < flags.length; i++) {
    const arg = flags[i];
    if (arg === name) {
      const next = flags[i + 1];
      if (next && !next.startsWith("--")) {
        rawValue = next;
        break;
      }
      throw new Error(`Error: ${name} requires a numeric value.`);
    }
    if (arg.startsWith(prefix)) {
      rawValue = arg.slice(prefix.length);
      break;
    }
  }

  if (rawValue === undefined) {
    return defaultValue;
  }

  if (rawValue === "" || !/^-?\d+$/.test(rawValue)) {
    throw new Error(
      `Error: ${name} must be a non-negative integer, got "${rawValue}".`,
    );
  }

  const value = Number(rawValue);
  if (Number.isNaN(value)) {
    throw new Error(
      `Error: ${name} must be a valid number, got "${rawValue}".`,
    );
  }
  if (!Number.isInteger(value)) {
    throw new Error(`Error: ${name} must be an integer, got "${rawValue}".`);
  }
  if (value < 0) {
    throw new Error(`Error: ${name} must be non-negative, got ${value}.`);
  }

  return value;
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
    throw new Error("Error: scenario code is required.");
  }

  const scenarioCode = positional[0];
  if (!ALLOWED_SCENARIOS.includes(scenarioCode as ScenarioCode)) {
    printUsage();
    throw new Error(
      `Error: unsupported scenario code "${scenarioCode}". Allowed: ${ALLOWED_SCENARIOS.join(", ")}`,
    );
  }

  const execute = flags.includes("--execute");

  const options: MockScenarioOptions = {
    schoolCount: parseNumberFlag(flags, "--schools", 2),
    classesPerSchool: parseNumberFlag(flags, "--classes-per-school", 3),
    minStudentsPerClass: parseNumberFlag(flags, "--min-students", 20),
    maxStudentsPerClass: parseNumberFlag(flags, "--max-students", 40),
    seed: parseNumberFlag(flags, "--seed", 42),
  };

  if (options.minStudentsPerClass > options.maxStudentsPerClass) {
    throw new Error(
      `Error: --min-students (${options.minStudentsPerClass}) must be less than or equal to --max-students (${options.maxStudentsPerClass}).`,
    );
  }

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

async function fetchExistingKnowledges(prisma: PrismaService): Promise<
  Array<{
    externalId: string;
    displayName: string;
    content: string | null;
    category: string | null;
  }>
> {
  const nodes = await prisma.graphNode.findMany({
    where: { nodeType: "Knowledge" },
    include: { knowledgeProfile: true },
  });

  return nodes.map((node) => ({
    externalId: node.id,
    displayName: node.displayName,
    content: node.knowledgeProfile?.content ?? null,
    category: node.knowledgeProfile?.category ?? null,
  }));
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

    const prisma = app.get(PrismaService);
    const existingKnowledges = await fetchExistingKnowledges(prisma);
    if (existingKnowledges.length === 0) {
      process.stderr.write(
        "Error: no existing knowledge nodes found in the database.\n",
      );
      process.exit(1);
    }

    const optionsWithKnowledges: MockScenarioOptions = {
      ...options,
      existingKnowledges,
    };

    process.stdout.write(`Options: ${JSON.stringify(options)}\n`);
    process.stdout.write(
      `Existing knowledges available: ${existingKnowledges.length}\n`,
    );

    const adapter = new MockScenarioAdapter(scenarioCode, optionsWithKnowledges);
    const data = await adapter.parse();

    printDataStats(data);

    if (!execute) {
      process.stdout.write(
        `\nDry-run complete. Add --execute to import into the database.\n`,
      );
      return;
    }

    const ingestionService = app.get(IngestionService);

    const scenario = await prisma.learningScenario.findFirst({
      where: { code: scenarioCode },
    });
    if (!scenario) {
      process.stderr.write(
        `Error: scenario "${scenarioCode}" not found in LearningScenario table.\n`,
      );
      process.exit(1);
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
