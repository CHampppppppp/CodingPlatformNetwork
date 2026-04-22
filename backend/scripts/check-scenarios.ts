const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const scenarios = await prisma.learningScenario.findMany();
  console.log('Existing scenarios:', scenarios.length);
  scenarios.forEach(s => console.log(s.code, s.nameZh));
}
main().catch(console.error).finally(() => prisma.$disconnect());
