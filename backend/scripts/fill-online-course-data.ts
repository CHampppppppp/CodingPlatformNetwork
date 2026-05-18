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

const GENDERS = ['男', '女'];
const LEARNING_STYLES = ['独立学习', '和他人一起学习', '喜欢听讲', '动手实践'];
const PERSONALITIES = ['外向', '内向', '混合型'];
const GROUP_BEHAVIORS = ['挺身而出，畅所欲言', '保持安静，倾听意见', '积极参与，适度发言', '被动参与'];
const SATISFACTION_LEVELS = ['1', '2', '3', '4', '5'];
const HELP_SOURCES = ['1', '2', '3', '4', '5'];

interface SessionInfo {
  schoolName: string;
  gradeNumber: number;
  className: string;
}

function parseSessionName(name: string): SessionInfo | null {
  const match = name.match(/^(.+?)\s*(\d+)年级在线学习$/);
  if (!match) return null;
  return { schoolName: match[1].trim(), gradeNumber: parseInt(match[2]), className: '1' };
}

async function findOrCreateSchool(name: string): Promise<string> {
  let school = await prisma.school.findFirst({ where: { name } });
  if (school) return school.id;
  school = await prisma.school.create({ data: { name } });
  console.log(`  Created school: ${name}`);
  return school.id;
}

async function findOrCreateGrade(schoolId: string, gradeNumber: number): Promise<string> {
  let grade = await prisma.grade.findFirst({
    where: { schoolId, gradeName: gradeNumber },
  });
  if (grade) return grade.id;
  grade = await prisma.grade.create({ data: { schoolId, gradeName: gradeNumber } });
  console.log(`  Created grade: ${gradeNumber}`);
  return grade.id;
}

async function findOrCreateClass(gradeId: string, className: string, teacherId?: string): Promise<string> {
  let sc = await prisma.schoolClass.findFirst({ where: { gradeId, className } });
  if (sc) {
    // 如果已有班级但没有teacher，关联一下
    if (!sc.teacherId && teacherId) {
      await prisma.schoolClass.update({ where: { id: sc.id }, data: { teacherId } });
    }
    return sc.id;
  }
  sc = await prisma.schoolClass.create({ data: { gradeId, className, teacherId: teacherId || null } });
  console.log(`  Created class: ${className}`);
  return sc.id;
}

async function getOrCreateTeacher(
  scenarioId: string,
  schoolId: string,
  gradeId: string,
  classId: string,
  info: SessionInfo,
): Promise<{ id: string }> {
  // 先查这个class是否已有teacher profile
  const existingProfile = await prisma.teacherProfile.findFirst({ where: { classId } });
  if (existingProfile) {
    console.log(`  Reusing teacher: ${existingProfile.nodeId}`);
    return { id: existingProfile.nodeId };
  }

  // 创建教师节点
  const teacherNode = await prisma.graphNode.create({
    data: {
      scenarioId,
      nodeType: 'Teacher',
      displayName: `${info.schoolName}${info.gradeNumber}年级教师`,
      schoolId,
      gradeId,
      classId,
    },
  });

  // 创建教师画像
  await prisma.teacherProfile.create({
    data: {
      nodeId: teacherNode.id,
      subject: '信息科技',
      teachingGrade: info.gradeNumber,
      schoolId,
      gradeId,
      classId,
    },
  });

  console.log(`  Created teacher: ${teacherNode.id}`);
  return teacherNode;
}

function randomPick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

