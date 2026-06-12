import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const scenario = await prisma.learningScenario.findUnique({ where: { code: 'ONLINE_COURSE' } });
  if (!scenario) return;

  const knowledges = await prisma.graphNode.findMany({
    where: { scenarioId: scenario.id, nodeType: 'Knowledge' },
    select: { id: true, displayName: true }
  });

  const profiles = await prisma.knowledgeProfile.findMany({
    where: { nodeId: { in: knowledges.map(k => k.id) } },
    select: { nodeId: true, content: true }
  });

  const profileMap = new Map(profiles.map(p => [p.nodeId, String(p.content || '')]));

  const withoutContent = knowledges.filter(k => {
    const c = profileMap.get(k.id) || '';
    return c.trim().length === 0;
  });

  console.log('Knowledge nodes without content:', withoutContent.length);
  console.log('\nSample names:');
  withoutContent.slice(0, 15).forEach(k => console.log(' ', k.displayName));

  await prisma.$disconnect();
}

main().catch(console.error);