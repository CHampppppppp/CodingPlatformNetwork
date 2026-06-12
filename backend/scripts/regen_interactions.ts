import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const CLASS_ID = 'cmp54arp9004c4wl3e18bs7i5';
const SESSION_ID = 'cmp55jjf8068ulgl3kp5xje3c';

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
  const students = await prisma.graphNode.findMany({
    where: { classId: CLASS_ID, nodeType: 'Student' },
    select: { id: true }
  });
  
  const teacher = await prisma.graphNode.findFirst({
    where: { classId: CLASS_ID, nodeType: 'Teacher' },
    select: { id: true }
  });
  
  const knowledgeNodes = await prisma.graphNode.findMany({
    where: { nodeType: 'Knowledge' },
    select: { id: true }
  });

  console.log(`Students: ${students.length}, Teacher: ${teacher?.id}, Knowledge: ${knowledgeNodes.length}`);

  // 选择活跃知识点
  const rngK = seededRandom(SESSION_ID + '_select_knowledge');
  const keepCount = Math.floor(rngK() * 4) + 3;
  const shuffledK = [...knowledgeNodes].sort(() => rngK() - 0.5);
  const activeKnowledgeIds = shuffledK.slice(0, Math.min(keepCount, knowledgeNodes.length)).map(k => k.id);
  console.log(`Active knowledge: ${activeKnowledgeIds.length}`);

  const studyInteractions: any[] = [];
  for (const student of students) {
    const rng = seededRandom(student.id + SESSION_ID);
    if (rng() < 0.85) {
      const studyCount = Math.floor(rng() * 4) + 1;
      const shuffled = [...activeKnowledgeIds].sort(() => rng() - 0.5);
      const selected = shuffled.slice(0, Math.min(studyCount, activeKnowledgeIds.length));
      for (const kId of selected) {
        studyInteractions.push({
          sessionId: SESSION_ID,
          sourceNodeId: student.id,
          targetNodeId: kId,
          interactionType: 'PLATFORM',
          actionType: 'STUDY',
          strength: Math.floor(rng() * 3) + 1,
        });
      }
    }
  }

  const seekHelpInteractions: any[] = [];
  if (teacher) {
    for (const student of students) {
      const rngHelp = seededRandom(student.id + '_seek_help_' + SESSION_ID);
      if (rngHelp() < 0.3) {
        seekHelpInteractions.push({
          sessionId: SESSION_ID,
          sourceNodeId: student.id,
          targetNodeId: teacher.id,
          interactionType: 'PLATFORM',
          actionType: 'SEEK_HELP',
          strength: Math.floor(rngHelp() * 2) + 1,
        });
      }
    }
  }

  const teacherEvalInteractions: any[] = [];
  if (teacher) {
    for (const student of students) {
      const rngEval = seededRandom(student.id + '_teacher_eval_' + SESSION_ID);
      if (rngEval() < 0.5) {
        teacherEvalInteractions.push({
          sessionId: SESSION_ID,
          sourceNodeId: teacher.id,
          targetNodeId: student.id,
          interactionType: 'PLATFORM',
          actionType: 'TEACHER_EVALUATION',
          strength: Math.floor(rngEval() * 3) + 2,
        });
      }
    }
  }

  if (studyInteractions.length > 0) {
    await prisma.interaction.createMany({ data: studyInteractions });
  }
  if (seekHelpInteractions.length > 0) {
    await prisma.interaction.createMany({ data: seekHelpInteractions });
  }
  if (teacherEvalInteractions.length > 0) {
    await prisma.interaction.createMany({ data: teacherEvalInteractions });
  }

  console.log(`Created: STUDY=${studyInteractions.length}, SEEK_HELP=${seekHelpInteractions.length}, TEACHER_EVAL=${teacherEvalInteractions.length}`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
