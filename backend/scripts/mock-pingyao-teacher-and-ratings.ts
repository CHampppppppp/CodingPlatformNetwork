#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

let prisma: PrismaClient;
if (databaseUrl.startsWith('sqlserver://')) {
  const adapter = new PrismaMssql(databaseUrl);
  prisma = new PrismaClient({ adapter });
} else {
  const adapter = new PrismaMariaDb(databaseUrl);
  prisma = new PrismaClient({ adapter });
}

const SCHOOL_NAME = '杭州市瓶窑镇第二小学';
const SCENARIO_CODE = 'COLLABORATIVE_LEARNING';

const MOCK_TEACHERS = [
  {
    name: '陈煜昱',
    subject: '信息技术',
    teachingGrade: 4,
    teachingClass: '四年级1班',
  },
];

async function mockResourceRatings(schoolId: string, scenarioId: string) {
  console.log('\n=== 开始生成资源评分数据 ===');

  const students = await prisma.graphNode.findMany({
    where: {
      nodeType: 'Student',
      schoolId,
      scenarioId,
    },
    select: { id: true, displayName: true },
  });

  if (students.length === 0) {
    console.log('该学校下没有学生节点，跳过评分生成');
    return 0;
  }
  console.log(`找到 ${students.length} 名学生`);

  const knowledgeNodes = await prisma.graphNode.findMany({
    where: {
      nodeType: 'Knowledge',
      scenarioId,
    },
    select: { id: true, displayName: true },
  });

  if (knowledgeNodes.length === 0) {
    console.log('该场景下没有知识点节点，跳过评分生成');
    return 0;
  }
  console.log(`找到 ${knowledgeNodes.length} 个知识点`);

  let resources = await prisma.resource.findMany({
    take: 20,
    select: { id: true, title: true },
  });

  if (resources.length === 0) {
    const mockResources = [
      { title: 'Word基础操作视频教程', resourceType: 'VIDEO' },
      { title: '插入图片技巧图文指南', resourceType: 'ARTICLE' },
      { title: '页面背景设置互动练习', resourceType: 'PRACTICE' },
      { title: '文本格式化小游戏', resourceType: 'GAME' },
      { title: '艺术字设计案例集', resourceType: 'DOCUMENT' },
      { title: 'AI辅助创作入门', resourceType: 'VIDEO' },
      { title: '海报美化技巧手册', resourceType: 'DOCUMENT' },
    ];

    for (const r of mockResources) {
      const created = await prisma.resource.create({
        data: {
          title: r.title,
          resourceType: r.resourceType,
          description: `${r.title} - 推荐学习资源`,
        },
      });
      resources.push(created);
    }
    console.log(`创建了 ${mockResources.length} 个推荐资源`);
  } else {
    console.log(`使用现有 ${resources.length} 个资源`);
  }

  const existingRelations = await prisma.resourceKnowledgeRelation.findMany({
    where: {
      knowledgeNodeId: { in: knowledgeNodes.map((k) => k.id) },
    },
    select: { resourceId: true, knowledgeNodeId: true },
  });

  if (existingRelations.length === 0) {
    const relationData = [];
    for (let i = 0; i < resources.length; i++) {
      const knowledge = knowledgeNodes[i % knowledgeNodes.length];
      relationData.push({
        resourceId: resources[i].id,
        knowledgeNodeId: knowledge.id,
      });
    }
    await prisma.resourceKnowledgeRelation.createMany({
      data: relationData,
      skipDuplicates: true,
    });
    console.log(`创建了 ${relationData.length} 个资源-知识点关联`);
  } else {
    console.log(`已有 ${existingRelations.length} 个资源-知识点关联`);
  }

  const existingRates = await prisma.studentResourceRate.findMany({
    where: {
      studentId: { in: students.map((s) => s.id) },
      resourceId: { in: resources.map((r) => r.id) },
    },
    select: { studentId: true, resourceId: true },
  });
  const existingRateKeys = new Set(existingRates.map((r) => `${r.studentId}_${r.resourceId}`));

  const rateData = [];
  for (const student of students) {
    const resourceCount = 2 + Math.floor(Math.random() * 3);
    const shuffledResources = [...resources].sort(() => 0.5 - Math.random());
    const selectedResources = shuffledResources.slice(0, resourceCount);

    for (const resource of selectedResources) {
      const key = `${student.id}_${resource.id}`;
      if (existingRateKeys.has(key)) {
        continue;
      }
      const rate = parseFloat((2.5 + Math.random() * 2.5).toFixed(2));
      rateData.push({
        studentId: student.id,
        resourceId: resource.id,
        rate,
      });
      existingRateKeys.add(key);
    }
  }

  if (rateData.length === 0) {
    console.log('所有评分已存在，跳过插入');
    return 0;
  }

  const batchSize = 50;
  for (let i = 0; i < rateData.length; i += batchSize) {
    const batch = rateData.slice(i, i + batchSize);
    await prisma.studentResourceRate.createMany({
      data: batch,
      skipDuplicates: true,
    });
  }

  console.log(`成功插入 ${rateData.length} 条学生资源评分`);
  return rateData.length;
}

