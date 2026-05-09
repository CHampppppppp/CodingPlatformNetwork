#!/usr/bin/env ts-node
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set in ' + envPath);
}

let prisma: PrismaClient;
if (databaseUrl.startsWith('sqlserver://')) {
  prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl) });
} else {
  prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });
}

const BATCH_SIZE = 5000;
const SEED = 42;
const MIN_RATES_PER_STUDENT = 3;
const MAX_RATES_PER_STUDENT = 8;
const RATE_MIN = 1;
const RATE_MAX = 5;

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateRate(seed: number): number {
  const rand = seededRandom(seed);
  const rate = RATE_MIN + rand * (RATE_MAX - RATE_MIN);
  return Math.round(rate * 100) / 100;
}

function shuffleArray<T>(array: T[], seed: number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function main() {
  console.log('🚀 开始创建学生资源评分...\n');

  const scenarios = await prisma.learningScenario.findMany({
    where: { isActive: true },
  });
  console.log(`场景数: ${scenarios.length}\n`);

  const resources = await prisma.resource.findMany({
    select: { id: true },
  });
  const resourceIds = resources.map(r => r.id);
  console.log(`总资源数: ${resourceIds.length}\n`);

  if (resourceIds.length === 0) {
    console.log('❌ 没有资源，无法创建评分');
    return;
  }

  let totalCreated = 0;

  for (const scenario of scenarios) {
    console.log(`📌 场景: ${scenario.nameZh}`);

    const students = await prisma.graphNode.findMany({
      where: {
        nodeType: 'Student',
        scenarioId: scenario.id,
      },
      select: { id: true },
    });

    if (students.length === 0) {
      console.log('  无学生，跳过\n');
      continue;
    }

    console.log(`  学生数: ${students.length}`);

    const ratesToCreate: Array<{ studentId: string; resourceId: string; rate: Prisma.Decimal }> = [];
    let scenarioCreated = 0;

    for (let i = 0; i < students.length; i++) {
      const studentId = students[i].id;
      const seed = SEED + i * 1000;
      
      const numRates = MIN_RATES_PER_STUDENT + 
        Math.floor(seededRandom(seed) * (MAX_RATES_PER_STUDENT - MIN_RATES_PER_STUDENT + 1));
      
      const shuffledResources = shuffleArray(resourceIds, seed + 500);
      const selectedResources = shuffledResources.slice(0, Math.min(numRates, resourceIds.length));
      
      for (let j = 0; j < selectedResources.length; j++) {
        const resourceId = selectedResources[j];
        const rateSeed = seed + j * 100;
        const rateValue = generateRate(rateSeed);
        
        ratesToCreate.push({
          studentId,
          resourceId,
          rate: new Prisma.Decimal(rateValue),
        });

        if (ratesToCreate.length >= BATCH_SIZE) {
          const result = await prisma.studentResourceRate.createMany({
            data: ratesToCreate,
            skipDuplicates: true,
          });
          scenarioCreated += result.count;
          ratesToCreate.length = 0;
        }
      }
    }

    if (ratesToCreate.length > 0) {
      const result = await prisma.studentResourceRate.createMany({
        data: ratesToCreate,
        skipDuplicates: true,
      });
      scenarioCreated += result.count;
    }

    console.log(`  ✅ 创建评分: ${scenarioCreated}\n`);
    totalCreated += scenarioCreated;
  }

  const finalCount = await prisma.studentResourceRate.count();
  console.log(`\n📊 总计:`);
  console.log(`  新建评分: ${totalCreated}`);
  console.log(`  评分总数: ${finalCount}`);
  console.log('✅ 完成!');
}

main()
  .catch((error) => {
    console.error('\n❌ 失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
