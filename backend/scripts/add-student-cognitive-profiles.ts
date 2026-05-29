import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return () => {
    hash = ((hash << 5) - hash + 1) | 0;
    return ((hash >>> 0) % 1000) / 1000;
  };
}

function gaussianRandom(rng: () => number, mean: number, stddev: number): number {
  const u1 = rng();
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u2)) * Math.cos(2 * Math.PI * u1);
  return mean + z * stddev;
}

interface DimensionConfig {
  code: string;
  min: number;
  max: number;
  mean: number;
  stddev: number;
}

const DIMENSION_CONFIGS: DimensionConfig[] = [
  { code: 'aiLiteracy', min: 1, max: 5, mean: 3.8, stddev: 0.8 },
  { code: 'cognitiveLoad', min: 1, max: 5, mean: 3.2, stddev: 0.7 },
  { code: 'computationalThinking', min: 1, max: 5, mean: 3.5, stddev: 0.9 },
  { code: 'humanAiTrust', min: 1, max: 5, mean: 3.9, stddev: 0.7 },
  { code: 'knowledgeReserve', min: 1, max: 5, mean: 3.6, stddev: 0.8 },
  { code: 'learningAttitude', min: 1, max: 5, mean: 4.0, stddev: 0.7 },
  { code: 'learningEngagement', min: 1, max: 5, mean: 3.8, stddev: 0.8 },
  { code: 'learningMethod', min: 1, max: 5, mean: 3.5, stddev: 0.7 },
  { code: 'learningMotivation', min: 1, max: 5, mean: 3.9, stddev: 0.8 },
  { code: 'selfRegulatedLearning', min: 1, max: 5, mean: 3.6, stddev: 0.8 },
  { code: 'COG_COMPUTATIONAL', min: 0, max: 10, mean: 5.5, stddev: 2.0 },
  { code: 'COG_LANGUAGE', min: 0, max: 10, mean: 5.5, stddev: 2.0 },
  { code: 'COG_READING', min: 0, max: 10, mean: 5.5, stddev: 2.0 },
  { code: 'COG_SCIENCE_INQUIRY', min: 0, max: 10, mean: 5.0, stddev: 2.2 },
  { code: 'COG_SCIENCE_KNOWLEDGE', min: 0, max: 10, mean: 5.5, stddev: 2.0 },
  { code: 'COG_TECH_LITERACY', min: 0, max: 10, mean: 5.5, stddev: 2.0 },
  { code: 'PRAC_COLLABORATION', min: 0, max: 10, mean: 5.5, stddev: 2.0 },
  { code: 'PRAC_INNOVATION', min: 0, max: 10, mean: 5.0, stddev: 2.2 },
  { code: 'PRAC_PRACTICE', min: 0, max: 10, mean: 5.5, stddev: 2.0 },
  { code: 'PRAC_PROBLEM_SOLVING', min: 0, max: 10, mean: 5.5, stddev: 2.0 },
  { code: 'PSY_ANXIETY', min: 0, max: 10, mean: 4.5, stddev: 2.0 },
  { code: 'PSY_DEPRESSION', min: 0, max: 10, mean: 4.0, stddev: 2.0 },
  { code: 'PSY_PRESSURE', min: 0, max: 10, mean: 5.0, stddev: 2.0 },
  { code: 'PSY_RESILIENCE', min: 0, max: 10, mean: 5.5, stddev: 2.0 },
];

