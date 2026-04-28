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

  const interactions = await prisma.interaction.findMany({
    where: {
      sessionId: { in: sessions.map(s => s.id) },
    },
    include: {
      sourceNode: { select: { id: true, displayName: true, nodeType: true, scenarioId: true } },
      targetNode: { select: { id: true, displayName: true, nodeType: true, scenarioId: true } },
    },
    take: 10,
  });

  console.log('Sample interactions (without sourceNode filter):');
  interactions.forEach(i => {
    console.log(`  ${i.sourceNode.displayName}(${i.sourceNode.nodeType}, scenario=${i.sourceNode.scenarioId?.slice(0,8)}) -> ${i.targetNode.displayName}(${i.targetNode.nodeType}, scenario=${i.targetNode.scenarioId?.slice(0,8)})`);
  });

  const filtered = await prisma.interaction.findMany({
    where: {
      sessionId: { in: sessions.map(s => s.id) },
      sourceNode: { scenarioId: scenario.id },
    },
    include: {
      sourceNode: { select: { id: true, displayName: true, nodeType: true, scenarioId: true } },
      targetNode: { select: { id: true, displayName: true, nodeType: true, scenarioId: true } },
    },
    take: 10,
  });

  console.log('\nSample interactions (with sourceNode.scenarioId filter):');
  filtered.forEach(i => {
    console.log(`  ${i.sourceNode.displayName}(${i.sourceNode.nodeType}) -> ${i.targetNode.displayName}(${i.targetNode.nodeType})`);
  });

  console.log(`\nWithout filter: ${await prisma.interaction.count({ where: { sessionId: { in: sessions.map(s => s.id) } } })}`);
  console.log(`With filter: ${await prisma.interaction.count({ where: { sessionId: { in: sessions.map(s => s.id) }, sourceNode: { scenarioId: scenario.id } } })}`);

  await prisma.$disconnect();
}

main().catch(console.error);
