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

async function main() {
  console.log('🔄 开始从 StudentKnowledgeRelation 恢复 STUDY 交互记录...\n');

  const totalRelations = await prisma.studentKnowledgeRelation.count();
  console.log(`StudentKnowledgeRelation 总数: ${totalRelations}\n`);

  if (totalRelations === 0) {
    console.log('⚠️  没有关联记录，退出。');
    return;
  }

  const sessionCache = new Map<string, string>();

  async function getOrCreateSession(scenarioId: string, schoolId: string | null, gradeId: string | null, classId: string | null): Promise<string> {
    const cacheKey = `${scenarioId}_${schoolId}_${gradeId}_${classId}`;
    if (sessionCache.has(cacheKey)) {
      return sessionCache.get(cacheKey)!;
    }

    const existingSession = await prisma.interactionSession.findFirst({
      where: {
        scenarioId,
        schoolId: schoolId ?? undefined,
        gradeId: gradeId ?? undefined,
        classId: classId ?? undefined,
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
        schoolId: schoolId || '',
        gradeId: gradeId || '',
        classId: classId || null,
        sessionName: '学生-知识点关联恢复',
        occurredAt: new Date(),
      },
      select: { id: true },
    });

    sessionCache.set(cacheKey, newSession.id);
    return newSession.id;
  }

  let processedRelations = 0;
  let createdInteractions = 0;
  let skippedDuplicates = 0;
  let batchNumber = 0;

  let cursor: string | undefined;

  while (processedRelations < totalRelations) {
    batchNumber++;
    const relations = await prisma.studentKnowledgeRelation.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      include: {
        studentNode: {
          select: {
            id: true,
            scenarioId: true,
            schoolId: true,
            gradeId: true,
            classId: true,
          },
        },
        knowledgeNode: {
          select: { id: true },
        },
      },
    });

    if (relations.length === 0) break;

    cursor = relations[relations.length - 1].id;

    const interactionsToCreate: Array<{
      sessionId: string;
      sourceNodeId: string;
      targetNodeId: string;
      interactionType: string;
      strength: Prisma.Decimal;
      actionType: string;
      relationSourceId: string;
    }> = [];

    for (const relation of relations) {
      const sessionId = await getOrCreateSession(
        relation.studentNode.scenarioId,
        relation.studentNode.schoolId,
        relation.studentNode.gradeId,
        relation.studentNode.classId,
      );

      interactionsToCreate.push({
        sessionId,
        sourceNodeId: relation.studentNodeId,
        targetNodeId: relation.knowledgeNodeId,
        interactionType: 'PLATFORM',
        strength: new Prisma.Decimal(1.0),
        actionType: 'STUDY',
        relationSourceId: relation.id,
      });
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

    processedRelations += relations.length;
    if (batchNumber % 5 === 0) {
      console.log(
        `   批次 ${batchNumber}: 处理 ${processedRelations}/${totalRelations} 条关联, ` +
        `已创建 ${createdInteractions} 条交互, ` +
        `跳过重复 ${skippedDuplicates}`
      );
    }
  }

  console.log('\n📊 完成统计:');
  console.log(`   处理关联记录: ${processedRelations}`);
  console.log(`   创建交互记录: ${createdInteractions}`);
  console.log(`   跳过重复: ${skippedDuplicates}`);
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
