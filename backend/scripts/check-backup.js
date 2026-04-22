const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function check() {
  try {
    const result = await prisma.$queryRawUnsafe(`
      SELECT 
        name,
        create_date
      FROM sys.tables 
      WHERE name NOT LIKE '%test%'
        AND name NOT LIKE 'sys%'
        AND name NOT LIKE '%migration%'
      ORDER BY create_date DESC
    `);
    console.log('Non-test tables:');
    for (const row of result) {
      console.log(`  ${row.name}: created=${row.create_date}`);
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  await prisma.$disconnect();
}
check();
