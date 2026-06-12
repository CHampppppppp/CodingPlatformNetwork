import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const scenario = await prisma.learningScenario.findUnique({ where: { code: 'ONLINE_COURSE' } });
  if (!scenario) { console.log('Scenario not found'); return; }

  // Delete STUDY interactions in batches
  console.log('Deleting STUDY interactions in batches...');
  let totalDeleted = 0;
  let deleted = 0;

  do {
    deleted = await prisma.interaction.deleteMany({
      where: { actionType: 'STUDY', session: { scenarioId: scenario.id } }
    });
    totalDeleted += deleted.count;
    console.log(`Deleted batch of ${deleted.count}, total: ${totalDeleted}`);
  } while (deleted > 0);

  console.log(`\nTotal STUDY interactions deleted: ${totalDeleted}`);

  // Delete student knowledge relations in batches
  console.log('\nDeleting SKR in batches...');
  totalDeleted = 0;

  do {
    deleted = await prisma.studentKnowledgeRelation.deleteMany({
      where: { studentNode: { scenarioId: scenario.id } }
    });
    totalDeleted += deleted.count;
    console.log(`Deleted batch of ${deleted.count}, total: ${totalDeleted}`);
  } while (deleted > 0);

  console.log(`\nTotal SKR deleted: ${totalDeleted}`);
  await prisma.$disconnect();
  console.log('\nDone!');
}

main().catch(console.error);
