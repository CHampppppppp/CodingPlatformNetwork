#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
const url = process.env.DATABASE_URL!;
const adapter = new PrismaMariaDb(url);
const prisma = new PrismaClient({ adapter });

async function clean() {
  const scenario = await prisma.learningScenario.findUnique({ where: { code: 'ONLINE_COURSE' } });
  if (!scenario) { console.log('No ONLINE_COURSE scenario found'); await prisma.$disconnect(); return; }

  const nodes = await prisma.graphNode.findMany({ where: { scenarioId: scenario.id }, select: { id: true } });
  const nodeIds = nodes.map(n => n.id);
  console.log('Nodes to delete:', nodeIds.length);

  const sessions = await prisma.interactionSession.findMany({ where: { scenarioId: scenario.id }, select: { id: true } });
  const sessionIds = sessions.map(s => s.id);
  console.log('Sessions to delete:', sessionIds.length);

  if (sessionIds.length > 0) {
    await prisma.interaction.deleteMany({ where: { sessionId: { in: sessionIds } } });
    console.log('Deleted interactions');
    await prisma.sessionClassroomAnalysis.deleteMany({ where: { sessionId: { in: sessionIds } } });
    console.log('Deleted classroom analyses');
    await prisma.studentWork.deleteMany({ where: { sessionId: { in: sessionIds } } });
    console.log('Deleted student works');
  }

  if (nodeIds.length > 0) {
    await prisma.studentKnowledgeRelation.deleteMany({ where: { studentNodeId: { in: nodeIds } } });
    await prisma.studentKnowledgeRelation.deleteMany({ where: { knowledgeNodeId: { in: nodeIds } } });
    console.log('Deleted student-knowledge relations');
    await prisma.studentCognitiveProfile.deleteMany({ where: { studentNodeId: { in: nodeIds } } });
    console.log('Deleted cognitive profiles');
    await prisma.studentProfile.deleteMany({ where: { nodeId: { in: nodeIds } } });
    console.log('Deleted student profiles');
    await prisma.teacherProfile.deleteMany({ where: { nodeId: { in: nodeIds } } });
    console.log('Deleted teacher profiles');
    await prisma.knowledgeProfile.deleteMany({ where: { nodeId: { in: nodeIds } } });
    console.log('Deleted knowledge profiles');
    await prisma.resourceKnowledgeRelation.deleteMany({ where: { knowledgeNodeId: { in: nodeIds } } });
    console.log('Deleted resource-knowledge relations');
  }

  await prisma.interactionSession.deleteMany({ where: { scenarioId: scenario.id } });
  console.log('Deleted sessions');
  await prisma.graphNode.deleteMany({ where: { scenarioId: scenario.id } });
  console.log('Deleted nodes');
  await prisma.learningScenario.delete({ where: { id: scenario.id } });
  console.log('Deleted scenario');

  await prisma.$disconnect();
  console.log('Cleanup complete');
}

clean().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
