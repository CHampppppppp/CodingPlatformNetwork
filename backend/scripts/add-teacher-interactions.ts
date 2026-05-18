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

  // 获取所有session及其师生交互统计
  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
    include: {
      _count: {
        select: {
          interactions: {
            where: { actionType: { in: ['TEACHER_EVALUATION', 'SEEK_HELP'] } }
          }
        }
      }
    }
  });

  const sessionsWithoutTeacher = sessions.filter(s => s._count.interactions === 0);
  console.log(`Total sessions: ${sessions.length}`);
  console.log(`Sessions without teacher interaction: ${sessionsWithoutTeacher.length}`);

  // 获取所有老师（按school分组）
  const teachers = await prisma.graphNode.findMany({
    where: { scenarioId: scenario.id, nodeType: 'Teacher' },
    select: { id: true, schoolId: true, classId: true, displayName: true },
  });

  const teacherBySchool = new Map<string, typeof teachers>();
  for (const t of teachers) {
    if (!teacherBySchool.has(t.schoolId)) {
      teacherBySchool.set(t.schoolId, []);
    }
    teacherBySchool.get(t.schoolId)!.push(t);
  }
  console.log(`Total teachers: ${teachers.length}`);

  // 获取所有学生（按class分组）
  const students = await prisma.graphNode.findMany({
    where: { scenarioId: scenario.id, nodeType: 'Student' },
    select: { id: true, classId: true, schoolId: true },
  });

  const studentByClass = new Map<string, typeof students>();
  for (const s of students) {
    if (!studentByClass.has(s.classId)) {
      studentByClass.set(s.classId, []);
    }
    studentByClass.get(s.classId)!.push(s);
  }
  console.log(`Total students: ${students.length}`);

  // 获取已存在的师生交互（通过session关联scenario）
  const existingInteractions = await prisma.interaction.findMany({
    where: {
      interactionType: 'SOCIAL',
      actionType: { in: ['TEACHER_EVALUATION', 'SEEK_HELP'] },
      session: { scenarioId: scenario.id },
    },
    select: { sourceNodeId: true, targetNodeId: true, actionType: true, sessionId: true },
  });

  const existingKeys = new Set(
    existingInteractions.map(i => `${i.sessionId}-${i.sourceNodeId}-${i.targetNodeId}-${i.actionType}`)
  );
  console.log(`Existing teacher interactions: ${existingInteractions.length}`);

  const interactions: {
    sessionId: string;
    sourceNodeId: string;
    targetNodeId: string;
    interactionType: string;
    actionType: string;
    strength: number;
  }[] = [];

  let skipNoTeacher = 0;
  let skipNoStudent = 0;
  let processed = 0;

  for (const session of sessionsWithoutTeacher) {
    // 找老师（优先同班级，否则同学校）
    const classTeachers = teachers.filter(t => t.classId === session.classId);
    const schoolTeachers = teacherBySchool.get(session.schoolId) || [];
    const availableTeachers = classTeachers.length > 0 ? classTeachers : schoolTeachers;

    // 找学生
    const classStudents = studentByClass.get(session.classId) || [];

    if (availableTeachers.length === 0) {
      skipNoTeacher++;
      continue;
    }
    if (classStudents.length === 0) {
      skipNoStudent++;
      continue;
    }

    const teacher = availableTeachers[0];

    // 生成TEACHER_EVALUATION (老师->学生)
    for (const student of classStudents) {
      const rng = seededRandom(teacher.id + student.id + session.id + 'eval');
      if (rng() < 0.6) {
        const key = `${session.id}-${teacher.id}-${student.id}-TEACHER_EVALUATION`;
        if (!existingKeys.has(key) && !interactions.some(i => i.sessionId === session.id && i.sourceNodeId === teacher.id && i.targetNodeId === student.id && i.actionType === 'TEACHER_EVALUATION')) {
          interactions.push({
            sessionId: session.id,
            sourceNodeId: teacher.id,
            targetNodeId: student.id,
            interactionType: 'SOCIAL',
            actionType: 'TEACHER_EVALUATION',
            strength: Math.floor(rng() * 3) + 1,
          });
        }
      }
    }

    // 生成SEEK_HELP (学生->老师)
    for (const student of classStudents) {
      const rng = seededRandom(student.id + teacher.id + session.id + 'seek');
      if (rng() < 0.4) {
        const key = `${session.id}-${student.id}-${teacher.id}-SEEK_HELP`;
        if (!existingKeys.has(key) && !interactions.some(i => i.sessionId === session.id && i.sourceNodeId === student.id && i.targetNodeId === teacher.id && i.actionType === 'SEEK_HELP')) {
          interactions.push({
            sessionId: session.id,
            sourceNodeId: student.id,
            targetNodeId: teacher.id,
            interactionType: 'SOCIAL',
            actionType: 'SEEK_HELP',
            strength: Math.floor(rng() * 2) + 1,
          });
        }
      }
    }

    processed++;
    if (processed % 1000 === 0) {
      console.log(`Processed ${processed}/${sessionsWithoutTeacher.length - skipNoTeacher - skipNoStudent} sessions, generated ${interactions.length} interactions`);
    }
  }

  console.log(`\nGenerated ${interactions.length} interactions`);
  console.log(`Skipped (no teacher): ${skipNoTeacher}`);
  console.log(`Skipped (no student): ${skipNoStudent}`);

  // 批量插入
  if (interactions.length > 0) {
    console.log('Inserting interactions...');
    const batchSize = 1000;
    for (let i = 0; i < interactions.length; i += batchSize) {
      const batch = interactions.slice(i, i + batchSize);
      await prisma.interaction.createMany({ data: batch, skipDuplicates: true });
      console.log(`Inserted ${Math.min(i + batchSize, interactions.length)}/${interactions.length}`);
    }
  }

  // 最终统计
  const finalCount = await prisma.interaction.count({
    where: { actionType: { in: ['TEACHER_EVALUATION', 'SEEK_HELP'] } }
  });
  console.log(`\nFinal teacher interaction count: ${finalCount}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());