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
  console.log('Schools:', schools.map(s => s.name));

  for (const school of schools) {
    const grades10 = await prisma.grade.findMany({
      where: { schoolId: school.id, gradeName: 10 },
    });
    console.log(`\n${school.name} - Grade 10:`, grades10.length);

    for (const grade of grades10) {
      const classes = await prisma.schoolClass.findMany({
        where: { gradeId: grade.id },
      });
      console.log(`Classes in grade 10:`, classes.map(c => c.className));

      for (const cls of classes) {
        const sessions = await prisma.interactionSession.findMany({
          where: { classId: cls.id, scenarioId: scenario.id },
        });
        console.log(`  Class ${cls.className}: ${sessions.length} sessions`);
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
