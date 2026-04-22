const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function check() {
  try {
    const result = await prisma.$queryRawUnsafe('SELECT COUNT(*) as count FROM graph_nodes_test');
    console.log('graph_nodes_test:', result[0].count);
  } catch (e) {
    console.log('graph_nodes_test: ERROR');
  }
  
  try {
    const result = await prisma.$queryRawUnsafe('SELECT COUNT(*) as count FROM schools_test');
    console.log('schools_test:', result[0].count);
  } catch (e) {
    console.log('schools_test: ERROR');
  }
  
  try {
    const result = await prisma.$queryRawUnsafe('SELECT COUNT(*) as count FROM learning_scenarios_test');
    console.log('learning_scenarios_test:', result[0].count);
  } catch (e) {
    console.log('learning_scenarios_test: ERROR');
  }
  
  await prisma.$disconnect();
}
check();
