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

  const schools = await prisma.school.findMany({
    where: { name: { contains: 'hnzx' } },
  });

  for (const school of schools) {
    const grades10 = await prisma.grade.findMany({
      where: { schoolId: school.id, gradeName: 10 },
    });

    for (const grade of grades10) {
      const classes = await prisma.class.findMany({
        where: { gradeId: grade.id },
      });

      // Filter out class 0 and classes that already have sessions
      const existingSessions = await prisma.interactionSession.findMany({
        where: { classId: { in: classes.map(c => c.id) }, scenarioId: scenario.id },
      });
      const existingClassIds = new Set(existingSessions.map(s => s.classId));

      const classesNeedingSessions = classes.filter(
        c => !existingClassIds.has(c.id) && c.className !== '0'
      );

      console.log(`Creating sessions for ${school.name} grade 10:`, classesNeedingSessions.map(c => c.className));

      for (const cls of classesNeedingSessions) {
        const session = await prisma.interactionSession.create({
          data: {
            scenarioId: scenario.id,
            schoolId: school.id,
            gradeId: grade.id,
            classId: cls.id,
            sessionName: `hnzx ${cls.className}在线学习`,
            occurredAt: new Date(),
          },
        });
        console.log(`Created: "${session.sessionName}"`);
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