async function main() {
  console.log('=== 开始为瓶窑二小创建教师数据 ===');

  const school = await prisma.school.findUnique({
    where: { name: SCHOOL_NAME },
  });

  if (!school) {
    throw new Error(`学校 "${SCHOOL_NAME}" 不存在`);
  }
  console.log(`找到学校: ${school.name}`);

  const scenario = await prisma.learningScenario.findUnique({
    where: { code: SCENARIO_CODE },
  });

  if (!scenario) {
    throw new Error(`场景 "${SCENARIO_CODE}" 不存在`);
  }
  console.log(`找到场景: ${scenario.nameZh}`);

  const grade = await prisma.grade.findFirst({
    where: { schoolId: school.id },
  });

  if (!grade) {
    throw new Error(`学校 "${SCHOOL_NAME}" 下没有找到年级`);
  }

  const schoolClass = await prisma.schoolClass.findFirst({
    where: { gradeId: grade.id },
  });

  if (!schoolClass) {
    throw new Error(`年级 "${grade.gradeName}" 下没有找到班级`);
  }

  console.log(`年级: ${grade.gradeName}, 班级: ${schoolClass.className}`);

  const createdTeachers: string[] = [];

  for (const teacherData of MOCK_TEACHERS) {
    const existingTeacher = await prisma.graphNode.findFirst({
      where: {
        nodeType: 'Teacher',
        displayName: teacherData.name,
        schoolId: school.id,
        scenarioId: scenario.id,
      },
    });

    if (existingTeacher) {
      console.log(`教师 "${teacherData.name}" 已存在，跳过创建`);
      continue;
    }

    const teacherNode = await prisma.graphNode.create({
      data: {
        nodeType: 'Teacher',
        displayName: teacherData.name,
        scenarioId: scenario.id,
        schoolId: school.id,
        gradeId: grade.id,
        classId: schoolClass.id,
        teacherProfile: {
          create: {
            subject: teacherData.subject,
            teachingGrade: teacherData.teachingGrade,
            teachingClass: teacherData.teachingClass,
          },
        },
      },
      include: {
        teacherProfile: true,
      },
    });

    createdTeachers.push(teacherData.name);
    console.log(`创建教师: ${teacherData.name} (${teacherData.subject})`);
  }

  console.log(`\n=== 教师数据完成 ===`);
  console.log(`成功创建 ${createdTeachers.length} 名教师`);

  const allTeachers = await prisma.graphNode.findMany({
    where: {
      nodeType: 'Teacher',
      schoolId: school.id,
    },
    include: {
      teacherProfile: true,
    },
  });

  console.log(`瓶窑二小现有教师总数: ${allTeachers.length}`);
  allTeachers.forEach((t) => {
    console.log(`  - ${t.displayName} (${t.teacherProfile?.subject || '未设置科目'})`);
  });

  await mockResourceRatings(school.id, scenario.id);

  console.log('\n=== 全部完成 ===');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('错误:', err);
  process.exit(1);
});
