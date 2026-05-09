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
  prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl) });
} else {
  prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });
}

async function main() {
  const scenario = await prisma.learningScenario.findUnique({ where: { code: 'SHOW_CASE' } });
  if (!scenario) { console.log('No SHOW_CASE'); return; }

  const students = await prisma.graphNode.findMany({
    where: { nodeType: 'Student', scenarioId: scenario.id },
    select: { id: true },
  });
  const studentIds = students.map(s => s.id);
  console.log('SHOW_CASE students:', studentIds.length);

  const interactions = await prisma.interaction.findMany({
    where: {
      OR: [
        { sourceNodeId: { in: studentIds }, targetNode: { nodeType: 'Knowledge' } },
        { targetNodeId: { in: studentIds }, sourceNode: { nodeType: 'Knowledge' } },
      ],
    },
    include: { sourceNode: true, targetNode: true },
  });
  const kIds = new Set<string>();
  for (const i of interactions) {
    if (i.sourceNode.nodeType === 'Knowledge') kIds.add(i.sourceNode.id);
    if (i.targetNode.nodeType === 'Knowledge') kIds.add(i.targetNode.id);
  }
  console.log('Knowledge nodes from interactions:', kIds.size);

  const skRel = await prisma.studentKnowledgeRelation.findMany({
    where: { studentNodeId: { in: studentIds } },
    select: { knowledgeNodeId: true },
  });
  for (const r of skRel) kIds.add(r.knowledgeNodeId);
  console.log('Total knowledge nodes:', kIds.size);

  const resourceRels = await prisma.resourceKnowledgeRelation.findMany({
    where: { knowledgeNodeId: { in: Array.from(kIds) } },
    select: { resourceId: true },
  });
  const resourceIds = [...new Set(resourceRels.map(r => r.resourceId))];
  console.log('Related resources:', resourceIds.length);

  const classRates = await prisma.studentResourceRate.findMany({
    where: { studentId: { in: studentIds }, resourceId: { in: resourceIds } },
    select: { studentId: true, resourceId: true, rate: true },
  });
  console.log('Class rates for related resources:', classRates.length);

  const studentRateCount: Record<string, number> = {};
  for (const r of classRates) {
    studentRateCount[r.studentId] = (studentRateCount[r.studentId] || 0) + 1;
  }
  console.log('Student rate distribution:', Object.entries(studentRateCount).map(([k, v]) => v).sort((a, b) => a - b));

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('\n❌ 失败:', error);
  process.exit(1);
});
