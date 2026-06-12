import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'ONLINE_COURSE' },
  });
  
  if (!scenario) {
    console.log('Scenario not found');
    return;
  }

  const count = await prisma.graphNode.count({
    where: { nodeType: 'Student', scenarioId: scenario.id },
  });
  console.log('Total Student nodes in ONLINE_COURSE:', count);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
