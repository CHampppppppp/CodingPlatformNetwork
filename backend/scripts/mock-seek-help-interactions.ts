#!/usr/bin/env ts-node
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

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

const QUESTION_TOPICS = [
  '如何优化这段代码的性能？',
  '这个数学公式推导不太理解',
  '项目报告的格式要求是什么？',
  '这个实验步骤可以简化吗？',
  '如何更好地组织小组讨论？',
  '这个知识点的实际应用场景是什么？',
  '作业 deadline 可以申请延期吗？',
  '推荐一些相关的学习资源',
  '这个设计思路是否正确？',
  '如何改进我的演讲技巧？',
  '这部分内容考试会考吗？',
  '可以和您单独讨论一下这个问题吗？',
  '这个 bug 怎么解决？',
  '如何更好地理解这个概念？',
  '我的方案有什么可以改进的地方？',
];

const QUESTION_METHODS = ['在线提问', '课后询问', '课间交流', '邮件咨询'];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

interface QuestionRecord {
  id: string;
  studentNodeId: string;
  studentName: string;
  teacherNodeId: string;
  teacherName: string;
  classId: string;
  className: string;
  topic: string;
  method: string;
  createdAt: string;
}

async function main() {
  console.log('🚀 开始生成 HELP_SEEKING 师生提问 mock 数据...\n');

  const classes = await prisma.$queryRaw`
    SELECT DISTINCT
      c.id as classId,
      c.className,
      g.gradeName,
      s.name as schoolName
    FROM classes_test c
    JOIN grades_test g ON c.gradeId = g.id
    JOIN schools_test s ON g.schoolId = s.id
    WHERE EXISTS (
      SELECT 1 FROM graph_nodes_test gn
      WHERE gn.classId = c.id AND gn.nodeType = 'Student'
    )
    AND EXISTS (
      SELECT 1 FROM graph_nodes_test gn
      WHERE gn.classId = c.id AND gn.nodeType = 'Teacher'
    )
  `;

  const classList = classes as any[];
  console.log(`📊 找到 ${classList.length} 个有学生+教师的班级`);

  const allStudents = await prisma.graphNode.findMany({
    where: { nodeType: 'Student', classId: { not: null } },
    select: { id: true, displayName: true, classId: true },
  });

  const allTeachers = await prisma.graphNode.findMany({
    where: { nodeType: 'Teacher', classId: { not: null } },
    select: { id: true, displayName: true, classId: true },
  });

  const allSessions = await prisma.interactionSession.findMany({
    where: { classId: { not: null } },
    select: { id: true, classId: true },
  });

  const studentsByClass = new Map<string, typeof allStudents>();
  for (const s of allStudents) {
    const list = studentsByClass.get(s.classId!) || [];
    list.push(s);
    studentsByClass.set(s.classId!, list);
  }

  const teachersByClass = new Map<string, typeof allTeachers>();
  for (const t of allTeachers) {
    const list = teachersByClass.get(t.classId!) || [];
    list.push(t);
    teachersByClass.set(t.classId!, list);
  }

  const sessionByClass = new Map<string, string>();
  for (const sess of allSessions) {
    if (!sessionByClass.has(sess.classId!)) {
      sessionByClass.set(sess.classId!, sess.id);
    }
  }

  const allQuestionRecords: QuestionRecord[] = [];
  const allInteractions: any[] = [];

  for (const cls of classList) {
    const students = studentsByClass.get(cls.classId) || [];
    const teachers = teachersByClass.get(cls.classId) || [];
    const sessionId = sessionByClass.get(cls.classId);

    if (students.length === 0 || teachers.length === 0 || !sessionId) continue;

    const participationRate = randomInt(50, 70) / 100;
    const selectedCount = Math.max(1, Math.floor(students.length * participationRate));
    const selectedStudents = shuffleArray(students).slice(0, selectedCount);

    console.log(`  📚 班级 ${cls.gradeName}${cls.className}班: ${students.length}名学生, ${selectedCount}名提问 (${Math.round(participationRate * 100)}%)`);

    for (const student of selectedStudents) {
      const teacher = randomItem(teachers);
      const questionCount = randomInt(1, 3);

      for (let q = 0; q < questionCount; q++) {
        const recordId = `q_${Date.now()}_${randomInt(1000, 9999)}_${q}`;
        const createdAt = new Date(Date.now() - randomInt(0, 30 * 24 * 60 * 60 * 1000));

        allQuestionRecords.push({
          id: recordId,
          studentNodeId: student.id,
          studentName: student.displayName,
          teacherNodeId: teacher.id,
          teacherName: teacher.displayName,
          classId: cls.classId,
          className: `${cls.gradeName}${cls.className}班`,
          topic: randomItem(QUESTION_TOPICS),
          method: randomItem(QUESTION_METHODS),
          createdAt: createdAt.toISOString(),
        });

        allInteractions.push({
          sessionId,
          sourceNodeId: student.id,
          targetNodeId: teacher.id,
          interactionType: 'PLATFORM',
          actionType: 'HELP_SEEKING',
          strength: new Prisma.Decimal(randomInt(10, 30) / 10),
          createdAt,
        });
      }
    }
  }

  const dataDir = path.resolve(__dirname, '../datas/script_filterd');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const questionTablePath = path.join(dataDir, 'student-teacher-questions.json');
  fs.writeFileSync(
    questionTablePath,
    JSON.stringify({
      meta: {
        generatedAt: new Date().toISOString(),
        totalClasses: classList.length,
        totalQuestions: allQuestionRecords.length,
        description: '学生向教师提问的 mock 数据表',
      },
      records: allQuestionRecords,
    }, null, 2),
    'utf-8',
  );
  console.log(`\n📝 提问表已保存: ${questionTablePath} (${allQuestionRecords.length} 条记录)`);

  if (allInteractions.length === 0) {
    console.log('⚠️ 没有需要插入的 interactions');
    await prisma.$disconnect();
    return;
  }

  console.log(`\n💾 准备插入 ${allInteractions.length} 条 HELP_SEEKING interactions...`);

  const BATCH_SIZE = 5000;
  let totalInserted = 0;
  let totalSkipped = 0;

  for (let i = 0; i < allInteractions.length; i += BATCH_SIZE) {
    const batch = allInteractions.slice(i, i + BATCH_SIZE);
    try {
      const result = await prisma.interaction.createMany({
        data: batch,
        skipDuplicates: true,
      });
      totalInserted += result.count;
      totalSkipped += batch.length - result.count;
      console.log(`   批次 ${Math.floor(i / BATCH_SIZE) + 1}: 插入 ${result.count}/${batch.length}`);
    } catch (error: any) {
      console.error(`   批次失败: ${error.message}`);
    }
  }

  console.log(`\n💾 interactions 插入统计:`);
  console.log(`   成功插入: ${totalInserted}`);
  console.log(`   跳过重复: ${totalSkipped}`);

  const helpSeekingCount = await prisma.interaction.count({
    where: { actionType: 'HELP_SEEKING' },
  });
  console.log(`\n📈 数据库中 HELP_SEEKING 交互总数: ${helpSeekingCount}`);

  const classStats = await prisma.$queryRaw`
    SELECT 
      c.className,
      COUNT(*) as count
    FROM interactions_test i
    JOIN graph_nodes_test s ON i.sourceNodeId = s.id
    JOIN classes_test c ON s.classId = c.id
    WHERE i.actionType = 'HELP_SEEKING'
    GROUP BY c.className
    ORDER BY count DESC
    LIMIT 20
  `;

  console.log('\n📊 TOP 20 班级 HELP_SEEKING 统计:');
  for (const stat of classStats as any[]) {
    console.log(`   ${stat.className}班: ${stat.count} 次提问`);
  }

  await prisma.$disconnect();
  console.log('\n🎉 全部完成!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
