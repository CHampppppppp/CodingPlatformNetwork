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
  if (!scenario) return;

  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
  });

  console.log('=== ONLINE_COURSE Sessions (全部) ===\n');

  for (const s of sessions) {
    const students = await prisma.graphNode.findMany({
      where: { scenarioId: scenario.id, nodeType: 'Student', classId: s.classId },
    });
    const teachers = await prisma.graphNode.findMany({
      where: { scenarioId: scenario.id, nodeType: 'Teacher', classId: s.classId },
    });
    const interactions = await prisma.interaction.findMany({
      where: { sessionId: s.id },
    });
    const byType: Record<string, number> = {};
    for (const i of interactions) byType[i.actionType] = (byType[i.actionType] || 0) + 1;

    // 查学校信息
    let schoolInfo = 'no classId';
    if (s.classId) {
      const sc = await prisma.schoolClass.findUnique({ where: { id: s.classId } });
      if (sc) {
        const grade = await prisma.grade.findUnique({ where: { id: sc.gradeId } });
        const school = grade ? await prisma.school.findUnique({ where: { id: grade.schoolId } }) : null;
        schoolInfo = `${school?.name || '?'} / ${grade?.gradeName || '?'} / ${sc.className}`;
      }
    }

    const status = students.length > 0 ? '✅' : '❌';
    console.log(`${status} ${s.sessionName}`);
    console.log(`   classId=${s.classId}, school=${schoolInfo}`);
    console.log(`   students=${students.length}, teachers=${teachers.length}, interactions=${interactions.length}`);
    console.log(`   types: ${JSON.stringify(byType)}`);
    console.log();
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
