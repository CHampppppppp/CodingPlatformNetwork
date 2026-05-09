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
  console.log('🚀 使用SQL批量更新评分...\n');

  const beforeStats = await prisma.$queryRaw`
    SELECT 
      COUNT(*) as total,
      ROUND(AVG(CAST(rate AS DECIMAL(10,2))), 2) as avgRate
    FROM student_resource_rates_test
  `;
  console.log('更新前:', beforeStats[0]);

  console.log('⏳ 执行批量更新...');

  if (databaseUrl.startsWith('sqlserver://')) {
    await prisma.$executeRaw`
      UPDATE srr
      SET rate = ROUND(
        CASE 
          WHEN ABS(CHECKSUM(NEWID())) % 100 < 20 THEN 1.5 + RAND(CHECKSUM(NEWID())) * 1.5
          WHEN ABS(CHECKSUM(NEWID())) % 100 < 50 THEN 3.0 + RAND(CHECKSUM(NEWID())) * 1.5  
          ELSE 4.0 + RAND(CHECKSUM(NEWID())) * 1.0
        END,
        2
      )
      FROM student_resource_rates_test srr
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE student_resource_rates_test srr
      JOIN resources_test r ON srr.resourceId = r.id
      SET srr.rate = ROUND(
        GREATEST(1.0, LEAST(5.0,
          1.5 + (ASCII(SUBSTRING(r.id, 1, 1)) / 255.0) * 3.0
          + (ASCII(SUBSTRING(r.id, 3, 1)) / 255.0) * 0.5
          + (RAND() - 0.5) * 1.0
        )),
        2
      )
    `;
  }

  console.log('✅ SQL更新完成\n');

  const afterStats = await prisma.$queryRaw`
    SELECT 
      COUNT(*) as total,
      ROUND(AVG(CAST(rate AS DECIMAL(10,2))), 2) as avgRate,
      MIN(CAST(rate AS DECIMAL(10,2))) as minRate,
      MAX(CAST(rate AS DECIMAL(10,2))) as maxRate
    FROM student_resource_rates_test
  `;
  console.log('更新后:', afterStats[0]);

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
  console.log('\n接受度最高的5个资源:');
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
  console.log('\n接受度最低的5个资源:');
  console.table(lowStats);

  const distribution = await prisma.$queryRaw`
    SELECT 
      CASE 
        WHEN CAST(rate AS DECIMAL(10,2)) < 2.0 THEN '1.0-2.0 (低)'
        WHEN CAST(rate AS DECIMAL(10,2)) < 3.0 THEN '2.0-3.0 (中低)'
        WHEN CAST(rate AS DECIMAL(10,2)) < 4.0 THEN '3.0-4.0 (中等)'
        ELSE '4.0-5.0 (高)'
      END as range_label,
      COUNT(*) as count
    FROM student_resource_rates_test
    GROUP BY 
      CASE 
        WHEN CAST(rate AS DECIMAL(10,2)) < 2.0 THEN '1.0-2.0 (低)'
        WHEN CAST(rate AS DECIMAL(10,2)) < 3.0 THEN '2.0-3.0 (中低)'
        WHEN CAST(rate AS DECIMAL(10,2)) < 4.0 THEN '3.0-4.0 (中等)'
        ELSE '4.0-5.0 (高)'
      END
    ORDER BY range_label
  `;
  console.log('\n评分分布:');
  console.table(distribution);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('\n❌ 失败:', error);
  process.exit(1);
});
