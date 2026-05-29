import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '/Users/champ/Documents/CodingPlatformNetwork/backend/.env' });

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const CLASS_ID = 'cmp54arp9004c4wl3e18bs7i5';
const SCENARIO_ID = 'cmp55j2z60000lgl3z5bjieau'; // ONLINE_COURSE
const SESSION_ID = 'cmp55jjf8068ulgl3kp5xje3c';
const STUDENT_COUNT = 35;

const GENDERS = ['男', '女'];
const LEARNING_STYLES = ['独立学习', '和他人一起学习', '喜欢听讲', '动手实践'];
const PERSONALITIES = ['外向', '内向', '混合型'];
const GROUP_BEHAVIORS = ['挺身而出，畅所欲言', '保持安静，倾听意见', '积极参与，适度发言', '被动参与'];
const SATISFACTION_LEVELS = ['1', '2', '3', '4', '5'];

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

function randomPick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

async function main() {
  console.log(`Generating ${STUDENT_COUNT} students for class 1...`);

  const classInfo = await prisma.schoolClass.findUnique({
    where: { id: CLASS_ID },
    include: { grade: true }
  });
  
  const teacher = await prisma.graphNode.findFirst({
    where: { classId: CLASS_ID, nodeType: 'Teacher' }
  });
  
  const knowledgeNodes = (await prisma.graphNode.findMany({
    where: { scenarioId: SCENARIO_ID, nodeType: 'Knowledge' },
    select: { id: true }
  })).map(n => n.id);

  console.log(`Class: ${classInfo?.className}, Grade: ${classInfo?.grade?.gradeName}`);
  console.log(`Teacher: ${teacher?.id}`);
  console.log(`Knowledge nodes: ${knowledgeNodes.length}`);

  const studentIds: string[] = [];

  for (let i = 0; i < STUDENT_COUNT; i++) {
    const rng = seededRandom(`${SESSION_ID}_student_${i}`);
    const gender = randomPick(GENDERS, rng);
    const learningStyle = randomPick(LEARNING_STYLES, rng);
    const personality = randomPick(PERSONALITIES, rng);
    const groupBehavior = randomPick(GROUP_BEHAVIORS, rng);

    const studentNode = await prisma.graphNode.create({
      data: {
        scenarioId: SCENARIO_ID,
        nodeType: 'Student',
        displayName: `学生${String(i + 1).padStart(3, '0')}`,
        schoolId: classInfo?.grade?.schoolId,
        gradeId: classInfo?.gradeId,
        classId: CLASS_ID,
      },
    });
    studentIds.push(studentNode.id);

    await prisma.studentProfile.create({
      data: {
        nodeId: studentNode.id,
        externalUserId: `cxxx_6_1_${String(i + 1).padStart(3, '0')}`,
        gender,
        learningStyle,
        personality,
        groupBehavior,
        aiContentSatisfaction: randomPick(SATISFACTION_LEVELS, rng),
        resourceHelpfulness: randomPick(SATISFACTION_LEVELS, rng),
        posterSatisfaction: randomPick(SATISFACTION_LEVELS, rng),
        teachingPreference: randomPick(SATISFACTION_LEVELS, rng),
        helpSource: '3',
      },
    });
  }

  console.log(`Created ${studentIds.length} students`);

  // 生成学习交互
  const studyInteractions: any[] = [];
  const rngK = seededRandom(SESSION_ID + '_select_knowledge');
  const keepCount = Math.floor(rngK() * 4) + 3;
  const shuffledK = [...knowledgeNodes].sort(() => rngK() - 0.5);
  const activeKnowledgeIds = shuffledK.slice(0, Math.min(keepCount, knowledgeNodes.length));
  console.log(`Active knowledge: ${activeKnowledgeIds.length}`);

  for (const studentId of studentIds) {
    const rng = seededRandom(studentId + SESSION_ID);
    if (rng() < 0.85) {
      const studyCount = Math.floor(rng() * 4) + 1;
      const shuffled = [...activeKnowledgeIds].sort(() => rng() - 0.5);
      const selected = shuffled.slice(0, Math.min(studyCount, activeKnowledgeIds.length));
      for (const kId of selected) {
        studyInteractions.push({
          sessionId: SESSION_ID,
          sourceNodeId: studentId,
          targetNodeId: kId,
          interactionType: 'PLATFORM',
          actionType: 'STUDY',
          strength: Math.floor(rng() * 3) + 1,
        });
      }
    }
  }

  if (studyInteractions.length > 0) {
    await prisma.interaction.createMany({ data: studyInteractions });
  }

  // 生成求助交互
  const seekHelpInteractions: any[] = [];
  if (teacher) {
    for (const studentId of studentIds) {
      const rngHelp = seededRandom(studentId + '_seek_help_' + SESSION_ID);
      if (rngHelp() < 0.3) {
        seekHelpInteractions.push({
          sessionId: SESSION_ID,
          sourceNodeId: studentId,
          targetNodeId: teacher.id,
          interactionType: 'PLATFORM',
          actionType: 'SEEK_HELP',
          strength: Math.floor(rngHelp() * 2) + 1,
        });
      }
    }
    if (seekHelpInteractions.length > 0) {
      await prisma.interaction.createMany({ data: seekHelpInteractions });
    }
  }

  // 生成教师评价交互
  const teacherEvalInteractions: any[] = [];
  if (teacher) {
    for (const studentId of studentIds) {
      const rngEval = seededRandom(studentId + '_teacher_eval_' + SESSION_ID);
      if (rngEval() < 0.5) {
        teacherEvalInteractions.push({
          sessionId: SESSION_ID,
          sourceNodeId: teacher.id,
          targetNodeId: studentId,
          interactionType: 'PLATFORM',
          actionType: 'TEACHER_EVALUATION',
          strength: Math.floor(rngEval() * 3) + 2,
        });
      }
    }
    if (teacherEvalInteractions.length > 0) {
      await prisma.interaction.createMany({ data: teacherEvalInteractions });
    }
  }

  console.log(`Created interactions: STUDY=${studyInteractions.length}, SEEK_HELP=${seekHelpInteractions.length}, TEACHER_EVAL=${teacherEvalInteractions.length}`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
