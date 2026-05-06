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

const BATCH_SIZE = 5000;
const UNRATED_PROBABILITY = 0.12;

function generateNormalRandom(mean: number, stdDev: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdDev + mean;
}

function generateRate(): number | null {
  if (Math.random() < UNRATED_PROBABILITY) {
    return null;
  }
  let rate = generateNormalRandom(3.2, 0.9);
  rate = Math.round(rate);
  rate = Math.max(1, Math.min(5, rate));
  return rate;
}

async function main() {
  console.log('开始重新分配知识点到场景...\n');

  const scenarios = await prisma.learningScenario.findMany({
    select: { id: true, code: true, nameZh: true },
  });

  const allKnowledge = await prisma.graphNode.findMany({
    where: { nodeType: 'Knowledge' },
    select: { id: true, displayName: true },
  });

  console.log(`场景数: ${scenarios.length}`);
  console.log(`知识点总数: ${allKnowledge.length}\n`);

  if (allKnowledge.length === 0) {
    console.log('无知识点数据');
    return;
  }

  const scenariosWithStudents = [];
  for (const scenario of scenarios) {
    const studentCount = await prisma.graphNode.count({
      where: { nodeType: 'Student', scenarioId: scenario.id },
    });
    if (studentCount > 0) {
      scenariosWithStudents.push({ ...scenario, studentCount });
    }
  }

  console.log(`有学生的场景: ${scenariosWithStudents.length} 个\n`);

  if (scenariosWithStudents.length === 0) {
    console.log('无学生数据');
    return;
  }

  console.log('步骤1: 删除现有学生-知识点关联和交互...');
  await prisma.interaction.deleteMany({
    where: { actionType: 'STUDY', interactionType: 'PLATFORM' },
  });
  await prisma.studentKnowledgeRelation.deleteMany({});
  console.log('  完成\n');

  console.log('步骤2: 分配知识点到场景...');
  const scenarioKnowledgeMap = new Map<string, typeof allKnowledge>();
  let usedKnowledge = new Set<string>();

  for (const scenario of scenariosWithStudents) {
    const knowledgeCount = Math.min(
      Math.floor(Math.random() * 4) + 3,
      allKnowledge.length
    );

    const available = allKnowledge.filter((k) => !usedKnowledge.has(k.id));
    if (available.length < knowledgeCount) {
      usedKnowledge.clear();
    }

    const shuffled = [...allKnowledge.filter((k) => !usedKnowledge.has(k.id))]
      .sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, knowledgeCount);

    for (const k of selected) {
      usedKnowledge.add(k.id);
    }

    scenarioKnowledgeMap.set(scenario.id, selected);
    console.log(`  ${scenario.nameZh}: ${selected.length} 个知识点`);
  }

  console.log('\n步骤3: 更新知识点scenarioId...');
  for (const [scenarioId, knowledgeList] of scenarioKnowledgeMap) {
    for (const knowledge of knowledgeList) {
      await prisma.graphNode.update({
        where: { id: knowledge.id },
        data: { scenarioId },
      });
    }
  }
  console.log('  完成\n');

  console.log('步骤4: 清理资源关联...');
  await prisma.resourceKnowledgeRelation.deleteMany({});
  await prisma.studentResourceRate.deleteMany({});
  console.log('  完成\n');

  console.log('步骤5: 创建学生-知识点关联和资源评分...');
  let totalRelations = 0;
  let totalInteractions = 0;
  let totalRates = 0;
  let totalUnrated = 0;

  for (const scenario of scenariosWithStudents) {
    console.log(`  ${scenario.nameZh}...`);

    const knowledgeList = scenarioKnowledgeMap.get(scenario.id)!;
    const students = await prisma.graphNode.findMany({
      where: { nodeType: 'Student', scenarioId: scenario.id },
      select: { id: true, gradeId: true, classId: true, schoolId: true },
    });

    if (students.length === 0) continue;

    const resourceTemplates = [
      { suffix: '入门教程', type: 'VIDEO' },
      { suffix: '操作指南', type: 'DOCUMENT' },
      { suffix: '练习题', type: 'PRACTICE' },
      { suffix: '互动课件', type: 'GAME' },
    ];

    const classMap = new Map<string, typeof students>();
    for (const student of students) {
      const key = `${student.gradeId || 'no-grade'}_${student.classId || 'no-class'}`;
      if (!classMap.has(key)) {
        classMap.set(key, []);
      }
      classMap.get(key)!.push(student);
    }

    for (const [classKey, classStudents] of classMap) {
      const [gradeId, classId] = classKey.split('_');
      const firstStudent = classStudents[0];

      const knowledgeCount = Math.floor(Math.random() * 4) + 3;
      const shuffled = [...knowledgeList].sort(() => 0.5 - Math.random());
      const selectedKnowledge = shuffled.slice(0, Math.min(knowledgeCount, knowledgeList.length));

      const session = await prisma.interactionSession.upsert({
        where: { id: `session_${scenario.id}_${classKey}` },
        update: {},
        create: {
          id: `session_${scenario.id}_${classKey}`,
          scenarioId: scenario.id,
          schoolId: firstStudent.schoolId || '',
          gradeId: gradeId !== 'no-grade' ? gradeId : null,
          classId: classId !== 'no-class' ? classId : null,
          sessionName: `${scenario.nameZh} - ${classKey}`,
          occurredAt: new Date(),
        },
      });

      for (const student of classStudents) {
        const studentKnowledgeCount = Math.floor(Math.random() * 3) + 1;
        const shuffledK = [...selectedKnowledge].sort(() => 0.5 - Math.random());
        const studentKnowledge = shuffledK.slice(0, studentKnowledgeCount);

        for (const knowledge of studentKnowledge) {
          const relation = await prisma.studentKnowledgeRelation.create({
            data: {
              studentNodeId: student.id,
              knowledgeNodeId: knowledge.id,
            },
          });
          totalRelations++;

          await prisma.interaction.create({
            data: {
              sessionId: session.id,
              sourceNodeId: student.id,
              targetNodeId: knowledge.id,
              interactionType: 'PLATFORM',
              strength: new Prisma.Decimal(1.0),
              actionType: 'STUDY',
              relationSourceId: relation.id,
            },
          });
          totalInteractions++;
        }
      }
    }

    for (let i = 0; i < knowledgeList.length; i++) {
      const knowledge = knowledgeList[i];
      const template = resourceTemplates[i % resourceTemplates.length];

      const resource = await prisma.resource.create({
        data: {
          title: `${knowledge.displayName} - ${template.suffix}`,
          description: `关于"${knowledge.displayName}"的${template.type}资源`,
          resourceType: template.type,
          url: `https://example.com/resource/${knowledge.id}`,
        },
      });

      await prisma.resourceKnowledgeRelation.create({
        data: {
          resourceId: resource.id,
          knowledgeNodeId: knowledge.id,
        },
      });

      const ratesToCreate: Array<{
        studentId: string;
        resourceId: string;
        rate: Prisma.Decimal;
      }> = [];

      for (const student of students) {
        const rateValue = generateRate();
        if (rateValue !== null) {
          ratesToCreate.push({
            studentId: student.id,
            resourceId: resource.id,
            rate: new Prisma.Decimal(rateValue),
          });
        } else {
          totalUnrated++;
        }
      }

      if (ratesToCreate.length > 0) {
        for (let j = 0; j < ratesToCreate.length; j += BATCH_SIZE) {
          const batch = ratesToCreate.slice(j, j + BATCH_SIZE);
          const result = await prisma.studentResourceRate.createMany({
            data: batch,
            skipDuplicates: true,
          });
          totalRates += result.count;
        }
      }
    }
  }

  console.log('\n完成!');
  console.log(`  学生-知识点关联: ${totalRelations}`);
  console.log(`  交互记录: ${totalInteractions}`);
  console.log(`  评分记录: ${totalRates}`);
  console.log(`  未评分: ${totalUnrated}`);
}

main()
  .catch((error) => {
    console.error('\n失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
