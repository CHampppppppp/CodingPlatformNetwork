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
  console.log('🔍 分析当前师生交互数据分布...\n');

  const teacherStudentInteractions = await prisma.$queryRaw`
    SELECT 
      s.schoolId,
      s.gradeId,
      s.classId,
      COUNT(*) as interactionCount
    FROM interactions_test i
    JOIN graph_nodes_test s ON i.sourceNodeId = s.id
    JOIN graph_nodes_test t ON i.targetNodeId = t.id
    WHERE (
      (s.nodeType = 'Teacher' AND t.nodeType = 'Student') OR
      (s.nodeType = 'Student' AND t.nodeType = 'Teacher')
    )
    GROUP BY s.schoolId, s.gradeId, s.classId
    ORDER BY interactionCount DESC
    LIMIT 20
  `;

  console.log('师生交互最多的班级:');
  console.table(teacherStudentInteractions);

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
  console.log(`\n师生交互总数: ${totalTS[0].count}`);

  const totalClasses = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT classId) as count
    FROM graph_nodes_test
    WHERE nodeType = 'Student' AND classId IS NOT NULL
  `;
  console.log(`班级总数: ${totalClasses[0].count}`);

  const classesWithTS = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT s.classId) as count
    FROM interactions_test i
    JOIN graph_nodes_test s ON i.sourceNodeId = s.id
    JOIN graph_nodes_test t ON i.targetNodeId = t.id
    WHERE (
      (s.nodeType = 'Teacher' AND t.nodeType = 'Student') OR
      (s.nodeType = 'Student' AND t.nodeType = 'Teacher')
    )
    AND s.classId IS NOT NULL
  `;
  console.log(`有师生交互的班级数: ${classesWithTS[0].count}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
