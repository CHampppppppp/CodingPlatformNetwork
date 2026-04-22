const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function check() {
  try {
    const result = await prisma.$queryRawUnsafe(`
      SELECT migration_name, finished_at
      FROM _prisma_migrations
      ORDER BY finished_at DESC
    `);
    console.log('Recent migrations:');
    for (const row of result) {
      console.log(`  ${row.migration_name}: ${row.finished_at}`);
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  await prisma.$disconnect();
}
check();
