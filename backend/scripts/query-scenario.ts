import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL!;
const adapter = new PrismaMariaDb(databaseUrl);
const prisma = new PrismaClient({ adapter });

async function main() {
  const scenario = await prisma.learningScenario.findUnique({ where: { code: 'LEARNING_COURSE' } });
  console.log('LEARNING_COURSE scenario:', scenario?.id, scenario?.code, scenario?.nameZh);

  if (!scenario) { console.log('No scenario found'); return; }

  const nodeDist = await prisma.graphNode.groupBy({
    by: ['nodeType'],
    where: { scenarioId: scenario.id },
    _count: { id: true }
  });
  console.log('\n节点分布:', JSON.stringify(nodeDist, null, 2));

  const knowledgeCount = await prisma.graphNode.count({
    where: { scenarioId: scenario.id, nodeType: 'Knowledge' }
  });
  console.log('\n知识点节点数量:', knowledgeCount);

  const knowledgeEdges = await prisma.interaction.count({
    where: {
      OR: [
        { sourceNode: { scenarioId: scenario.id, nodeType: 'Knowledge' } },
        { targetNode: { scenarioId: scenario.id, nodeType: 'Knowledge' } }
      ]
    }
  });
  console.log('知识点交互边数量:', knowledgeEdges);
}

main().finally(() => prisma.$disconnect());