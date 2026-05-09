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
  console.log('开始删除学生-知识点连线...\n');

  const relationCount = await prisma.studentKnowledgeRelation.count();
  console.log(`当前学生-知识点关联数: ${relationCount}`);

  const interactionCount = await prisma.interaction.count({
    where: {
      actionType: 'STUDY',
      interactionType: 'PLATFORM',
    },
  });
  console.log(`当前 STUDY/PLATFORM 交互数: ${interactionCount}`);

  if (relationCount === 0 && interactionCount === 0) {
    console.log('没有数据需要删除');
    return;
  }

  console.log('\n执行删除...');

  const deletedInteractions = await prisma.interaction.deleteMany({
    where: {
      actionType: 'STUDY',
      interactionType: 'PLATFORM',
    },
  });
  console.log(`  已删除交互: ${deletedInteractions.count}`);

  const deletedRelations = await prisma.studentKnowledgeRelation.deleteMany({});
  console.log(`  已删除关联: ${deletedRelations.count}`);

  console.log('\n完成!');
}

main()
  .catch((error) => {
    console.error('\n失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
