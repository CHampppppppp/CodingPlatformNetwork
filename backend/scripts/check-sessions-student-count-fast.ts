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

  // Get student counts per class in one query using raw SQL
  const result = await prisma.$queryRaw<{ classId: string; student_count: BigInt }[]>`
    SELECT classId, COUNT(*) as student_count 
    FROM graph_nodes_test 
    WHERE scenarioId = ${scenario.id} 
      AND nodeType = 'Student'
      AND classId IS NOT NULL
    GROUP BY classId
  `;

  const studentCountMap = new Map(result.map(r => [r.classId, Number(r.student_count)]));

  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
    select: { id: true, sessionName: true, classId: true },
  });

  console.log(`Total sessions: ${sessions.length}\n`);

  const withCounts = sessions.map(s => ({
    sessionName: s.sessionName || 'unnamed',
    classId: s.classId || '',
    count: studentCountMap.get(s.classId) || 0,
  }));

  // Sort by student count ascending
  withCounts.sort((a, b) => a.count - b.count);

  console.log('Sessions with < 25 students:');
  const lowStudent = withCounts.filter(s => s.count < 25);
  for (const s of lowStudent.slice(0, 100)) {
    console.log(`  ${s.sessionName}: ${s.count} students (class: ${s.classId})`);
  }
  if (lowStudent.length > 100) {
    console.log(`  ... and ${lowStudent.length - 100} more`);
  }

  console.log(`\nTotal sessions with < 25 students: ${lowStudent.length}`);

  // Statistics
  const counts = withCounts.map(s => s.count);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const under10 = counts.filter(c => c < 10).length;
  const under25 = counts.filter(c => c < 25).length;
  const under40 = counts.filter(c => c < 40).length;

  console.log('\n--- Statistics ---');
  console.log(`Min students: ${min}`);
  console.log(`Max students: ${max}`);
  console.log(`Average students: ${avg.toFixed(1)}`);
  console.log(`Sessions with < 10 students: ${under10}`);
  console.log(`Sessions with < 25 students: ${under25}`);
  console.log(`Sessions with < 40 students: ${under40}`);

  // Save low student sessions to a file for the next script
  const lowSessions = withCounts.filter(s => s.count < 25);
  console.log('\nLow student sessions classIds for processing:');
  console.log(lowSessions.map(s => s.classId).join('\n'));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
