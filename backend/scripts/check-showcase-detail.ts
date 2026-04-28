import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL!;
let prisma: PrismaClient;
if (dbUrl.startsWith('sqlserver://')) {
  prisma = new PrismaClient({ adapter: new PrismaMssql(dbUrl) });
} else {
  prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbUrl) });
}

async function main() {
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'SHOW_CASE' },
  });
  if (!scenario) return;

  const knowledges = await prisma.graphNode.findMany({
    where: { scenarioId: scenario.id, nodeType: 'Knowledge' },
    include: { knowledgeProfile: true },
  });
  console.log('Existing knowledges:');
  knowledges.forEach(k => console.log(`  ${k.displayName} | id=${k.id.slice(0,8)}`));

  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
  });
  console.log(`\nSessions in SHOW_CASE: ${sessions.length}`);
  sessions.forEach(s => console.log(`  ${s.sessionName || '-'} | id=${s.id.slice(0,8)}`));

  if (sessions.length > 0) {
    const interactions = await prisma.interaction.findMany({
      where: { sessionId: { in: sessions.map(s => s.id) } },
      include: {
        sourceNode: { select: { displayName: true, nodeType: true } },
        targetNode: { select: { displayName: true, nodeType: true } },
      },
    });
    console.log(`\nInteractions: ${interactions.length}`);
    interactions.slice(0, 10).forEach(i => console.log(`  ${i.sourceNode.displayName}(${i.sourceNode.nodeType}) -> ${i.targetNode.displayName}(${i.targetNode.nodeType}) | type=${i.interactionType}`));
  }

  const resources = await prisma.resource.count();
  console.log(`\nTotal resources: ${resources}`);

  const resourceRelations = await prisma.resourceKnowledgeRelation.findMany({
    where: { knowledgeNode: { scenarioId: scenario.id } },
    include: {
      resource: { select: { title: true } },
      knowledgeNode: { select: { displayName: true } },
    },
  });
  console.log(`Resource-Knowledge relations for SHOW_CASE: ${resourceRelations.length}`);
  resourceRelations.slice(0, 5).forEach(r => console.log(`  ${r.resource.title} -> ${r.knowledgeNode.displayName}`));

  await prisma.$disconnect();
}

main().catch(console.error);
