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
  console.log('🗑️  开始删除刚创建的 STUDY 交互记录...\n');

  const oneHourAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  console.log(`删除条件: actionType='STUDY' 且 createdAt >= ${oneHourAgo.toISOString()}`);

  const beforeCount = await prisma.interaction.count({
    where: {
      actionType: 'STUDY',
      createdAt: { gte: oneHourAgo },
    },
  });
  console.log(`待删除记录数: ${beforeCount}\n`);

  if (beforeCount === 0) {
    console.log('没有需要删除的记录。');
    return;
  }

  const BATCH_SIZE = 10000;
  let deletedTotal = 0;
  let batchNumber = 0;

  while (deletedTotal < beforeCount) {
    batchNumber++;

    const result = await prisma.$executeRaw`
      DELETE FROM interactions_test 
      WHERE id IN (
        SELECT id FROM (
          SELECT id FROM interactions_test 
          WHERE actionType = 'STUDY' 
          AND createdAt >= ${oneHourAgo}
          ORDER BY id ASC
          LIMIT ${BATCH_SIZE}
        ) AS t
      )
    `;

    const deletedInBatch = Number(result);
    deletedTotal += deletedInBatch;

    if (batchNumber % 10 === 0 || deletedInBatch === 0) {
      console.log(`   批次 ${batchNumber}: 已删除 ${deletedTotal}/${beforeCount}`);
    }

    if (deletedInBatch === 0) break;
  }

  const afterCount = await prisma.interaction.count({
    where: {
      actionType: 'STUDY',
      createdAt: { gte: oneHourAgo },
    },
  });

  console.log(`\n📊 完成统计:`);
  console.log(`   删除前: ${beforeCount}`);
  console.log(`   删除后: ${afterCount}`);
  console.log(`   实际删除: ${beforeCount - afterCount}`);

  const totalStudy = await prisma.interaction.count({ where: { actionType: 'STUDY' } });
  console.log(`   STUDY 交互总数: ${totalStudy}`);
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