async function main() {
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'ONLINE_COURSE' },
  });
  if (!scenario) { console.log('ONLINE_COURSE not found'); return; }

  const knowledgeNodes = await prisma.graphNode.findMany({
    where: { scenarioId: scenario.id, nodeType: 'Knowledge' },
  });
  console.log(`Knowledge nodes available: ${knowledgeNodes.length}`);

  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
  });

  let totalStudents = 0;
  let totalStudy = 0;
  let totalSeekHelp = 0;
  let totalTeacherEval = 0;

  for (const session of sessions) {
    // 跳过已经有学生的session（除了xujie-school特殊处理）
    const existingStudents = await prisma.graphNode.count({
      where: { scenarioId: scenario.id, nodeType: 'Student', classId: session.classId },
    });
    if (existingStudents > 0 && session.sessionName !== 'xujie-school 99年级在线学习') {
      continue;
    }

    const info = parseSessionName(session.sessionName);
    if (!info) {
      console.log(`\n⚠ SKIP: ${session.sessionName} (cannot parse name)`);
      continue;
    }

    console.log(`\n=== Processing: ${session.sessionName} ===`);

    // 1. 创建/获取学校结构
    const schoolId = await findOrCreateSchool(info.schoolName);
    const gradeId = await findOrCreateGrade(schoolId, info.gradeNumber);
    const classId = await findOrCreateClass(gradeId, info.className);

    // 2. 获取或创建教师
    const teacher = await getOrCreateTeacher(scenario.id, schoolId, gradeId, classId, info);

    // 更新班级的teacherId
    await prisma.schoolClass.update({
      where: { id: classId },
      data: { teacherId: teacher.id },
    });

    // 3. 更新session的classId
    await prisma.interactionSession.update({
      where: { id: session.id },
      data: { classId },
    });

    // 4. 如果已有学生（xujie-school情况），跳过创建新学生
    let studentIds: string[] = [];
    if (existingStudents > 0) {
      const existing = await prisma.graphNode.findMany({
        where: { scenarioId: scenario.id, nodeType: 'Student', classId },
      });
      studentIds = existing.map(s => s.id);
      console.log(`  Reusing ${studentIds.length} existing students`);
    } else {
      // 生成学生（每班25-50人）
      const rngCount = seededRandom(session.id + '_student_count');
      const studentCount = Math.floor(rngCount() * 26) + 25;
      console.log(`  Generating ${studentCount} students...`);

      const studentProfileData: any[] = [];

      for (let i = 0; i < studentCount; i++) {
        const rng = seededRandom(`${session.id}_student_${i}`);
        const studentNode = await prisma.graphNode.create({
          data: {
            scenarioId: scenario.id,
            nodeType: 'Student',
            displayName: `${info.schoolName}${info.gradeNumber}年级学生${i + 1}`,
            schoolId,
            gradeId,
            classId,
          },
        });
        studentIds.push(studentNode.id);

        studentProfileData.push({
          nodeId: studentNode.id,
          externalUserId: `${session.id}_stu_${i}`,
          gender: randomPick(GENDERS, rng),
          learningStyle: randomPick(LEARNING_STYLES, rng),
          personality: randomPick(PERSONALITIES, rng),
          groupBehavior: randomPick(GROUP_BEHAVIORS, rng),
          aiContentSatisfaction: randomPick(SATISFACTION_LEVELS, rng),
          resourceHelpfulness: randomPick(SATISFACTION_LEVELS, rng),
          posterSatisfaction: randomPick(SATISFACTION_LEVELS, rng),
          teachingPreference: randomPick(SATISFACTION_LEVELS, rng),
          helpSource: randomPick(HELP_SOURCES, rng),
        });
      }

      await prisma.studentProfile.createMany({ data: studentProfileData });
      console.log(`  Created ${studentProfileData.length} student profiles`);
    }

    // 5. 删除旧交互，生成新交互
    await prisma.interaction.deleteMany({ where: { sessionId: session.id } });

    // 选择3-6个活跃知识点
    const rngK = seededRandom(session.id + '_select_knowledge');
    const keepCount = Math.floor(rngK() * 4) + 3;
    const shuffledK = [...knowledgeNodes].sort(() => rngK() - 0.5);
    const activeKnowledgeIds = shuffledK.slice(0, Math.min(keepCount, knowledgeNodes.length)).map(k => k.id);

    const studyInteractions: any[] = [];
    const seekHelpInteractions: any[] = [];
    const teacherEvalInteractions: any[] = [];

    for (const studentId of studentIds) {
      const rng = seededRandom(studentId + session.id);

      // STUDY
      if (rng() < 0.85) {
        const studyCount = Math.floor(rng() * 4) + 1;
        const shuffled = [...activeKnowledgeIds].sort(() => rng() - 0.5);
        const selected = shuffled.slice(0, Math.min(studyCount, activeKnowledgeIds.length));
        for (const kId of selected) {
          studyInteractions.push({
            sessionId: session.id,
            sourceNodeId: studentId,
            targetNodeId: kId,
            interactionType: 'PLATFORM',
            actionType: 'STUDY',
            strength: Math.floor(rng() * 3) + 1,
          });
        }
      }

      // SEEK_HELP
      const rngHelp = seededRandom(studentId + '_seek_help_' + session.id);
      if (rngHelp() < 0.3) {
        seekHelpInteractions.push({
          sessionId: session.id,
          sourceNodeId: studentId,
          targetNodeId: teacher.id,
          interactionType: 'PLATFORM',
          actionType: 'SEEK_HELP',
          strength: Math.floor(rngHelp() * 2) + 1,
        });
      }

      // TEACHER_EVAL
      const rngEval = seededRandom(studentId + '_teacher_eval_' + session.id);
      if (rngEval() < 0.5) {
        teacherEvalInteractions.push({
          sessionId: session.id,
          sourceNodeId: teacher.id,
          targetNodeId: studentId,
          interactionType: 'PLATFORM',
          actionType: 'TEACHER_EVALUATION',
          strength: Math.floor(rngEval() * 3) + 2,
        });
      }
    }

    const allInteractions = [...studyInteractions, ...seekHelpInteractions, ...teacherEvalInteractions];
    if (allInteractions.length > 0) {
      await prisma.interaction.createMany({ data: allInteractions });
    }

    totalStudents += studentIds.length;
    totalStudy += studyInteractions.length;
    totalSeekHelp += seekHelpInteractions.length;
    totalTeacherEval += teacherEvalInteractions.length;

    console.log(`  Students=${studentIds.length}, ActiveK=${activeKnowledgeIds.length}`);
    console.log(`  STUDY=${studyInteractions.length}, SEEK_HELP=${seekHelpInteractions.length}, TEACHER_EVAL=${teacherEvalInteractions.length}`);
  }

  console.log('\n===== Summary =====');
  console.log(`Processed students: ${totalStudents}`);
  console.log(`STUDY: ${totalStudy}, SEEK_HELP: ${totalSeekHelp}, TEACHER_EVAL: ${totalTeacherEval}`);
  console.log(`Total new interactions: ${totalStudy + totalSeekHelp + totalTeacherEval}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
