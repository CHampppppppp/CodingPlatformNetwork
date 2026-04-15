import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaMssql(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

(async () => {
  const students = await prisma.$queryRawUnsafe(`
    SELECT gn.displayName, sp.externalUserId 
    FROM graph_nodes_test gn 
    JOIN student_profiles_test sp ON gn.id = sp.nodeId 
    WHERE gn.nodeType = 'Student' 
    ORDER BY gn.displayName
  `);
  console.table(students);
  const withId = await prisma.studentProfile.count({ where: { externalUserId: { not: null } } });
  const total = await prisma.studentProfile.count();
  console.log(`已同步: ${withId} / ${total}`);
  await prisma.$disconnect();
})();
