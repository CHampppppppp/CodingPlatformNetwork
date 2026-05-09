#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaMssql } from '@prisma/adapter-mssql';
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
  console.log('🗑️  开始删除一半的 StudentResourceRate 记录...\n');

  const beforeCount = await prisma.studentResourceRate.count();
  console.log(`删除前总数: ${beforeCount}`);

  if (beforeCount === 0) {
    console.log('没有记录需要删除。');
    return;
  }

  const halfCount = Math.floor(beforeCount / 2);
  console.log(`计划删除: ${halfCount} 条\n`);

  let deletedTotal = 0;
  const BATCH_SIZE = 5000;

  while (deletedTotal < halfCount) {
    const remainingToDelete = halfCount - deletedTotal;
    const deleteBatchSize = Math.min(BATCH_SIZE, remainingToDelete);

    const result = await prisma.$executeRaw`
      DELETE FROM student_resource_rates_test 
      WHERE id IN (
        SELECT id FROM (
          SELECT id FROM student_resource_rates_test 
          ORDER BY id ASC 
          LIMIT ${deleteBatchSize}
        ) AS t
      )
    `;

    deletedTotal += deleteBatchSize;
    console.log(`已删除: ${deletedTotal} / ${halfCount}`);
  }

  const afterCount = await prisma.studentResourceRate.count();
  console.log(`\n删除后总数: ${afterCount}`);
  console.log(`实际删除: ${beforeCount - afterCount}`);
  console.log('\n✅ 完成!');
}

main()
  .catch((error) => {
    console.error('\n❌ 失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
