import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

async function main() {
  const adapter = new PrismaMariaDb('mysql://root@localhost:3306/interaction_network_test');
  const prisma = new PrismaClient({ adapter });

  try {
    const scenarios = await prisma.learningScenario.findMany();
    console.log('Existing scenarios:', scenarios.length);
    scenarios.forEach(s => console.log(s.code, s.nameZh));
    
    const collaborativeLearning = await prisma.learningScenario.findUnique({
      where: { code: 'COLLABORATIVE_LEARNING' }
    });
    
    if (!collaborativeLearning) {
      console.log('\nCreating COLLABORATIVE_LEARNING scenario...');
      const newScenario = await prisma.learningScenario.create({
        data: {
          code: 'COLLABORATIVE_LEARNING',
          nameZh: '在线协作学习',
          sortOrder: 5,
          isActive: true
        }
      });
      console.log('Created scenario:', newScenario.code, newScenario.nameZh);
    } else {
      console.log('\nScenario already exists:', collaborativeLearning.code, collaborativeLearning.nameZh);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
