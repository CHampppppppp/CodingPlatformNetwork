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
    select: { id: true }
  });

  const nodeIds = knowledges.map(k => k.id);

  const profilesWithContent = await prisma.knowledgeProfile.findMany({
    where: { nodeId: { in: nodeIds } },
    select: { nodeId: true, content: true }
  });

  const nodesWithContent = new Set(
    profilesWithContent.filter(p => p.content && p.content.trim().length > 0).map(p => p.nodeId)
  );

  const nodesWithoutContent = nodeIds.filter(id => !nodesWithContent.has(id));

  console.log('Total knowledge nodes:', nodeIds.length);
  console.log('Nodes with content:', nodesWithContent.size);
  console.log('Nodes without content:', nodesWithoutContent.length);

  if (nodesWithoutContent.length > 0) {
    console.log('\nDeleting related records...');

    // Delete interactions where target is a knowledge node without content
    const deletedInteractions = await prisma.interaction.deleteMany({
      where: { targetNodeId: { in: nodesWithoutContent } }
    });
    console.log('Deleted', deletedInteractions.count, 'interactions');

    // Delete StudentKnowledgeRelation where knowledge is without content
    const deletedSKR = await prisma.studentKnowledgeRelation.deleteMany({
      where: { knowledgeNodeId: { in: nodesWithoutContent } }
    });
    console.log('Deleted', deletedSKR.count, 'student-knowledge relations');

    // Delete ResourceKnowledgeRelation where knowledge is without content
    const deletedRKR = await prisma.resourceKnowledgeRelation.deleteMany({
      where: { knowledgeNodeId: { in: nodesWithoutContent } }
    });
    console.log('Deleted', deletedRKR.count, 'resource-knowledge relations');

    // Delete knowledge profiles
    await prisma.knowledgeProfile.deleteMany({
      where: { nodeId: { in: nodesWithoutContent } }
    });
    console.log('Deleted knowledge profiles');

    // Delete knowledge nodes
    await prisma.graphNode.deleteMany({
      where: { id: { in: nodesWithoutContent } }
    });
    console.log('Deleted', nodesWithoutContent.length, 'knowledge nodes');
  }

  await prisma.$disconnect();
}

main().catch(console.error);