const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function check() {
  try {
    // Check if there's any data in graph_nodes at all
    const result = await prisma.$queryRawUnsafe(`
      SELECT TOP 5 id, nodeType, displayName, createdAt
      FROM graph_nodes_test
      ORDER BY createdAt DESC
    `);
    console.log('Recent graph nodes:');
    for (const row of result) {
      console.log(`  ${row.id} | ${row.nodeType} | ${row.displayName} | ${row.createdAt}`);
    }
    
    if (result.length === 0) {
      console.log('  No data found');
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  await prisma.$disconnect();
}
check();
