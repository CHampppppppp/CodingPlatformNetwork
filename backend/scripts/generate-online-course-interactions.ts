#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) { throw new Error('DATABASE_URL is not set'); }

let prisma: PrismaClient;
if (databaseUrl.startsWith('sqlserver://')) {
  prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl) });
} else {
  prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });
}

const SCENARIO_CODE = 'ONLINE_COURSE';

// 目标班级配置
const TARGET_CLASSES = [
  { schoolName: 'tzsynzx', className: '6' },  // 1 teacher, 47 students
  { schoolName: 'tzzx', className: '1' },      // 1 teacher, 46 students
  { schoolName: 'wczx', className: '705' },  // 1 teacher, 46 students
  { schoolName: 'hczx', className: '710' },   // 1 teacher, 43 students
  { schoolName: 'yhzx', className: '5' },      // 1 teacher, 35 students
];

async function main() {
  console.log('=== 为 ONLINE_COURSE 生成师生和生生交互数据 ===\n');

  const scenario = await prisma.learningScenario.findUnique({
    where: { code: SCENARIO_CODE },
  });
  if (!scenario) {
    console.error(`场景 ${SCENARIO_CODE} 不存在`);
    return;
  }

  // 获取或创建 session
  let session = await prisma.interactionSession.findFirst({
    where: { scenarioId: scenario.id },
  });

  if (!session) {
    // 需要 schoolId, gradeId, classId, occurredAt
    const firstSchool = await prisma.school.findFirst();
    const firstGrade = await prisma.grade.findFirst();
    session = await prisma.interactionSession.create({
      data: {
        scenarioId: scenario.id,
        schoolId: firstSchool?.id || 'unknown',
        gradeId: firstGrade?.id || 'unknown',
        classId: undefined,
        sessionName: 'ONLINE_COURSE 师生交互生成',
        occurredAt: new Date(),
      },
    });
    console.log(`创建新 session: ${session.id}`);
  } else {
    console.log(`使用已有 session: ${session.id}`);
  }

  for (const { schoolName, className } of TARGET_CLASSES) {
    console.log(`\n--- 处理 ${schoolName} 班 ${className} ---`);

    const school = await prisma.school.findUnique({ where: { name: schoolName } });
    if (!school) {
      console.log(`  学校 ${schoolName} 不存在，跳过`);
      continue;
    }

    // 通过 grade 找 class
    const grade = await prisma.grade.findFirst({
      where: { schoolId: school.id },
    });
    if (!grade) {
      console.log(`  学校 ${schoolName} 没有 grade，跳过`);
      continue;
    }

    const classRecord = await prisma.class.findFirst({
      where: { gradeId: grade.id, className },
    });
    if (!classRecord) {
      console.log(`  班级 ${schoolName}-${className} 不存在，跳过`);
      continue;
    }

    // 获取该班级的所有学生和教师
    const students = await prisma.graphNode.findMany({
      where: {
        scenarioId: scenario.id,
        nodeType: 'Student',
        schoolId: school.id,
        classId: classRecord.id,
      },
    });

    const teachers = await prisma.graphNode.findMany({
      where: {
        scenarioId: scenario.id,
        nodeType: 'Teacher',
        schoolId: school.id,
      },
    });

    console.log(`  学生: ${students.length}, 教师: ${teachers.length}`);

    if (students.length === 0 || teachers.length === 0) {
      console.log(`  数据不足，跳过`);
      continue;
    }

    const teacher = teachers[0];
    const interactions: any[] = [];
    const now = new Date();

    // 1. 生成师生交互: TEACHER_EVALUATION (教师评价学生)
    //    每个学生 5 条，分布在不同日期
    for (const student of students) {
      for (let i = 0; i < 5; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i * 3);
        interactions.push({
          id: `gen_te_${student.id}_${i}_${Date.now()}`,
          interactionType: 'PLATFORM',
          actionType: 'TEACHER_EVALUATION',
          durationSec: Math.floor(Math.random() * 300) + 60,
          sessionId: session.id,
          sourceNodeId: teacher.id,
          targetNodeId: student.id,
          strength: Math.random() * 3 + 2,
          createdAt: date,
        });
      }
    }

    // 2. 生成师生交互: HELP_SEEKING (学生向教师求助)
    //    每个学生 3 条
    for (const student of students) {
      for (let i = 0; i < 3; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i * 5);
        interactions.push({
          id: `gen_hs_${student.id}_${i}_${Date.now()}`,
          interactionType: 'PLATFORM',
          actionType: 'HELP_SEEKING',
          durationSec: Math.floor(Math.random() * 180) + 30,
          sessionId: session.id,
          sourceNodeId: student.id,
          targetNodeId: teacher.id,
          strength: Math.random() * 2 + 1,
          createdAt: date,
        });
      }
    }

    // 3. 生成生生交互: COMMENT (学生对学生的评论)
    //    随机选 20 对学生，每对 2 条评论
    const commentPairs: [string, string][] = [];
    for (let i = 0; i < Math.min(20, students.length); i++) {
      const a = students[Math.floor(Math.random() * students.length)];
      const b = students[Math.floor(Math.random() * students.length)];
      if (a.id !== b.id) {
        commentPairs.push([a.id, b.id]);
      }
    }

    for (const [sourceId, targetId] of commentPairs) {
      for (let i = 0; i < 2; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - Math.floor(Math.random() * 20));
        interactions.push({
          id: `gen_cm_${sourceId.slice(-8)}_${targetId.slice(-8)}_${i}_${Date.now()}`,
          interactionType: 'PLATFORM',
          actionType: 'COMMENT',
          durationSec: Math.floor(Math.random() * 120) + 20,
          sessionId: session.id,
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          strength: Math.random() * 2 + 0.5,
          createdAt: date,
        });
      }
    }

    // 4. 生成生生交互: LIKE (学生对学生的点赞)
    //    随机选 30 对学生，每对 1-3 条点赞
    const likePairs: [string, string][] = [];
    for (let i = 0; i < Math.min(30, students.length); i++) {
      const a = students[Math.floor(Math.random() * students.length)];
      const b = students[Math.floor(Math.random() * students.length)];
      if (a.id !== b.id) {
        likePairs.push([a.id, b.id]);
      }
    }

    for (const [sourceId, targetId] of likePairs) {
      const count = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < count; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - Math.floor(Math.random() * 20));
        interactions.push({
          id: `gen_lk_${sourceId.slice(-8)}_${targetId.slice(-8)}_${i}_${Date.now()}`,
          interactionType: 'PLATFORM',
          actionType: 'LIKE',
          durationSec: 0,
          sessionId: session.id,
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          strength: 1,
          createdAt: date,
        });
      }
    }

    console.log(`  生成 ${interactions.length} 条交互数据`);

    // 批量插入，忽略冲突
    for (const data of interactions) {
      try {
        await prisma.interaction.create({ data });
      } catch (e: any) {
        if (e.code !== 'P2002') { // Unique constraint ignore
          // skip duplicates silently
        }
      }
    }

    console.log(`  完成`);
  }

  // 统计
  console.log('\n=== 生成完成 ===');
  const counts = await prisma.interaction.groupBy({
    by: ['actionType'],
    where: {
      sessionId: session.id,
    },
    _count: true,
  });
  for (const c of counts) {
    console.log(`  ${c.actionType}: ${c._count}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);