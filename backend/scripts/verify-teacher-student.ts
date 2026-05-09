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
  console.log('🔍 验证师生交互数据...\n');

  const totalTS = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM interactions_test i
    JOIN graph_nodes_test s ON i.sourceNodeId = s.id
    JOIN graph_nodes_test t ON i.targetNodeId = t.id
    WHERE (
      (s.nodeType = 'Teacher' AND t.nodeType = 'Student') OR
      (s.nodeType = 'Student' AND t.nodeType = 'Teacher')
    )
  `;

  const mockWorks = await prisma.studentWork.count({
    where: { id: { startsWith: 'sw_mock_' } }
  });

  const mockInteractions = await prisma.interaction.count({
    where: { actionType: 'TEACHER_EVALUATION' }
  });

  console.log('=== 数据统计 ===');
  console.log(`师生交互总数: ${totalTS[0].count}`);
  console.log(`Mock 作品数: ${mockWorks}`);
  console.log(`TEACHER_EVALUATION 交互数: ${mockInteractions}`);

  const sample = await prisma.$queryRaw`
    SELECT i.actionType, s.displayName as teacher, t.displayName as student, i.strength
    FROM interactions_test i
    JOIN graph_nodes_test s ON i.sourceNodeId = s.id
    JOIN graph_nodes_test t ON i.targetNodeId = t.id
    WHERE i.actionType = 'TEACHER_EVALUATION'
    LIMIT 5
  `;

  console.log('\n新增交互示例:');
  console.table(sample);

  const beforeAfter = await prisma.$queryRaw`
    SELECT 
      COUNT(CASE WHEN i.createdAt < DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 END) as beforeCount,
      COUNT(CASE WHEN i.createdAt >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 END) as afterCount
    FROM interactions_test i
    JOIN graph_nodes_test s ON i.sourceNodeId = s.id
    JOIN graph_nodes_test t ON i.targetNodeId = t.id
    WHERE (
      (s.nodeType = 'Teacher' AND t.nodeType = 'Student') OR
      (s.nodeType = 'Student' AND t.nodeType = 'Teacher')
    )
  `;

  console.log('\n=== 增长情况 ===');
  console.log(`新增前: ${beforeAfter[0].beforeCount}`);
  console.log(`新增后: ${beforeAfter[0].afterCount}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
