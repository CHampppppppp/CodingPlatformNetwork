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

async function main() {
  console.log('🔍 检查资源评分数据...\n');

  // 1. 检查 resources 表中 acceptanceRate 字段
  console.log('=== 1. resources_test 表原始 acceptanceRate ===');
  const resourcesWithAcceptanceRate = await prisma.$queryRaw`
    SELECT COUNT(*) as count,
           COUNT(acceptanceRate) as hasValue,
           AVG(CAST(acceptanceRate AS DECIMAL(10,2))) as avgAcceptanceRate
    FROM resources_test
  `;
  console.table(resourcesWithAcceptanceRate);

  // 2. 检查 student_resource_rates_test 表
  console.log('\n=== 2. student_resource_rates_test 表统计 ===');
  const rateStats = await prisma.$queryRaw`
    SELECT COUNT(*) as totalRates,
           AVG(CAST(rate AS DECIMAL(10,2))) as avgRate,
           MIN(CAST(rate AS DECIMAL(10,2))) as minRate,
           MAX(CAST(rate AS DECIMAL(10,2))) as maxRate
    FROM student_resource_rates_test
  `;
  console.table(rateStats);

  // 3. 按资源分组统计
  console.log('\n=== 3. 各资源评分统计（前15条）===');
  const resourceRateStats = await prisma.$queryRaw`
    SELECT 
      r.id,
      r.title,
      COUNT(srr.id) as rateCount,
      ROUND(AVG(CAST(srr.rate AS DECIMAL(10,2))), 2) as avgRate,
      ROUND((AVG(CAST(srr.rate AS DECIMAL(10,2))) / 5) * 100, 0) as calculatedAcceptance,
      ROUND(CAST(r.acceptanceRate AS DECIMAL(10,2)), 0) as storedAcceptanceRate
    FROM resources_test r
    LEFT JOIN student_resource_rates_test srr ON r.id = srr.resourceId
    GROUP BY r.id, r.title, r.acceptanceRate
    ORDER BY rateCount DESC
    LIMIT 15
  `;
  console.table(resourceRateStats);

  // 4. 评分分布
  console.log('\n=== 4. 评分值分布 ===');
  const rateDistribution = await prisma.$queryRaw`
    SELECT 
      CAST(rate AS DECIMAL(10,2)) as rateValue,
      COUNT(*) as count
    FROM student_resource_rates_test
    GROUP BY CAST(rate AS DECIMAL(10,2))
    ORDER BY rateValue
  `;
  console.table(rateDistribution);

  // 5. 检查是否有资源的平均分恰好为3.0
  console.log('\n=== 5. 平均分恰好为3.0的资源 ===');
  const exactThree = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM (
      SELECT resourceId
      FROM student_resource_rates_test
      GROUP BY resourceId
      HAVING ABS(AVG(CAST(rate AS DECIMAL(10,2))) - 3.0) < 0.01
    ) t
  `;
  console.log(`平均分 ≈ 3.0 的资源数: ${exactThree[0].count}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('\n❌ 失败:', error);
  process.exit(1);
});
