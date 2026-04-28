import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL!;
let prisma: PrismaClient;
if (dbUrl.startsWith('sqlserver://')) {
  prisma = new PrismaClient({ adapter: new PrismaMssql(dbUrl) });
} else {
  prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbUrl) });
}

async function main() {
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'SHOW_CASE' },
  });
  console.log('Scenario:', scenario);

  if (scenario) {
    const students = await prisma.graphNode.findMany({
      where: { scenarioId: scenario.id, nodeType: 'Student' },
      include: { studentProfile: true },
    });
    console.log(`Students in SHOW_CASE: ${students.length}`);
    students.slice(0, 5).forEach(s => console.log(`  ${s.displayName} | school=${s.schoolId?.slice(0,8)} grade=${s.gradeId?.slice(0,8)} class=${s.classId?.slice(0,8)}`));

    const teachers = await prisma.graphNode.findMany({
      where: { scenarioId: scenario.id, nodeType: 'Teacher' },
    });
    console.log(`Teachers in SHOW_CASE: ${teachers.length}`);
    teachers.forEach(t => console.log(`  ${t.displayName}`));

    const knowledges = await prisma.graphNode.findMany({
      where: { scenarioId: scenario.id, nodeType: 'Knowledge' },
    });
    console.log(`Knowledges in SHOW_CASE: ${knowledges.length}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
