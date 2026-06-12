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

  // Get all classes
  const classes = await prisma.class.findMany({});
  
  // Get existing sessions for ONLINE_COURSE
  const existingSessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
  });
  const classesWithSession = new Set(existingSessions.map(s => s.classId));

  // Find classes without session
  const classesWithoutSession = classes.filter(c => !classesWithSession.has(c.id));

  console.log(`Total classes: ${classes.length}`);
  console.log(`Classes with ONLINE_COURSE session: ${classes.length - classesWithoutSession.length}`);
  console.log(`Classes WITHOUT session: ${classesWithoutSession.length}\n`);

  // Group by school and grade
  const schoolGradeMap = new Map<string, { school: string; grade: string; className: string; classId: string }[]>();
  
  for (const cls of classesWithoutSession) {
    const grade = await prisma.grade.findUnique({
      where: { id: cls.gradeId },
      include: { school: true },
    });
    if (!grade) continue;

    const key = `${grade.school.name} - ${grade.gradeName}年级`;
    if (!schoolGradeMap.has(key)) {
      schoolGradeMap.set(key, []);
    }
    schoolGradeMap.get(key)!.push({
      school: grade.school.name,
      grade: `${grade.gradeName}`,
      className: cls.className,
      classId: cls.id,
    });
  }

  // Sort by school name
  const sortedKeys = Array.from(schoolGradeMap.keys()).sort();
  
  for (const key of sortedKeys) {
    const items = schoolGradeMap.get(key)!;
    console.log(`${key}:`);
    for (const item of items.sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }))) {
      console.log(`  - ${item.className} (${item.classId})`);
    }
    console.log('');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
