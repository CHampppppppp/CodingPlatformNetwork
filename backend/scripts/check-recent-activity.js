const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function check() {
  try {
    const result = await prisma.$queryRawUnsafe(`
      SELECT TOP 10 
        name, 
        create_date,
        modify_date
      FROM sys.tables 
      WHERE name LIKE '%test%'
      ORDER BY modify_date DESC
    `);
    console.log('Recent table activity:');
    for (const row of result) {
      console.log(`  ${row.name}: created=${row.create_date}, modified=${row.modify_date}`);
    }
  } catch (e) {
    console.log('Error checking activity:', e.message);
  }
  
  await prisma.$disconnect();
}
check();
