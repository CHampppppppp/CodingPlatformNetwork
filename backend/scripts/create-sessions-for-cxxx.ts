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

  // cxxx school Grade 6 class IDs that need sessions
  const classIds = [
    'cmp54arq6004d4wl3vzdkmnk8', // class 2
    'cmp54arqu004h4wl362iop7ym', // class 3
    'cmp54arqb004e4wl3ksskt08w', // class 4
    'cmp54arqx004i4wl3eu7x9zm1', // class 6
    'cmp54arqm004g4wl3qo1qm1s1', // class 7
    'cmp54arqi004f4wl3apmo6nca', // class 8
    'cmp54arp5004b4wl3glyrlksd', // class 9
  ];

  const classes = await prisma.schoolClass.findMany({
    where: { id: { in: classIds } },
    include: { grade: true },
  });

  console.log('Creating sessions for classes:', classes.map(c => c.className));

  const existingSessions = await prisma.interactionSession.findMany({
    where: { classId: { in: classIds } },
  });
  console.log('Existing sessions:', existingSessions.length);

  const existingClassIds = new Set(existingSessions.map(s => s.classId));
  const classesNeedingSessions = classes.filter(c => !existingClassIds.has(c.id));
  console.log('Classes needing sessions:', classesNeedingSessions.map(c => c.className));

  for (const cls of classesNeedingSessions) {
    const session = await prisma.interactionSession.create({
      data: {
        scenarioId: scenario.id,
        schoolId: cls.grade.schoolId,
        gradeId: cls.gradeId,
        classId: cls.id,
        sessionName: `cxxx ${cls.className}在线学习`,
        occurredAt: new Date(),
      },
    });
    console.log(`Created session "${session.sessionName}" for class ${cls.className}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
