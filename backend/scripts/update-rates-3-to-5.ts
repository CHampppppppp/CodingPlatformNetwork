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

const BATCH_SIZE = 5000;

function randomRate(): number {
  return Math.round((3 + Math.random() * 2) * 100) / 100;
}

async function main() {
  console.log('🚀 开始更新学生资源评分...\n');

  const totalCount = await prisma.studentResourceRate.count();
  console.log(`📊 总评分记录数: ${totalCount}\n`);

  if (totalCount === 0) {
    console.log('⚠️  没有评分记录需要更新');
    return;
  }

  let updatedCount = 0;
  let cursor: string | undefined;

  while (updatedCount < totalCount) {
    const rates = await prisma.studentResourceRate.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    if (rates.length === 0) break;

    cursor = rates[rates.length - 1].id;

    for (const rate of rates) {
      await prisma.studentResourceRate.update({
        where: { id: rate.id },
        data: { rate: randomRate() },
      });
    }

    updatedCount += rates.length;
    console.log(`   已更新 ${updatedCount}/${totalCount} 条`);
  }

  console.log('\n📊 更新完成:');
  console.log(`   更新记录数: ${updatedCount}`);

  const stats = await prisma.studentResourceRate.aggregate({
    _avg: { rate: true },
    _min: { rate: true },
    _max: { rate: true },
  });

  console.log(`   平均分: ${stats._avg.rate?.toFixed(2)}`);
  console.log(`   最低分: ${stats._min.rate}`);
  console.log(`   最高分: ${stats._max.rate}`);
  console.log('\n✅ 完成!');

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('\n❌ 失败:', error);
  process.exit(1);
});