function getLevel(score: number, min: number, max: number): string {
  const range = max - min;
  const normalized = (score - min) / range;
  if (normalized >= 0.75) return '高';
  if (normalized >= 0.4) return '中';
  return '低';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

async function main() {
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'ONLINE_COURSE' },
  });
  if (!scenario) {
    console.log('ONLINE_COURSE scenario not found');
    return;
  }

  console.log('=== Student Cognitive Profiles Generator ===\n');
  console.log('Scenario ID:', scenario.id);

  // 使用 count + 分页游标方式获取学生
  const BATCH_SIZE = 1000;
  const PROFILE_VERSION = 'v1.0-online-course-mock';
  const GENERATED_AT = new Date();

  // 获取学生总数
  const totalStudents = await prisma.graphNode.count({
    where: { nodeType: 'Student', scenarioId: scenario.id },
  });
  console.log('Total students:', totalStudents);

  // 检查已有画像数
  const existingCount = await prisma.studentCognitiveProfile.count({
    where: { studentNode: { scenarioId: scenario.id } },
  });
  console.log('Existing profiles:', existingCount);

  let totalProcessed = 0;
  let lastStudentId: string | null = null;

  console.log('\nProcessing students in batches...\n');

  while (true) {
    // 分页获取学生
    const students = await prisma.graphNode.findMany({
      where: {
        nodeType: 'Student',
        scenarioId: scenario.id,
        ...(lastStudentId ? { id: { gt: lastStudentId } } : {}),
      },
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    if (students.length === 0) break;

    lastStudentId = students[students.length - 1].id;

    // 构建批量插入的SQL
    const profileValues: string[] = [];
    const scoreValues: string[] = [];

    for (const student of students) {
      const studentId = student.id;
      const rng = seededRandom(studentId + '_cognitive_profile');

      const dimensionScores: { code: string; value: number; level: string }[] = [];

      for (const dim of DIMENSION_CONFIGS) {
        const rawScore = gaussianRandom(rng, dim.mean, dim.stddev);
        const score = Math.round(clamp(rawScore, dim.min, dim.max) * 100) / 100;
        const level = getLevel(score, dim.min, dim.max);
        dimensionScores.push({ code: dim.code, value: score, level });
      }

      const normalizedTotal = dimensionScores.reduce((sum, d) => {
        const cfg = DIMENSION_CONFIGS.find(c => c.code === d.code)!;
        const normalized = (d.value - cfg.min) / (cfg.max - cfg.min);
        return sum + normalized;
      }, 0) / dimensionScores.length * 10;
      const totalScore = Math.round(clamp(normalizedTotal, 0, 5) * 100) / 100;

      const profileId = generateId('oc_p');

      profileValues.push(
        `('${profileId}', '${studentId}', '${PROFILE_VERSION}', '${GENERATED_AT.toISOString().substring(0, 19)}', ${totalScore})`
      );

      for (const dim of dimensionScores) {
        scoreValues.push(
          `('${generateId('oc_s')}', '${profileId}', '${dim.code}', ${dim.value}, '${dim.level}')`
        );
      }
    }

    // 使用原始SQL批量插入
    try {
      if (profileValues.length > 0) {
        await prisma.$executeRawUnsafe(`
          INSERT IGNORE INTO student_cognitive_profiles_test
          (id, studentNodeId, profileVersion, generatedAt, totalScore)
          VALUES ${profileValues.join(',')}
        `);
      }

      if (scoreValues.length > 0) {
        await prisma.$executeRawUnsafe(`
          INSERT IGNORE INTO student_cognitive_dimension_scores_test
          (id, profileId, dimensionCode, scoreValue, scoreLevel)
          VALUES ${scoreValues.join(',')}
        `);
      }

      totalProcessed += students.length;
    } catch (error) {
      console.error('Error inserting batch:', error);
    }

    if (totalProcessed % 10000 === 0 || students.length < BATCH_SIZE) {
      console.log(`Progress: ${totalProcessed}/${totalStudents}`);
    }

    if (students.length < BATCH_SIZE) break;
  }

  console.log('\n=== Final Summary ===');
  console.log('Total processed:', totalProcessed);

  const finalCount = await prisma.studentCognitiveProfile.count({
    where: { studentNode: { scenarioId: scenario.id } },
  });
  console.log('Final profile count:', finalCount);

  await prisma.$disconnect();
}

main().catch(console.error);
