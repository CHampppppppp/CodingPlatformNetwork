#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
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
  const adapter = new PrismaMssql(databaseUrl);
  prisma = new PrismaClient({ adapter });
} else {
  const adapter = new PrismaMariaDb(databaseUrl);
  prisma = new PrismaClient({ adapter });
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateBaseRate(seed: number): number {
  const rand = seededRandom(seed);
  return 1.5 + rand * 3.5;
}

function generateRate(baseRate: number, seed: number): number {
  const rand = seededRandom(seed);
  const noise = (rand - 0.5) * 1.0;
  const rate = baseRate + noise;
  return Math.max(1.0, Math.min(5.0, Math.round(rate * 100) / 100));
}

async function main() {
  console.log('🚀 开始按资源品质更新评分...\n');

  const resources = await prisma.resource.findMany({
    select: { id: true, title: true },
  });

  console.log(`📊 资源总数: ${resources.length}\n`);

  let totalUpdated = 0;

  for (let i = 0; i < resources.length; i++) {
    const resource = resources[i];
    const baseRate = generateBaseRate(i * 1000);

    const rates = await prisma.studentResourceRate.findMany({
      where: { resourceId: resource.id },
      select: { id: true },
    });

    if (rates.length === 0) continue;

    for (let j = 0; j < rates.length; j++) {
      const newRate = generateRate(baseRate, i * 1000 + j * 10);
      await prisma.studentResourceRate.update({
        where: { id: rates[j].id },
        data: { rate: newRate },
      });
    }

    totalUpdated += rates.length;

    if ((i + 1) % 10 === 0 || i === resources.length - 1) {
      console.log(`   已更新 ${i + 1}/${resources.length} 个资源, ${totalUpdated} 条评分`);
    }
  }

  console.log('\n📊 更新完成!');

  const stats = await prisma.$queryRaw`
    SELECT 
      COUNT(*) as total,
      ROUND(AVG(CAST(rate AS DECIMAL(10,2))), 2) as avgRate,
      MIN(CAST(rate AS DECIMAL(10,2))) as minRate,
      MAX(CAST(rate AS DECIMAL(10,2))) as maxRate
    FROM student_resource_rates_test
  `;
  console.table(stats);

  const resourceStats = await prisma.$queryRaw`
    SELECT 
      r.title,
      COUNT(srr.id) as rateCount,
      ROUND(AVG(CAST(srr.rate AS DECIMAL(10,2))), 2) as avgRate,
      ROUND((AVG(CAST(srr.rate AS DECIMAL(10,2))) / 5) * 100, 0) as acceptanceRate
    FROM resources_test r
    JOIN student_resource_rates_test srr ON r.id = srr.resourceId
    GROUP BY r.id, r.title
    ORDER BY avgRate DESC
    LIMIT 10
  `;
  console.log('\n接受度最高的10个资源:');
  console.table(resourceStats);

  const lowResourceStats = await prisma.$queryRaw`
    SELECT 
      r.title,
      COUNT(srr.id) as rateCount,
      ROUND(AVG(CAST(srr.rate AS DECIMAL(10,2))), 2) as avgRate,
      ROUND((AVG(CAST(srr.rate AS DECIMAL(10,2))) / 5) * 100, 0) as acceptanceRate
    FROM resources_test r
    JOIN student_resource_rates_test srr ON r.id = srr.resourceId
    GROUP BY r.id, r.title
    ORDER BY avgRate ASC
    LIMIT 10
  `;
  console.log('\n接受度最低的10个资源:');
  console.table(lowResourceStats);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('\n❌ 失败:', error);
  process.exit(1);
});
