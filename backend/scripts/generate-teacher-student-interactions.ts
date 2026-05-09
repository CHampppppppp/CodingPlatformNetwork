#!/usr/bin/env ts-node
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set in ' + envPath);
}

let prisma: PrismaClient;
if (databaseUrl.startsWith('sqlserver://')) {
  const adapter = new PrismaMssql(databaseUrl);
  prisma = new PrismaClient({ adapter });
} else {
  const adapter = new PrismaMariaDb(databaseUrl);
  prisma = new PrismaClient({ adapter });
}

const BATCH_SIZE = 2000;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const TEACHER_COMMENTS = [
  '作品完成度较高，表现优秀',
  '思路清晰，逻辑严谨',
  '创意十足，值得鼓励',
  '完成度很高，继续努力',
  '设计很有创意，色彩搭配很好',
  '代码写得很规范，技术实现扎实',
  '界面很美观，交互设计不错',
  '功能很完整，这个想法很有新意',
  '视觉效果很棒，逻辑很清晰',
  '很用心的作品，继续加油',
  '整体结构清晰，表达准确',
  '细节处理得很好，向你学习',
  '画面很和谐，细节处理到位',
  '字体很好看，整体设计不错',
  '完成度不错，可以进一步优化',
];

const WORK_NAMES = [
  '数学思维导图', '英语手抄报', '科学实验报告', '语文阅读笔记',
  '美术创意作品', '编程小项目', '历史时间轴', '地理地图绘制',
  '生物观察日记', '物理小制作', '化学元素卡片', '古诗词配画',
  '读后感', '数学解题思路', '英语口语展示', '书法作品',
  '剪纸艺术', '手工模型', 'AI协作海报', '小组项目报告',
];

async function main() {
  console.log('🚀 开始生成师生交互mock数据...\n');

  const classesWithTS = await prisma.$queryRaw`
    SELECT 
      s.schoolId,
      s.gradeId,
      s.classId,
      COUNT(*) as interactionCount
    FROM interactions_test i
    JOIN graph_nodes_test s ON i.sourceNodeId = s.id
    JOIN graph_nodes_test t ON i.targetNodeId = t.id
    WHERE (
      (s.nodeType = 'Teacher' AND t.nodeType = 'Student') OR
      (s.nodeType = 'Student' AND t.nodeType = 'Teacher')
    )
    AND s.classId IS NOT NULL
    GROUP BY s.schoolId, s.gradeId, s.classId
  `;

  console.log(`需要处理的班级数: ${(classesWithTS as any[]).length}`);

  let totalCreatedWorks = 0;
  let totalCreatedInteractions = 0;
  let totalSkipped = 0;

  for (const cls of classesWithTS as any[]) {
    const targetCount = Math.ceil(Number(cls.interactionCount) * 0.2);
    if (targetCount === 0) continue;

    const students = await prisma.graphNode.findMany({
      where: {
        nodeType: 'Student',
        schoolId: cls.schoolId,
        gradeId: cls.gradeId,
        classId: cls.classId
      },
      select: { id: true, displayName: true, scenarioId: true }
    });

    const teachers = await prisma.graphNode.findMany({
      where: {
        nodeType: 'Teacher',
        schoolId: cls.schoolId,
        gradeId: cls.gradeId,
        classId: cls.classId
      },
      select: { id: true, displayName: true }
    });

    if (students.length === 0 || teachers.length === 0) continue;

    const session = await prisma.interactionSession.findFirst({
      where: {
        schoolId: cls.schoolId,
        gradeId: cls.gradeId,
        classId: cls.classId
      },
      orderBy: { occurredAt: 'desc' },
      select: { id: true }
    });

    if (!session) continue;

    const existingWorks = await prisma.studentWork.findMany({
      where: {
        studentNodeId: { in: students.map((s: any) => s.id) }
      },
      select: { id: true, studentNodeId: true }
    });

    const studentWithWorks = new Set(existingWorks.map((w: any) => w.studentNodeId));

    const worksToCreate: any[] = [];
    const interactionsToCreate: any[] = [];

    for (let i = 0; i < targetCount; i++) {
      const student = randomItem(students);
      const teacher = randomItem(teachers);

      let workId: string;
      let workExists = false;

      if (studentWithWorks.has(student.id) && Math.random() < 0.7) {
        const existingWork = existingWorks.find((w: any) => w.studentNodeId === student.id);
        if (existingWork) {
          workId = existingWork.id;
          workExists = true;
        } else {
          workId = `sw_mock_${Date.now()}_${i}_${randomInt(1000, 9999)}`;
        }
      } else {
        workId = `sw_mock_${Date.now()}_${i}_${randomInt(1000, 9999)}`;
      }

      if (!workExists) {
        worksToCreate.push({
          id: workId,
          studentNodeId: student.id,
          sessionId: session.id,
          workName: randomItem(WORK_NAMES),
          teacherId: teacher.id,
          teacherScore: new Prisma.Decimal(randomInt(75, 100) / 10),
          teacherComment: randomItem(TEACHER_COMMENTS),
          likeCount: 0,
          commentCount: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        studentWithWorks.add(student.id);
        existingWorks.push({ id: workId, studentNodeId: student.id });
      }

      interactionsToCreate.push({
        sessionId: session.id,
        sourceNodeId: teacher.id,
        targetNodeId: student.id,
        interactionType: 'PLATFORM',
        actionType: 'TEACHER_EVALUATION',
        strength: new Prisma.Decimal(randomInt(2, 4))
      });
    }

    if (worksToCreate.length > 0) {
      try {
        const result = await prisma.studentWork.createMany({
          data: worksToCreate,
          skipDuplicates: true
        });
        totalCreatedWorks += result.count;
      } catch (error: any) {
        console.error(`创建作品失败: ${error.message}`);
      }
    }

    if (interactionsToCreate.length > 0) {
      try {
        const result = await prisma.interaction.createMany({
          data: interactionsToCreate,
          skipDuplicates: true
        });
        totalCreatedInteractions += result.count;
        totalSkipped += interactionsToCreate.length - result.count;
      } catch (error: any) {
        console.error(`创建交互失败: ${error.message}`);
      }
    }
  }

  console.log('\n📊 统计结果:');
  console.log(`  创建作品数: ${totalCreatedWorks}`);
  console.log(`  创建交互数: ${totalCreatedInteractions}`);
  console.log(`  跳过重复: ${totalSkipped}`);

  const finalTSCount = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM interactions_test i
    JOIN graph_nodes_test s ON i.sourceNodeId = s.id
    JOIN graph_nodes_test t ON i.targetNodeId = t.id
    WHERE (
      (s.nodeType = 'Teacher' AND t.nodeType = 'Student') OR
      (s.nodeType = 'Student' AND t.nodeType = 'Teacher')
    )
  `;
  console.log(`  师生交互总数(新): ${finalTSCount[0].count}`);

  await prisma.$disconnect();
  console.log('\n✅ 完成!');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
