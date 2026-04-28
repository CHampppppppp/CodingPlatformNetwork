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
    where: { sessionId: { in: sessions.map(s => s.id) } },
    include: {
      sourceNode: { select: { displayName: true, nodeType: true } },
      targetNode: { select: { displayName: true, nodeType: true } },
    },
  });

  console.log(`Total interactions: ${interactions.length}`);

  const typeCounts: Record<string, number> = {};
  const nodeTypePairs: Record<string, number> = {};

  for (const i of interactions) {
    const pair = `${i.sourceNode.nodeType}->${i.targetNode.nodeType}`;
    nodeTypePairs[pair] = (nodeTypePairs[pair] || 0) + 1;
    typeCounts[i.interactionType] = (typeCounts[i.interactionType] || 0) + 1;
  }

  console.log('\nNode type pairs:');
  Object.entries(nodeTypePairs).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  console.log('\nInteraction types:');
  Object.entries(typeCounts).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  await prisma.$disconnect();
}

main().catch(console.error);
