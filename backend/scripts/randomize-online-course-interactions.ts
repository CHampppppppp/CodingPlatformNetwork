import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return () => {
    hash = ((hash << 5) - hash + 1) | 0;
    return ((hash >>> 0) % 1000) / 1000;
  };
}

async function main() {
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'ONLINE_COURSE' },
  });
  if (!scenario) {
    console.log('ONLINE_COURSE scenario not found');
    return;
  }
  console.log('ONLINE_COURSE scenario:', scenario.id);

  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
  });
  console.log(`Total sessions: ${sessions.length}`);

  let totalStudyInteractions = 0;
  let totalSeekHelp = 0;
  let totalTeacherEval = 0;

  for (const session of sessions) {
    // 删除该 session 的所有现有交互
    await prisma.interaction.deleteMany({
      where: { sessionId: session.id },
    });

    const students = await prisma.graphNode.findMany({
      where: {
        scenarioId: scenario.id,
        nodeType: 'Student',
        classId: session.classId,
      },
    });

    const teachers = await prisma.graphNode.findMany({
      where: {
        scenarioId: scenario.id,
        nodeType: 'Teacher',
        classId: session.classId,
      },
    });

    const knowledgeNodes = await prisma.graphNode.findMany({
      where: {
        scenarioId: scenario.id,
        nodeType: 'Knowledge',
      },
    });

    if (students.length === 0 || knowledgeNodes.length === 0) {
      console.log(`Session ${session.sessionName}: no students or knowledge nodes`);
      continue;
    }

    const teacher = teachers[0];
    const studyInteractions: any[] = [];
    const seekHelpInteractions: any[] = [];
    const teacherEvalInteractions: any[] = [];

    // 先随机选择 3-6 个知识点作为"活跃知识点"
    const rngSelect = seededRandom(session.id + 'select_knowledge');
    const keepCount = Math.floor(rngSelect() * 4) + 3; // 3-6
    const shuffledKnowledge = [...knowledgeNodes].sort(() => rngSelect() - 0.5);
    const activeKnowledgeIds = new Set(
      shuffledKnowledge.slice(0, Math.min(keepCount, knowledgeNodes.length)).map(k => k.id)
    );
    const activeKnowledgeList = [...activeKnowledgeIds];

    // STUDy: 每个学生有 85% 概率学习，从活跃知识点中选择 1-4 个
    for (const student of students) {
      const rng = seededRandom(student.id + session.id);
      if (rng() < 0.85) { // 85% 学习
        const studyCount = Math.floor(rng() * 4) + 1; // 1-4
        const shuffled = activeKnowledgeList.sort(() => rng() - 0.5);
        const selected = shuffled.slice(0, Math.min(studyCount, activeKnowledgeList.length));
        for (const knowledgeId of selected) {
          studyInteractions.push({
            sessionId: session.id,
            sourceNodeId: student.id,
            targetNodeId: knowledgeId,
            interactionType: 'PLATFORM',
            actionType: 'STUDY',
            strength: Math.floor(rng() * 3) + 1,
          });
        }
      }
    }

    // SEEK_HELP: 每个学生有 30% 概率向老师寻求帮助
    if (teacher) {
      for (const student of students) {
        const rng = seededRandom(student.id + 'seek_help' + session.id);
        if (rng() < 0.3) {
          seekHelpInteractions.push({
            sessionId: session.id,
            sourceNodeId: student.id,
            targetNodeId: teacher.id,
            interactionType: 'PLATFORM',
            actionType: 'SEEK_HELP',
            strength: Math.floor(rng() * 2) + 1,
          });
        }
      }

      // TEACHER_EVALUATION: 每个学生有 50% 概率被老师评价
      for (const student of students) {
        const rng = seededRandom(student.id + 'teacher_eval' + session.id);
        if (rng() < 0.5) {
          teacherEvalInteractions.push({
            sessionId: session.id,
            sourceNodeId: teacher.id,
            targetNodeId: student.id,
            interactionType: 'PLATFORM',
            actionType: 'TEACHER_EVALUATION',
            strength: Math.floor(rng() * 3) + 2,
          });
        }
      }
    }

    const allInteractions = [
      ...studyInteractions,
      ...seekHelpInteractions,
      ...teacherEvalInteractions,
    ];

    if (allInteractions.length > 0) {
      await prisma.interaction.createMany({
        data: allInteractions,
      });
    }

    totalStudyInteractions += studyInteractions.length;
    totalSeekHelp += seekHelpInteractions.length;
    totalTeacherEval += teacherEvalInteractions.length;

    console.log(
      `Session "${session.sessionName}": ` +
        `STUDY=${studyInteractions.length}, ` +
        `SEEK_HELP=${seekHelpInteractions.length}, ` +
        `TEACHER_EVAL=${teacherEvalInteractions.length}`
    );
  }

  console.log('\n=== Summary ===');
  console.log(`Total STUDY interactions: ${totalStudyInteractions}`);
  console.log(`Total SEEK_HELP interactions: ${totalSeekHelp}`);
  console.log(`Total TEACHER_EVALUATION interactions: ${totalTeacherEval}`);
  console.log(`Total new interactions: ${totalStudyInteractions + totalSeekHelp + totalTeacherEval}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());