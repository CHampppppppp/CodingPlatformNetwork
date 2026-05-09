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

async function main() {
  console.log('🚀 开始按资源品质分配评分...\n');

  const resources = await prisma.resource.findMany({
    select: { id: true, title: true },
  });

  console.log(`📊 资源总数: ${resources.length}`);

  for (let i = 0; i < resources.length; i++) {
    const resource = resources[i];
    const seed = i * 1000;
    const baseRate = 1.5 + seededRandom(seed) * 3.5;

    await prisma.$executeRaw`
      UPDATE student_resource_rates_test
      SET rate = ROUND(
        GREATEST(1.0, LEAST(5.0, ${baseRate} + (RAND() - 0.5) * 1.0)),
        2
      )
      WHERE resourceId = ${resource.id}
    `;

    if ((i + 1) % 10 === 0 || i === resources.length - 1) {
      console.log(`   已更新 ${i + 1}/${resources.length} 个资源`);
    }
  }

  console.log('\n📊 更新完成!');

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
    LIMIT 5
  `;
  console.log('\n接受度最高的5个:');
  console.table(resourceStats);

  const lowStats = await prisma.$queryRaw`
    SELECT 
      r.title,
      COUNT(srr.id) as rateCount,
      ROUND(AVG(CAST(srr.rate AS DECIMAL(10,2))), 2) as avgRate,
      ROUND((AVG(CAST(srr.rate AS DECIMAL(10,2))) / 5) * 100, 0) as acceptanceRate
    FROM resources_test r
    JOIN student_resource_rates_test srr ON r.id = srr.resourceId
    GROUP BY r.id, r.title
    ORDER BY avgRate ASC
    LIMIT 5
  `;
  console.log('\n接受度最低的5个:');
  console.table(lowStats);

  const overall = await prisma.$queryRaw`
    SELECT 
      ROUND(AVG(CAST(rate AS DECIMAL(10,2))), 2) as avgRate,
      MIN(CAST(rate AS DECIMAL(10,2))) as minRate,
      MAX(CAST(rate AS DECIMAL(10,2))) as maxRate
    FROM student_resource_rates_test
  `;
  console.log('\n总体统计:');
  console.table(overall);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('\n❌ 失败:', error);
  process.exit(1);
});
