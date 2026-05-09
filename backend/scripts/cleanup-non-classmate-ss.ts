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
  console.log('🔍 检查非同班生生交互...\n');

  const ssInteractions = await prisma.$queryRaw`
    SELECT i.id, i.sourceNodeId, i.targetNodeId, i.actionType, 
           s.classId as sourceClass, s.schoolId as sourceSchool,
           t.classId as targetClass, t.schoolId as targetSchool
    FROM interactions_test i
    JOIN graph_nodes_test s ON i.sourceNodeId = s.id
    JOIN graph_nodes_test t ON i.targetNodeId = t.id
    WHERE s.nodeType = 'Student' AND t.nodeType = 'Student'
      AND i.actionType IN ('LIKE', 'COMMENT')
  `;

  let sameClass = 0;
  let diffClass = 0;
  const diffClassIds: string[] = [];

  (ssInteractions as any[]).forEach((row: any) => {
    if (row.sourceClass === row.targetClass && row.sourceSchool === row.targetSchool) {
      sameClass++;
    } else {
      diffClass++;
      if (diffClassIds.length < 20) diffClassIds.push(row.id);
    }
  });

  console.log(`同班生生交互: ${sameClass}`);
  console.log(`非同班生生交互: ${diffClass}`);
  console.log(`\n是否删除 ${diffClass} 条非同班交互?`);

  if (diffClass > 0) {
    console.log('正在删除...');
    const result = await prisma.$queryRaw`
      DELETE i FROM interactions_test i
      JOIN graph_nodes_test s ON i.sourceNodeId = s.id
      JOIN graph_nodes_test t ON i.targetNodeId = t.id
      WHERE s.nodeType = 'Student' AND t.nodeType = 'Student'
        AND i.actionType IN ('LIKE', 'COMMENT')
        AND (s.classId != t.classId OR s.schoolId != t.schoolId)
    `;
    console.log('删除完成');
  }

  const finalCount = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM interactions_test i
    JOIN graph_nodes_test s ON i.sourceNodeId = s.id
    JOIN graph_nodes_test t ON i.targetNodeId = t.id
    WHERE s.nodeType = 'Student' AND t.nodeType = 'Student'
      AND i.actionType IN ('LIKE', 'COMMENT')
  `;
  console.log(`\n最终同班生生交互数: ${finalCount[0].count}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
