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
const INSERT_BATCH_SIZE = 2000;

interface InteractionData {
  sessionId: string;
  sourceNodeId: string;
  targetNodeId: string;
  interactionType: string;
  strength: Prisma.Decimal;
  actionType: string;
}

async function main() {
  console.log('🚀 开始根据 StudentResourceRate 创建 Interaction 记录...\n');

  console.log('📋 加载资源-知识点关系...');
  const resourceRelations = await prisma.resourceKnowledgeRelation.findMany({
    select: { resourceId: true, knowledgeNodeId: true },
  });

  const resourceToKnowledges = new Map<string, string[]>();
  for (const rel of resourceRelations) {
    const list = resourceToKnowledges.get(rel.resourceId) || [];
    list.push(rel.knowledgeNodeId);
    resourceToKnowledges.set(rel.resourceId, list);
  }
  console.log(`   资源-知识点关系: ${resourceRelations.length} 条`);
  console.log(`   涉及资源数: ${resourceToKnowledges.size}\n`);

  const totalRates = await prisma.studentResourceRate.count();
  console.log(`📊 StudentResourceRate 总数: ${totalRates}\n`);

  if (totalRates === 0) {
    console.log('⚠️  没有找到评分记录，退出。');
    return;
  }

  const studentCache = new Map<string, any>();
  const sessionCache = new Map<string, string>();

  async function getStudentNode(studentId: string) {
    if (studentCache.has(studentId)) {
      return studentCache.get(studentId);
    }
    const node = await prisma.graphNode.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        scenarioId: true,
        schoolId: true,
        gradeId: true,
        classId: true,
        displayName: true,
      },
    });
    if (node) {
      studentCache.set(studentId, node);
    }
    return node;
  }

  async function getOrCreateSession(scenarioId: string, studentNode: any): Promise<string> {
    const cacheKey = `${scenarioId}_${studentNode.schoolId}_${studentNode.gradeId}_${studentNode.classId}`;
    if (sessionCache.has(cacheKey)) {
      return sessionCache.get(cacheKey)!;
    }

    const existingSession = await prisma.interactionSession.findFirst({
      where: {
        scenarioId,
        schoolId: studentNode.schoolId ?? undefined,
        gradeId: studentNode.gradeId ?? undefined,
        classId: studentNode.classId ?? undefined,
      },
      orderBy: { occurredAt: 'desc' },
      select: { id: true },
    });

    if (existingSession) {
      sessionCache.set(cacheKey, existingSession.id);
      return existingSession.id;
    }

    const newSession = await prisma.interactionSession.create({
      data: {
        scenarioId,
        schoolId: studentNode.schoolId || '',
        gradeId: studentNode.gradeId || '',
        classId: studentNode.classId || null,
        sessionName: '资源评分同步 - 知识点学习',
        occurredAt: new Date(),
      },
      select: { id: true },
    });

    sessionCache.set(cacheKey, newSession.id);
    return newSession.id;
  }

  let processedRates = 0;
  let createdInteractions = 0;
  let skippedDuplicates = 0;
  let skippedNoKnowledge = 0;
  let batchNumber = 0;

  let cursor: string | undefined;

  while (processedRates < totalRates) {
    batchNumber++;
    const rates = await prisma.studentResourceRate.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        studentId: true,
        resourceId: true,
        rate: true,
      },
    });

    if (rates.length === 0) break;

    cursor = rates[rates.length - 1].id;

    const interactionsToCreate: InteractionData[] = [];

    for (const rate of rates) {
      const knowledgeIds = resourceToKnowledges.get(rate.resourceId);
      if (!knowledgeIds || knowledgeIds.length === 0) {
        skippedNoKnowledge++;
        continue;
      }

      const studentNode = await getStudentNode(rate.studentId);
      if (!studentNode) {
        console.warn(`⚠️  学生节点不存在: ${rate.studentId}`);
        continue;
      }

      const sessionId = await getOrCreateSession(studentNode.scenarioId, studentNode);

      for (const knowledgeNodeId of knowledgeIds) {
        interactionsToCreate.push({
          sessionId,
          sourceNodeId: rate.studentId,
          targetNodeId: knowledgeNodeId,
          interactionType: 'PLATFORM',
          strength: new Prisma.Decimal(rate.rate.toString()),
          actionType: 'STUDY',
        });
      }
    }

    if (interactionsToCreate.length > 0) {
      for (let i = 0; i < interactionsToCreate.length; i += INSERT_BATCH_SIZE) {
        const batch = interactionsToCreate.slice(i, i + INSERT_BATCH_SIZE);
        try {
          const result = await prisma.interaction.createMany({
            data: batch,
            skipDuplicates: true,
          });
          createdInteractions += result.count;
          skippedDuplicates += batch.length - result.count;
        } catch (error: any) {
          console.error('❌ 插入失败:', error.message);
          throw error;
        }
      }
    }

    processedRates += rates.length;
    console.log(
      `   批次 ${batchNumber}: 处理 ${rates.length} 条评分, ` +
      `已创建 ${createdInteractions} 条交互, ` +
      `跳过重复 ${skippedDuplicates}, ` +
      `无知识点 ${skippedNoKnowledge}`
    );
  }

  console.log('\n📊 完成统计:');
  console.log(`   处理评分记录: ${processedRates}`);
  console.log(`   创建交互记录: ${createdInteractions}`);
  console.log(`   跳过重复: ${skippedDuplicates}`);
  console.log(`   资源无知识点关联: ${skippedNoKnowledge}`);
  console.log(`   总批次数: ${batchNumber}`);

  const finalCount = await prisma.interaction.count({
    where: { actionType: 'STUDY' },
  });
  console.log(`   STUDY 交互总数: ${finalCount}`);
  console.log('\n✅ 完成!');
}

main()
  .catch((error) => {
    console.error('\n❌ 失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
