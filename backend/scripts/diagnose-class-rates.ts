#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
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
  prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl) });
} else {
  prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });
}

async function main() {
  console.log('🔍 诊断当前班级的学生评分分布...\n');

  // 1. 查看所有班级
  const classes = await prisma.schoolClass.findMany({
    include: { grade: { include: { school: true } } },
  });
  console.log('班级列表:');
  classes.forEach((c) => {
    console.log(`  ${c.id}: ${c.grade.school.name} ${c.grade.gradeName}年级${c.className}班`);
  });

  if (classes.length === 0) {
    console.log('❌ 没有班级数据');
    return;
  }

  const targetClass = classes[0];
  console.log(`\n📌 分析目标班级: ${targetClass.grade.school.name} ${targetClass.grade.gradeName}年级${targetClass.className}班 (${targetClass.id})`);

  // 2. 该班级的学生
  const classStudents = await prisma.graphNode.findMany({
    where: {
      nodeType: 'Student',
      classId: targetClass.id,
    },
    select: { id: true, displayName: true },
  });
  console.log(`  班级学生数: ${classStudents.length}`);

  // 3. 该班级学生总共的评分
  const classStudentIds = classStudents.map((s) => s.id);
  const classRates = await prisma.studentResourceRate.findMany({
    where: { studentId: { in: classStudentIds } },
    select: { studentId: true, resourceId: true, rate: true },
  });
  console.log(`  班级学生总评分记录: ${classRates.length}`);

  // 4. 该班级关联的资源（通过知识节点）
  // 先找到该班级学生交互过的知识节点
  const knowledgeInteractions = await prisma.interaction.findMany({
    where: {
      OR: [
        { sourceNodeId: { in: classStudentIds } },
        { targetNodeId: { in: classStudentIds } },
      ],
    },
    include: {
      sourceNode: { select: { id: true, nodeType: true } },
      targetNode: { select: { id: true, nodeType: true } },
    },
  });

  const relatedKnowledgeIds = new Set<string>();
  for (const i of knowledgeInteractions) {
    if (i.sourceNode.nodeType === 'Knowledge') relatedKnowledgeIds.add(i.sourceNode.id);
    if (i.targetNode.nodeType === 'Knowledge') relatedKnowledgeIds.add(i.targetNode.id);
  }

  console.log(`  班级学生交互过的知识节点数: ${relatedKnowledgeIds.size}`);

  const resourceRels = await prisma.resourceKnowledgeRelation.findMany({
    where: { knowledgeNodeId: { in: Array.from(relatedKnowledgeIds) } },
    select: { resourceId: true, knowledgeNodeId: true },
  });
  console.log(`  这些知识节点关联的资源数: ${resourceRels.length}`);

  const relatedResourceIds = [...new Set(resourceRels.map((r) => r.resourceId))];
  console.log(`  不重复资源数: ${relatedResourceIds.length}`);

  // 5. 这些资源的评分中，有多少来自本班学生
  const allRatesForRelatedResources = await prisma.studentResourceRate.findMany({
    where: { resourceId: { in: relatedResourceIds } },
    select: { studentId: true, resourceId: true },
  });

  const classStudentIdSet = new Set(classStudentIds);
  const classRatesForRelated = allRatesForRelatedResources.filter((r) => classStudentIdSet.has(r.studentId));
  console.log(`\n  相关资源的总评分记录: ${allRatesForRelatedResources.length}`);
  console.log(`  其中来自本班学生的: ${classRatesForRelated.length}`);
  console.log(`  来自外班学生的: ${allRatesForRelatedResources.length - classRatesForRelated.length}`);

  // 6. 按资源统计
  const resourceRateMap = new Map<string, { total: number; class: number }>();
  for (const r of allRatesForRelatedResources) {
    const stat = resourceRateMap.get(r.resourceId) || { total: 0, class: 0 };
    stat.total++;
    if (classStudentIdSet.has(r.studentId)) stat.class++;
    resourceRateMap.set(r.resourceId, stat);
  }

  const topResources = Array.from(resourceRateMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);

  console.log('\n  评分最多的相关资源Top10:');
  for (const [resId, stat] of topResources) {
    const resource = await prisma.resource.findUnique({ where: { id: resId }, select: { title: true } });
    console.log(`    ${resource?.title || resId}: 总${stat.total}条评分, 本班${stat.class}条`);
  }

  // 7. 检查没有评分的本班学生
  const studentsWithRates = new Set(classRates.map((r) => r.studentId));
  const studentsWithoutRates = classStudents.filter((s) => !studentsWithRates.has(s.id));
  console.log(`\n  有评分的本班学生: ${studentsWithRates.size}/${classStudents.length}`);
  console.log(`  无评分的本班学生: ${studentsWithoutRates.length}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('\n❌ 失败:', error);
  process.exit(1);
});
