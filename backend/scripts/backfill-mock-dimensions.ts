import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";

const MOCK_DIMENSIONS = [
  { code: "PSY_INTEREST_STABILITY", min: 0, max: 10 },
  { code: "PSY_LIFE_SATISFACTION", min: 0, max: 10 },
];

function scoreLevel(value: number, max: number): string {
  const ratio = value / max;
  if (ratio >= 0.8) return "高";
  if (ratio >= 0.6) return "中";
  return "低";
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);

  const existingDefs = await prisma.cognitiveDimensionDef.findMany({
    where: {
      dimensionCode: {
        in: MOCK_DIMENSIONS.map((d) => d.code),
      },
    },
  });

  if (existingDefs.length !== MOCK_DIMENSIONS.length) {
    throw new Error(
      `Missing CognitiveDimensionDef records: expected ${MOCK_DIMENSIONS.length}, found ${existingDefs.length}`,
    );
  }

  // Find all profiles that already have any of the 14 original raw dimensions
  // but are missing the two new mock dimensions.
  const profilesWithScores = await prisma.studentCognitiveProfile.findMany({
    where: {
      dimensionScores: {
        some: {
          dimensionCode: {
            in: [
              "COG_READING",
              "COG_LANGUAGE",
              "COG_SCIENCE_KNOWLEDGE",
              "COG_SCIENCE_INQUIRY",
              "COG_COMPUTATIONAL",
              "COG_TECH_LITERACY",
              "PSY_ANXIETY",
              "PSY_DEPRESSION",
              "PSY_PRESSURE",
              "PSY_RESILIENCE",
              "PRAC_INNOVATION",
              "PRAC_PROBLEM_SOLVING",
              "PRAC_COLLABORATION",
              "PRAC_PRACTICE",
            ],
          },
        },
      },
    },
    select: {
      id: true,
      dimensionScores: {
        select: {
          dimensionCode: true,
        },
      },
    },
  });

  let inserted = 0;
  let skipped = 0;

  for (const profile of profilesWithScores) {
    const existingCodes = new Set(
      profile.dimensionScores.map((s) => s.dimensionCode),
    );

    const missingDimensions = MOCK_DIMENSIONS.filter(
      (d) => !existingCodes.has(d.code),
    );

    if (missingDimensions.length === 0) {
      skipped += 1;
      continue;
    }

    await prisma.studentCognitiveDimensionScore.createMany({
      data: missingDimensions.map((dim) => {
        const value =
          Math.round(
            (dim.min + Math.random() * (dim.max - dim.min) + Number.EPSILON) *
              100,
          ) / 100;
        return {
          profileId: profile.id,
          dimensionCode: dim.code,
          scoreValue: value,
          scoreLevel: scoreLevel(value, dim.max),
        };
      }),
      skipDuplicates: true,
    });

    inserted += missingDimensions.length;
  }

  process.stdout.write(
    `Mock dimension scores inserted: ${inserted} (profiles checked: ${profilesWithScores.length}, skipped: ${skipped})\n`,
  );

  await app.close();
}

main().catch((e) => {
  process.stderr.write(e.message + "\n" + e.stack + "\n");
  process.exit(1);
});
