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
  const classes = await prisma.schoolClass.findMany({});
  console.log(`Total classes: ${classes.length}`);

  // Get existing sessions for ONLINE_COURSE
  const existingSessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
    select: { classId: true },
  });
  const classesWithSession = new Set(existingSessions.map(s => s.classId));

  // Find classes without session
  const classesWithoutSession = classes.filter(c => !classesWithSession.has(c.id));
  console.log(`Classes without session: ${classesWithoutSession.length}`);

  // Get all grades and schools in one query to avoid N+1
  const gradeIds = [...new Set(classesWithoutSession.map(c => c.gradeId))];
  const grades = await prisma.grade.findMany({
    where: { id: { in: gradeIds } },
    include: { school: true },
  });
  const gradeMap = new Map(grades.map(g => [g.id, g]));

  // Batch create sessions (100 at a time)
  const batchSize = 100;
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < classesWithoutSession.length; i += batchSize) {
    const batch = classesWithoutSession.slice(i, i + batchSize);
    
    const sessionsToCreate = batch.map(cls => {
      const grade = gradeMap.get(cls.gradeId);
      if (!grade) {
        skipped++;
        return null;
      }
      return {
        scenarioId: scenario.id,
        schoolId: grade.schoolId,
        gradeId: cls.gradeId,
        classId: cls.id,
        sessionName: `${grade.school.name} ${cls.className}在线学习`,
        occurredAt: new Date(),
      };
    }).filter(s => s !== null);

    try {
      await prisma.interactionSession.createMany({
        data: sessionsToCreate as any[],
        skipDuplicates: true,
      });
      created += sessionsToCreate.length;
      console.log(`Progress: ${Math.min(i + batchSize, classesWithoutSession.length)}/${classesWithoutSession.length} (created: ${created}, skipped: ${skipped})`);
    } catch (error: any) {
      console.error(`Error on batch ${i}:`, error.message);
      // Fall back to individual inserts
      for (const sessionData of sessionsToCreate!) {
        try {
          await prisma.interactionSession.create({
            data: sessionData as any,
          });
          created++;
        } catch (e: any) {
          if (e.code !== 'P2002') { // Ignore duplicate
            console.error(`Error creating session:`, e.message);
          }
        }
      }
      console.log(`Progress: ${Math.min(i + batchSize, classesWithoutSession.length)}/${classesWithoutSession.length} (created: ${created})`);
    }
  }

  console.log(`\nDone! Created ${created} sessions, skipped ${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
