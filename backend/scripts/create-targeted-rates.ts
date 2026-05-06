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
  prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl) });
} else {
  prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });
}

const BATCH_SIZE = 1000;

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateRate(seed: number): number {
  const rand = seededRandom(seed);
  const rate = 2 + rand * 3;
  return Math.min(5, Math.max(1, Math.round(rate * 100) / 100));
}

async function main() {
  console.log('🚀 开始创建精准评分...\n');

  const scenarios = await prisma.learningScenario.findMany({
    where: { isActive: true },
  });

  let totalCreated = 0;

  for (const scenario of scenarios) {
    console.log(`📌 场景: ${scenario.nameZh}`);

    // 1. 获取场景下的学生
    const students = await prisma.graphNode.findMany({
      where: {
        nodeType: 'Student',
        scenarioId: scenario.id,
      },
      select: { id: true },
    });

    if (students.length === 0) {
      console.log('  无学生，跳过\n');
      continue;
    }

    console.log(`  学生数: ${students.length}`);

    // 2. 获取场景下的知识节点（直接+通过交互）
    const knowledgeIds = new Set<string>();
    
    // 直接属于场景的知识节点
    const directKnowledge = await prisma.graphNode.findMany({
      where: {
        nodeType: 'Knowledge',
        scenarioId: scenario.id,
      },
      select: { id: true },
    });
    directKnowledge.forEach(k => knowledgeIds.add(k.id));

    // 通过交互出现的知识节点
    const sessions = await prisma.interactionSession.findMany({
      where: { scenarioId: scenario.id },
      select: { id: true },
    });
    
    if (sessions.length > 0) {
      const sessionIds = sessions.map(s => s.id);
      const interactions = await prisma.interaction.findMany({
        where: {
          sessionId: { in: sessionIds },
          OR: [
            { sourceNode: { nodeType: 'Knowledge' } },
            { targetNode: { nodeType: 'Knowledge' } },
          ],
        },
        include: {
          sourceNode: { select: { id: true, nodeType: true } },
          targetNode: { select: { id: true, nodeType: true } },
        },
      });

      for (const i of interactions) {
        if (i.sourceNode.nodeType === 'Knowledge') knowledgeIds.add(i.sourceNode.id);
        if (i.targetNode.nodeType === 'Knowledge') knowledgeIds.add(i.targetNode.id);
      }
    }

    console.log(`  知识节点数: ${knowledgeIds.size}`);

    if (knowledgeIds.size === 0) {
      console.log('  无知识节点，跳过\n');
      continue;
    }

    // 3. 获取这些知识节点关联的资源
    const resourceRelations = await prisma.resourceKnowledgeRelation.findMany({
      where: {
        knowledgeNodeId: { in: Array.from(knowledgeIds) },
      },
      select: {
        resourceId: true,
        knowledgeNodeId: true,
      },
    });

    // 构建 知识节点 -> 资源列表 映射
    const knowledgeToResources = new Map<string, string[]>();
    for (const rel of resourceRelations) {
      const list = knowledgeToResources.get(rel.knowledgeNodeId) || [];
      list.push(rel.resourceId);
      knowledgeToResources.set(rel.knowledgeNodeId, list);
    }

    console.log(`  资源关联数: ${resourceRelations.length}`);

    if (resourceRelations.length === 0) {
      console.log('  无资源关联，跳过\n');
      continue;
    }

    // 4. 获取学生与知识节点的交互关系
    const studentKnowledgeMap = new Map<string, Set<string>>();
    
    // 通过 StudentKnowledgeRelation
    const studentKnowledgeRelations = await prisma.studentKnowledgeRelation.findMany({
      where: {
        studentNodeId: { in: students.map(s => s.id) },
        knowledgeNodeId: { in: Array.from(knowledgeIds) },
      },
      select: { studentNodeId: true, knowledgeNodeId: true },
    });

    for (const rel of studentKnowledgeRelations) {
      const set = studentKnowledgeMap.get(rel.studentNodeId) || new Set();
      set.add(rel.knowledgeNodeId);
      studentKnowledgeMap.set(rel.studentNodeId, set);
    }

    const knowledgeIdArray = Array.from(knowledgeIds);
    const STUDENT_BATCH = 5000;
    
    for (let s = 0; s < students.length; s += STUDENT_BATCH) {
      const studentBatch = students.slice(s, s + STUDENT_BATCH);
      const studentIdBatch = studentBatch.map(st => st.id);
      
      if (sessions.length > 0) {
        const sessionIds = sessions.map(se => se.id);
        const interactions = await prisma.interaction.findMany({
          where: {
            sessionId: { in: sessionIds },
            OR: [
              {
                sourceNodeId: { in: studentIdBatch },
                targetNodeId: { in: knowledgeIdArray },
              },
              {
                targetNodeId: { in: studentIdBatch },
                sourceNodeId: { in: knowledgeIdArray },
              },
            ],
          },
          select: { sourceNodeId: true, targetNodeId: true },
        });

        for (const i of interactions) {
          const studentId = studentIdBatch.find(id => id === i.sourceNodeId || id === i.targetNodeId);
          const knowledgeId = knowledgeIdArray.find(id => id === i.sourceNodeId || id === i.targetNodeId);
          if (studentId && knowledgeId) {
            const set = studentKnowledgeMap.get(studentId) || new Set();
            set.add(knowledgeId);
            studentKnowledgeMap.set(studentId, set);
          }
        }
      }
    }

    console.log(`  有知识关联的学生数: ${studentKnowledgeMap.size}\n`);

    // 5. 创建评分：学生对其关联知识节点的资源评分
    const ratesToCreate: Array<{ studentId: string; resourceId: string; rate: Prisma.Decimal }> = [];
    let scenarioCreated = 0;

    for (const [studentId, knowledgeSet] of studentKnowledgeMap) {
      for (const knowledgeId of knowledgeSet) {
        const resourceIds = knowledgeToResources.get(knowledgeId);
        if (!resourceIds || resourceIds.length === 0) continue;

        // 为每个关联资源创建评分（概率60%）
        for (let i = 0; i < resourceIds.length; i++) {
          const resourceId = resourceIds[i];
          const seed = parseInt(studentId.replace(/\D/g, ''), 10) + parseInt(resourceId.replace(/\D/g, ''), 10);
          
          if (seededRandom(seed) < 0.6) {
            const rateValue = generateRate(seed);
            ratesToCreate.push({
              studentId,
              resourceId,
              rate: new Prisma.Decimal(rateValue),
            });

            if (ratesToCreate.length >= BATCH_SIZE) {
              const result = await prisma.studentResourceRate.createMany({
                data: ratesToCreate,
                skipDuplicates: true,
              });
              scenarioCreated += result.count;
              ratesToCreate.length = 0;
            }
          }
        }
      }
    }

    if (ratesToCreate.length > 0) {
      const result = await prisma.studentResourceRate.createMany({
        data: ratesToCreate,
        skipDuplicates: true,
      });
      scenarioCreated += result.count;
    }

    console.log(`  ✅ 创建评分: ${scenarioCreated}\n`);
    totalCreated += scenarioCreated;
  }

  const finalCount = await prisma.studentResourceRate.count();
  console.log(`\n📊 总计:`);
  console.log(`  新建评分: ${totalCreated}`);
  console.log(`  评分总数: ${finalCount}`);
  console.log('✅ 完成!');
}

main()
  .catch((error) => {
    console.error('\n❌ 失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
