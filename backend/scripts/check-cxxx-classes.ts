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

  // Find schools with name containing cxxx
  const schools = await prisma.school.findMany({
    where: { name: { contains: 'cxxx' } },
  });
  console.log('Schools matching cxxx:', schools.map(s => s.name));

  for (const school of schools) {
    // Find grades 6 in this school
    const grades6 = await prisma.grade.findMany({
      where: { schoolId: school.id, gradeName: 6 },
    });
    console.log(`\n${school.name} - Grade 6:`, grades6.length);

    for (const grade of grades6) {
      const classes = await prisma.class.findMany({
        where: { gradeId: grade.id },
      });
      console.log(`  Classes:`, classes.length);

      for (const cls of classes) {
        console.log(`\n  ${cls.className} (${cls.id}):`);
        const students = await prisma.graphNode.findMany({
          where: { classId: cls.id, nodeType: 'Student' },
        });
        console.log(`    Students: ${students.length}`);

        const sessions = await prisma.interactionSession.findMany({
          where: { classId: cls.id, scenarioId: scenario.id },
        });
        console.log(`    Sessions: ${sessions.length}`);

        for (const session of sessions) {
          const studentIds = students.map(s => s.id);
          const count = await prisma.interaction.count({
            where: {
              sessionId: session.id,
              interactionType: 'SOCIAL',
              sourceNodeId: { in: studentIds },
              targetNodeId: { in: studentIds },
            },
          });
          console.log(`      "${session.sessionName}": ${count} student interactions`);
        }
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
