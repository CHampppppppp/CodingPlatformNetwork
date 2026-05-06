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

function seededRandom(seed: number): number {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function generateRate(seed: number): number {
  const rand = seededRandom(seed);
  const rate = 1 + rand * 4;
  return Math.round(rate * 100) / 100;
}

async function main() {
  console.log('🚀 开始创建学生资源评分...\n');

  const scenarios = await prisma.learningScenario.findMany({
    where: { isActive: true },
  });
  console.log(`场景数: ${scenarios.length}\n`);

  for (const scenario of scenarios) {
    console.log(`📌 场景: ${scenario.nameZh}`);

    const students = await prisma.graphNode.findMany({
      where: {
        nodeType: 'Student',
        scenarioId: scenario.id,
      },
      select: { id: true },
    });
    console.log(`  学生数: ${students.length}`);

    if (students.length === 0) {
      console.log('  跳过\n');
      continue;
    }

    const resources = await prisma.resource.findMany({
      select: { id: true },
    });
    console.log(`  资源数: ${resources.length}`);

    const studentIds = students.map(s => s.id);
    const resourceIds = resources.map(r => r.id);

    const ratesToCreate: Array<{ studentId: string; resourceId: string; rate: Prisma.Decimal }> = [];
    let totalCreated = 0;

    for (let i = 0; i < studentIds.length; i++) {
      const studentId = studentIds[i];
      
      for (let j = 0; j < resourceIds.length; j++) {
        const resourceId = resourceIds[j];
        
        const seed = SEED + i * resourceIds.length + j;
        const shouldRate = seededRandom(seed) < 0.3;
        
        if (shouldRate) {
          const rateValue = generateRate(seed + 1000);
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
            totalCreated += result.count;
            ratesToCreate.length = 0;
          }
        }
      }
    }

    if (ratesToCreate.length > 0) {
      const result = await prisma.studentResourceRate.createMany({
        data: ratesToCreate,
        skipDuplicates: true,
      });
      totalCreated += result.count;
    }

    console.log(`  ✅ 创建评分: ${totalCreated}\n`);
  }

  const finalCount = await prisma.studentResourceRate.count();
  console.log(`\n📊 评分总数: ${finalCount}`);
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
