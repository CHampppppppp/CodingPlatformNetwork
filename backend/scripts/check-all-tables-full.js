const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function check() {
  try {
    const result = await prisma.$queryRawUnsafe(`
      SELECT 
        name,
        create_date,
        modify_date
      FROM sys.tables 
      WHERE type = 'U'
      ORDER BY modify_date DESC
    `);
    console.log('All user tables:');
    for (const row of result) {
      console.log(`  ${row.name}: modified=${row.modify_date}`);
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  await prisma.$disconnect();
}
check();
