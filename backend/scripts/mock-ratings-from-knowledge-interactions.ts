import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();
const prisma = new PrismaClient();

async function main() {
  const school = await prisma.school.findUnique({
    where: { name: '杭州市钱塘区前进小学' },
  });
  if (!school) throw new Error('前进小学不存在');

  const session = await prisma.interactionSession.findFirst({
    where: { schoolId: school.id },
  });
  if (!session) throw new Error('未找到交互会话');

  const students = await prisma.graphNode.findMany({
    where: { nodeType: 'Student', schoolId: school.id },
    select: { id: true, displayName: true },
  });
  const studentIds = students.map(s => s.id);

  const existingRates = await prisma.studentResourceRate.count({
    where: { studentId: { in: studentIds } },
  });
  if (existingRates > 0) {
    await prisma.studentResourceRate.deleteMany({
      where: { studentId: { in: studentIds } },
    });
    console.log('清除已有评分:', existingRates);
  }

  const skInteractions = await prisma.interaction.findMany({
    where: {
      sessionId: session.id,
      sourceNode: { nodeType: 'Student' },
      targetNode: { nodeType: 'Knowledge' },
    },
    select: { sourceNodeId: true, targetNodeId: true },
  });
  console.log('学生-知识点交互数:', skInteractions.length);

  const knowledgeIds = [...new Set(skInteractions.map(i => i.targetNodeId))];

  const relations = await prisma.resourceKnowledgeRelation.findMany({
    where: { knowledgeNodeId: { in: knowledgeIds } },
    select: { resourceId: true, knowledgeNodeId: true },
  });
  console.log('相关资源-知识点关联数:', relations.length);

  const knowledgeToResources = new Map<string, string[]>();
  for (const r of relations) {
    const list = knowledgeToResources.get(r.knowledgeNodeId) || [];
    list.push(r.resourceId);
    knowledgeToResources.set(r.knowledgeNodeId, list);
  }

  const usedKeys = new Set<string>();
  const ratings: any[] = [];
  for (const inter of skInteractions) {
    const resourceIds = knowledgeToResources.get(inter.targetNodeId) || [];
    for (const resourceId of resourceIds) {
      const key = `${inter.sourceNodeId}_${resourceId}`;
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);

      const rate = parseFloat((2 + Math.random() * 3).toFixed(2));
      ratings.push({
        studentId: inter.sourceNodeId,
        resourceId,
        rate,
      });
    }
  }

  const batchSize = 50;
  for (let i = 0; i < ratings.length; i += batchSize) {
    await prisma.studentResourceRate.createMany({
      data: ratings.slice(i, i + batchSize),
    });
  }

  console.log('成功写入评分:', ratings.length);
  console.log('  - 学生数:', students.length);
  console.log('  - 参与评分学生数:', new Set(ratings.map(r => r.studentId)).size);
  console.log('  - 涉及资源数:', new Set(ratings.map(r => r.resourceId)).size);
  console.log('  - 人均评分:', (ratings.length / new Set(ratings.map(r => r.studentId)).size).toFixed(1));

  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
