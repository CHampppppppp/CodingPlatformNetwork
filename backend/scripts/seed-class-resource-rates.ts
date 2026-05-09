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

const BATCH_SIZE = 5000;
const RATE_PROBABILITY = 0.6; // 60% 的学生会对资源评分
const RATE_MIN = 1;
const RATE_MAX = 5;

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateRate(seed: number): number {
  // 生成偏向 3-4 分的评分
  const rand = seededRandom(seed);
  const rate = 2.5 + rand * 2.5; // 2.5 ~ 5.0
  return Math.round(Math.min(RATE_MAX, Math.max(RATE_MIN, rate)) * 100) / 100;
}

async function main() {
  console.log('🚀 开始为班级学生补资源评分...');
  console.log(`   评分概率: ${RATE_PROBABILITY * 100}%\n`);

  // 1. 获取所有班级
  const classes = await prisma.schoolClass.findMany({
    include: { grade: { include: { school: true } } },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`📊 总班级数: ${classes.length}\n`);

  let totalCreated = 0;
  let totalSkipped = 0;

  for (let ci = 0; ci < classes.length; ci++) {
    const cls = classes[ci];
    const classLabel = `${cls.grade.school.name} ${cls.grade.gradeName}年级${cls.className}班`;
    console.log(`[${ci + 1}/${classes.length}] 📌 ${classLabel}`);

    // 2. 获取该班学生
    const students = await prisma.graphNode.findMany({
      where: {
        nodeType: 'Student',
        classId: cls.id,
      },
      select: { id: true },
    });

    if (students.length === 0) {
      console.log('    无学生，跳过\n');
      continue;
    }
    const studentIds = students.map((s) => s.id);
    console.log(`    学生数: ${students.length}`);

    // 3. 获取该班学生交互过的知识节点
    const knowledgeIds = new Set<string>();

    // 通过 interactions
    const interactions = await prisma.interaction.findMany({
      where: {
        OR: [
          { sourceNodeId: { in: studentIds }, targetNode: { nodeType: 'Knowledge' } },
          { targetNodeId: { in: studentIds }, sourceNode: { nodeType: 'Knowledge' } },
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

    // 通过 StudentKnowledgeRelation
    const skRelations = await prisma.studentKnowledgeRelation.findMany({
      where: {
        studentNodeId: { in: studentIds },
      },
      select: { knowledgeNodeId: true },
    });
    for (const r of skRelations) {
      knowledgeIds.add(r.knowledgeNodeId);
    }

    console.log(`    知识节点数: ${knowledgeIds.size}`);
    if (knowledgeIds.size === 0) {
      console.log('    无知识节点，跳过\n');
      continue;
    }

    // 4. 获取这些知识节点关联的资源
    const resourceRelations = await prisma.resourceKnowledgeRelation.findMany({
      where: {
        knowledgeNodeId: { in: Array.from(knowledgeIds) },
      },
      select: { resourceId: true, knowledgeNodeId: true },
    });

    const resourceIds = [...new Set(resourceRelations.map((r) => r.resourceId))];
    console.log(`    关联资源数: ${resourceIds.length}`);
    if (resourceIds.length === 0) {
      console.log('    无关联资源，跳过\n');
      continue;
    }

    // 5. 查询该班学生对这些资源已有的评分
    const existingRates = await prisma.studentResourceRate.findMany({
      where: {
        studentId: { in: studentIds },
        resourceId: { in: resourceIds },
      },
      select: { studentId: true, resourceId: true },
    });

    const existingKeySet = new Set(existingRates.map((r) => `${r.studentId}:${r.resourceId}`));
    console.log(`    已有评分: ${existingRates.length}`);

    // 6. 生成需要补的评分
    const ratesToCreate: Array<{ studentId: string; resourceId: string; rate: Prisma.Decimal }> = [];
    let willCreateCount = 0;
    let willSkipCount = 0;

    for (const student of students) {
      for (const resourceId of resourceIds) {
        const key = `${student.id}:${resourceId}`;
        if (existingKeySet.has(key)) continue;

        const seed =
          parseInt(student.id.replace(/\D/g, ''), 10) +
          parseInt(resourceId.replace(/\D/g, ''), 10);

        if (seededRandom(seed) < RATE_PROBABILITY) {
          const rateValue = generateRate(seed + 1);
          ratesToCreate.push({
            studentId: student.id,
            resourceId,
            rate: new Prisma.Decimal(rateValue),
          });
          willCreateCount++;
        } else {
          willSkipCount++;
        }

        if (ratesToCreate.length >= BATCH_SIZE) {
          const result = await prisma.studentResourceRate.createMany({
            data: ratesToCreate,
            skipDuplicates: true,
          });
          totalCreated += result.count;
          ratesToCreate.length = 0;
        }
      }
    }

    if (ratesToCreate.length > 0) {
      const result = await prisma.studentResourceRate.createMany({
        data: ratesToCreate,
        skipDuplicates: true,
      });
      totalCreated += result.count;
    }

    totalSkipped += willSkipCount;
    console.log(`    ✅ 新增: ${willCreateCount} | 跳过(40%): ${willSkipCount}\n`);
  }

  const finalCount = await prisma.studentResourceRate.count();
  console.log(`\n📊 总计:`);
  console.log(`  新增评分: ${totalCreated}`);
  console.log(`  模拟跳过: ${totalSkipped} (未写入)`);
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
