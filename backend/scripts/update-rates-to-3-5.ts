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
  console.log('🚀 开始批量更新评分...\n');

  const beforeStats = await prisma.$queryRaw`
    SELECT 
      COUNT(*) as total,
      ROUND(AVG(CAST(rate AS DECIMAL(10,2))), 2) as avgRate,
      MIN(CAST(rate AS DECIMAL(10,2))) as minRate,
      MAX(CAST(rate AS DECIMAL(10,2))) as maxRate
    FROM student_resource_rates_test
  `;
  
  console.log('更新前统计:');
  console.table(beforeStats);

  if (databaseUrl.startsWith('sqlserver://')) {
    await prisma.$executeRaw`
      UPDATE student_resource_rates_test
      SET rate = ROUND(3.00 + RAND(CHECKSUM(NEWID())) * 2.00, 2)
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE student_resource_rates_test
      SET rate = ROUND(3.00 + RAND() * 2.00, 2)
    `;
  }

  const afterStats = await prisma.$queryRaw`
    SELECT 
      COUNT(*) as total,
      ROUND(AVG(CAST(rate AS DECIMAL(10,2))), 2) as avgRate,
      MIN(CAST(rate AS DECIMAL(10,2))) as minRate,
      MAX(CAST(rate AS DECIMAL(10,2))) as maxRate
    FROM student_resource_rates_test
  `;
  
  console.log('\n更新后统计:');
  console.table(afterStats);
  
  const distribution = await prisma.$queryRaw`
    SELECT 
      CASE 
        WHEN CAST(rate AS DECIMAL(10,2)) < 3.5 THEN '3.0-3.5'
        WHEN CAST(rate AS DECIMAL(10,2)) < 4.0 THEN '3.5-4.0'
        WHEN CAST(rate AS DECIMAL(10,2)) < 4.5 THEN '4.0-4.5'
        ELSE '4.5-5.0'
      END as range_label,
      COUNT(*) as count
    FROM student_resource_rates_test
    GROUP BY 
      CASE 
        WHEN CAST(rate AS DECIMAL(10,2)) < 3.5 THEN '3.0-3.5'
        WHEN CAST(rate AS DECIMAL(10,2)) < 4.0 THEN '3.5-4.0'
        WHEN CAST(rate AS DECIMAL(10,2)) < 4.5 THEN '4.0-4.5'
        ELSE '4.5-5.0'
      END
    ORDER BY range_label
  `;
  
  console.log('\n评分分布:');
  console.table(distribution);

  console.log('\n✅ 完成!');
  
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('\n❌ 失败:', error);
  process.exit(1);
});
