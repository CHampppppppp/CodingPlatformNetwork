import path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set in ' + envPath);
}

let prisma: PrismaClient;
if (databaseUrl.startsWith('sqlserver://')) {
  const adapter = new PrismaMssql(databaseUrl);
  prisma = new PrismaClient({ adapter });
} else {
  const adapter = new PrismaMariaDb(databaseUrl);
  prisma = new PrismaClient({ adapter });
}

const SCENARIO_CODE = 'SHOW_CASE';
const PROFILE_VERSION = 'v1.0_mock';

const dimensionCodes = [
  'COG_READING',
  'COG_LANGUAGE',
  'COG_SCIENCE_KNOWLEDGE',
  'COG_SCIENCE_INQUIRY',
  'COG_COMPUTATIONAL',
  'COG_TECH_LITERACY',
  'PSY_ANXIETY',
  'PSY_DEPRESSION',
  'PSY_RESILIENCE',
  'PSY_PRESSURE',
  'PRAC_INNOVATION',
  'PRAC_PROBLEM_SOLVING',
  'PRAC_COLLABORATION',
  'PRAC_PRACTICE',
];

function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return ((hash >>> 0) % 1000) / 1000;
}

function getMockScore(seed: string, offset: number): number {
  const raw = seededRandom(seed + offset);
  return Number((2.0 + raw * 6.0).toFixed(2));
}

function getScoreLevel(score: number): string {
  if (score >= 7) return '高';
  if (score >= 4) return '中';
  return '低';
}

async function main() {
  try {
    console.log('Starting SHOW_CASE student cognitive profile check...\n');

    const scenario = await prisma.learningScenario.findUnique({
      where: { code: SCENARIO_CODE },
    });

    if (!scenario) {
      console.log(`Scenario not found: ${SCENARIO_CODE}`);
      return;
    }

    console.log(`Scenario: ${scenario.nameZh} (${scenario.id})\n`);

    const studentNodes = await prisma.graphNode.findMany({
      where: {
        nodeType: 'STUDENT',
        scenarioId: scenario.id,
      },
      select: {
        id: true,
        displayName: true,
      },
    });

    console.log(`Found ${studentNodes.length} student nodes`);

    const studentsWithProfiles = await prisma.studentCognitiveProfile.findMany({
      where: {
        studentNodeId: {
          in: studentNodes.map((n) => n.id),
        },
      },
      select: {
        studentNodeId: true,
      },
    });

    const studentsWithProfileIds = new Set(studentsWithProfiles.map((p) => p.studentNodeId));
    const studentsNeedMock = studentNodes.filter(
      (n) => !studentsWithProfileIds.has(n.id)
    );

    console.log(`Existing profiles: ${studentsWithProfileIds.size}`);
    console.log(`Need mock data: ${studentsNeedMock.length}\n`);

    if (studentsNeedMock.length === 0) {
      console.log('All students have cognitive profile data!');
      return;
    }

    let successCount = 0;
    for (const student of studentsNeedMock) {
      const seed = student.id;

      const totalScore = Number((
        dimensionCodes.reduce((sum, _, idx) => sum + getMockScore(seed, idx), 0) / dimensionCodes.length
      ).toFixed(2));

      const profile = await prisma.studentCognitiveProfile.create({
        data: {
          studentNodeId: student.id,
          profileVersion: PROFILE_VERSION,
          generatedAt: new Date(),
          totalScore,
        },
      });

      const dimensionScores = dimensionCodes.map((code, idx) => {
        const scoreValue = getMockScore(seed, idx);
        return {
          profileId: profile.id,
          dimensionCode: code,
          scoreValue,
          scoreLevel: getScoreLevel(scoreValue),
        };
      });

      await prisma.studentCognitiveDimensionScore.createMany({
        data: dimensionScores,
      });

      console.log(`Generated mock data: ${student.displayName} (total: ${totalScore})`);
      successCount++;
    }

    console.log(`\nSummary:`);
    console.log(`  - Existing: ${studentsWithProfileIds.size}`);
    console.log(`  - New mock: ${successCount}`);
    console.log(`  - Total: ${studentNodes.length}`);
    console.log('\nDone!');
  } catch (error) {
    console.error('\nError:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
