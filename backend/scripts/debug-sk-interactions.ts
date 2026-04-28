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

  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
    select: { id: true },
  });

  const studentKnowledgeInteractions = await prisma.interaction.findMany({
    where: {
      sessionId: { in: sessions.map(s => s.id) },
      sourceNode: { nodeType: 'Student', scenarioId: scenario.id },
      targetNode: { nodeType: 'Knowledge', scenarioId: scenario.id },
    },
    include: {
      sourceNode: { select: { id: true, displayName: true, nodeType: true, scenarioId: true } },
      targetNode: { select: { id: true, displayName: true, nodeType: true, scenarioId: true } },
    },
    take: 5,
  });

  console.log('Student->Knowledge interactions (with nodeType filter):');
  studentKnowledgeInteractions.forEach(i => {
    console.log(`  ${i.sourceNode.displayName}(${i.sourceNode.nodeType}, scenario=${i.sourceNode.scenarioId?.slice(0,8)}) -> ${i.targetNode.displayName}(${i.targetNode.nodeType}, scenario=${i.targetNode.scenarioId?.slice(0,8)})`);
  });
  console.log(`Count: ${await prisma.interaction.count({
    where: {
      sessionId: { in: sessions.map(s => s.id) },
      sourceNode: { nodeType: 'Student', scenarioId: scenario.id },
      targetNode: { nodeType: 'Knowledge', scenarioId: scenario.id },
    },
  })}`);

  await prisma.$disconnect();
}

main().catch(console.error);
