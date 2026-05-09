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
  console.log('🔍 检查当前生生交互数据...\n');

  const ssCount = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM interactions_test i
    JOIN graph_nodes_test s ON i.sourceNodeId = s.id
    JOIN graph_nodes_test t ON i.targetNodeId = t.id
    WHERE s.nodeType = 'Student' AND t.nodeType = 'Student'
      AND i.actionType IN ('LIKE', 'COMMENT')
  `;
  console.log('生生交互总数(LIKE/COMMENT):', ssCount[0].count);

  const ssByAction = await prisma.$queryRaw`
    SELECT i.actionType, COUNT(*) as count
    FROM interactions_test i
    JOIN graph_nodes_test s ON i.sourceNodeId = s.id
    JOIN graph_nodes_test t ON i.targetNodeId = t.id
    WHERE s.nodeType = 'Student' AND t.nodeType = 'Student'
    GROUP BY i.actionType
  `;
  console.log('\n按 actionType 分组的生生交互:');
  console.table(ssByAction);

  const teacherStudent = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM interactions_test i
    JOIN graph_nodes_test s ON i.sourceNodeId = s.id
    JOIN graph_nodes_test t ON i.targetNodeId = t.id
    WHERE (
      (s.nodeType = 'Teacher' AND t.nodeType = 'Student') OR
      (s.nodeType = 'Student' AND t.nodeType = 'Teacher')
    )
    AND i.actionType IN ('LIKE', 'COMMENT')
  `;
  console.log('师生交互数(LIKE/COMMENT):', teacherStudent[0].count);

  const sample = await prisma.$queryRaw`
    SELECT i.actionType, s.displayName as source, t.displayName as target, i.strength
    FROM interactions_test i
    JOIN graph_nodes_test s ON i.sourceNodeId = s.id
    JOIN graph_nodes_test t ON i.targetNodeId = t.id
    WHERE s.nodeType = 'Student' AND t.nodeType = 'Student'
      AND i.actionType IN ('LIKE', 'COMMENT')
    LIMIT 10
  `;
  console.log('\n生生交互示例:');
  console.table(sample);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
