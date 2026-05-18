import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return () => { hash = ((hash << 5) - hash + 1) | 0; return ((hash >>> 0) % 1000) / 1000; };
}

async function main() {
  const scenario = await prisma.learningScenario.findUnique({ where: { code: 'ONLINE_COURSE' } });
  if (!scenario) return;

  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
  });

  for (const session of sessions) {
    const students = await prisma.graphNode.findMany({
      where: { scenarioId: scenario.id, nodeType: 'Student', classId: session.classId },
    });
    if (students.length === 0) continue;

    const teachers = await prisma.graphNode.findMany({
      where: { scenarioId: scenario.id, nodeType: 'Teacher', classId: session.classId },
    });
    if (teachers.length > 0) continue; // 已有老师

    // 通过class查school/grade信息
    const sc = await prisma.schoolClass.findUnique({ where: { id: session.classId! } });
    if (!sc) continue;

    const grade = await prisma.grade.findUnique({ where: { id: sc.gradeId } });
    if (!grade) continue;

    const school = await prisma.school.findUnique({ where: { id: grade.schoolId } });
    if (!school) continue;

    console.log(`\nFixing: ${session.sessionName}`);
    console.log(`  School=${school.name}, Grade=${grade.gradeName}, Class=${sc.className}, Students=${students.length}`);

    // 创建教师
    const teacherNode = await prisma.graphNode.create({
      data: {
        scenarioId: scenario.id,
        nodeType: 'Teacher',
        displayName: `${school.name}${grade.gradeName}年级教师`,
        schoolId: school.id,
        gradeId: grade.id,
        classId: sc.id,
      },
    });

    await prisma.teacherProfile.create({
      data: {
        nodeId: teacherNode.id,
        subject: '信息科技',
        teachingGrade: grade.gradeName as number,
        schoolId: school.id,
        gradeId: grade.id,
        classId: sc.id,
      },
    });

    // 更新班级teacherId
    await prisma.schoolClass.update({
      where: { id: sc.id },
      data: { teacherId: teacherNode.id },
    });

    // 重新生成交互（加上SEEK_HELP和TEACHER_EVAL）
    await prisma.interaction.deleteMany({ where: { sessionId: session.id } });

    const knowledgeNodes = await prisma.graphNode.findMany({
      where: { scenarioId: scenario.id, nodeType: 'Knowledge' },
    });

    const rngK = seededRandom(session.id + '_select_knowledge');
    const keepCount = Math.floor(rngK() * 4) + 3;
    const shuffledK = [...knowledgeNodes].sort(() => rngK() - 0.5);
    const activeKnowledgeIds = shuffledK.slice(0, Math.min(keepCount, knowledgeNodes.length)).map(k => k.id);

    let studyTotal = 0, helpTotal = 0, evalTotal = 0;
    const interactions: any[] = [];

    for (const student of students) {
      const rng = seededRandom(student.id + session.id);

      if (rng() < 0.85) {
        const studyCount = Math.floor(rng() * 4) + 1;
        const shuffled = [...activeKnowledgeIds].sort(() => rng() - 0.5);
        const selected = shuffled.slice(0, Math.min(studyCount, activeKnowledgeIds.length));
        for (const kId of selected) {
          interactions.push({
            sessionId: session.id, sourceNodeId: student.id, targetNodeId: kId,
            interactionType: 'PLATFORM', actionType: 'STUDY', strength: Math.floor(rng() * 3) + 1,
          });
          studyTotal++;
        }
      }

      const rngH = seededRandom(student.id + '_seek_help_' + session.id);
      if (rngH() < 0.3) {
        interactions.push({
          sessionId: session.id, sourceNodeId: student.id, targetNodeId: teacherNode.id,
          interactionType: 'PLATFORM', actionType: 'SEEK_HELP', strength: Math.floor(rngH() * 2) + 1,
        });
        helpTotal++;
      }

      const rngE = seededRandom(student.id + '_teacher_eval_' + session.id);
      if (rngE() < 0.5) {
        interactions.push({
          sessionId: session.id, sourceNodeId: teacherNode.id, targetNodeId: student.id,
          interactionType: 'PLATFORM', actionType: 'TEACHER_EVALUATION', strength: Math.floor(rngE() * 3) + 2,
        });
        evalTotal++;
      }
    }

    if (interactions.length > 0) {
      await prisma.interaction.createMany({ data: interactions });
    }

    console.log(`  STUDY=${studyTotal}, SEEK_HELP=${helpTotal}, TEACHER_EVAL=${evalTotal}, ActiveK=${activeKnowledgeIds.length}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
