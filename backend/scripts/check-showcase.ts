import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL!;
const adapter = new PrismaMariaDb(databaseUrl);
const prisma = new PrismaClient({ adapter });

async function main() {
  const scenario = await prisma.learningScenario.findUnique({ where: { code: 'SHOW_CASE' } });
  console.log('SHOW_CASE scenario:', scenario?.id, scenario?.code, scenario?.nameZh);

  if (!scenario) { console.log('No SHOW_CASE scenario found'); return; }

  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
    select: { id: true, classId: true, sessionName: true }
  });
  console.log(`\nSHOW_CASE sessions count: ${sessions.length}`);
  console.log('First 5 sessions:', JSON.stringify(sessions.slice(0, 5), null, 2));

  const sessionsWithNullClass = sessions.filter(s => s.classId === null).length;
  console.log(`Sessions with NULL classId: ${sessionsWithNullClass}`);

  if (sessions.length > 0) {
    const sessionIds = sessions.map(s => s.id);
    const interactions = await prisma.interaction.count({
      where: { sessionId: { in: sessionIds } }
    });
    console.log(`\nTotal interactions in SHOW_CASE sessions: ${interactions}`);

    const linkCount = await prisma.interaction.count({
      where: {
        sessionId: { in: sessionIds },
        sourceNode: { nodeType: 'Student' },
        targetNode: { nodeType: 'Student' }
      }
    });
    console.log(`Student-Student interactions: ${linkCount}`);
  }
}
main().finally(() => prisma.$disconnect());