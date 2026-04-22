const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function restore() {
  console.log('Checking if we need to restore data...');
  
  // Check current counts
  const studentCount = await prisma.graphNode.count({ where: { nodeType: 'Student' } });
  console.log('Current student count:', studentCount);
  
  if (studentCount === 0) {
    console.log('WARNING: All student data has been deleted!');
    console.log('This happened because the cleanup scripts deleted all data.');
    console.log('You need to re-import the data from CSV.');
  }
  
  await prisma.$disconnect();
}
restore();
