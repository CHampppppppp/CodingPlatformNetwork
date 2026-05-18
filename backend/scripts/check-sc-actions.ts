import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const scenario = await prisma.learningScenario.findUnique({ where: { code: 'SHOW_CASE' } });
  if (!scenario) return;

  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
    select: { id: true }
  });
  const sessionIds = sessions.map(s => s.id);

  const actions = await prisma.interaction.groupBy({
    by: ['actionType'],
    where: { sessionId: { in: sessionIds } },
    _count: { id: true }
  });
  console.log('SHOW_CASE actionTypes:', JSON.stringify(actions, null, 2));

  const ss = await prisma.interaction.findMany({
    where: {
      sessionId: { in: sessionIds },
      sourceNode: { nodeType: 'Student' },
      targetNode: { nodeType: 'Student' }
    },
    select: { actionType: true, interactionType: true },
    take: 5
  });
  console.log('\nStudent-Student samples:', JSON.stringify(ss, null, 2));
}
main().finally(() => prisma.$disconnect());
