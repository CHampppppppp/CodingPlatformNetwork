import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'ONLINE_COURSE' },
  });
  if (!scenario) {
    console.log('ONLINE_COURSE scenario not found');
    return;
  }

  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
  });

  console.log(`Total sessions: ${sessions.length}\n`);

  const studentCounts: { sessionName: string; classId: string; count: number }[] = [];

  for (const session of sessions) {
    const studentCount = await prisma.graphNode.count({
      where: {
        scenarioId: scenario.id,
        nodeType: 'Student',
        classId: session.classId,
      },
    });
    studentCounts.push({
      sessionName: session.sessionName || 'unnamed',
      classId: session.classId || '',
      count: studentCount,
    });
  }

  // Sort by student count ascending
  studentCounts.sort((a, b) => a.count - b.count);

  console.log('Sessions with < 5 students:');
  const lowStudent = studentCounts.filter(s => s.count < 5);
  for (const s of lowStudent) {
    console.log(`  ${s.sessionName}: ${s.count} students (class: ${s.classId})`);
  }

  console.log(`\nTotal sessions with < 5 students: ${lowStudent.length}`);

  console.log('\n--- Top 50 sessions with fewest students ---');
  for (const s of studentCounts.slice(0, 50)) {
    console.log(`  ${s.sessionName}: ${s.count} students`);
  }

  // Statistics
  const counts = studentCounts.map(s => s.count);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const under10 = counts.filter(c => c < 10).length;
  const under50 = counts.filter(c => c < 50).length;

  console.log('\n--- Statistics ---');
  console.log(`Min students: ${min}`);
  console.log(`Max students: ${max}`);
  console.log(`Average students: ${avg.toFixed(1)}`);
  console.log(`Sessions with < 10 students: ${under10}`);
  console.log(`Sessions with < 50 students: ${under50}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
