import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const scenario = await prisma.learningScenario.findUnique({ where: { code: 'SHOW_CASE' } });
  if (!scenario) return;

  const students = await prisma.graphNode.findMany({
    where: { scenarioId: scenario.id, nodeType: 'Student' },
    select: { classId: true },
    take: 10
  });
  const uniqClassIds = [...new Set(students.map(s => s.classId))];
  console.log('GraphNode.classId uniq:', uniqClassIds);

  const sc = await prisma.class.findFirst({ where: { className: '801班' }, select: { id: true } });
  console.log('Class 801 id:', sc?.id);
  console.log('Match?', uniqClassIds.includes(sc?.id || ''));
}
main().finally(() => prisma.$disconnect());
