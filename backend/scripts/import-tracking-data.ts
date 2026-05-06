#!/usr/bin/env ts-node
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

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

const CSV_PATH = path.resolve(__dirname, '../datas/5.5/埋点数据_接入省科技平台_user_id非空_转换后.csv');

const studentCache = new Map<string, string>();
const knowledgeCache = new Map<string, string[]>();
const sessionCache = new Map<string, any>();

function readCSV(): any[] {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV文件不存在: ${CSV_PATH}`);
  }

  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  return records;
}

function extractNodeIds(metaStr: string): string[] {
  try {
    const meta = JSON.parse(metaStr);
    const content = meta.content || {};
    const answer = content.answer || '';

    const matches: RegExpMatchArray | null = answer.match(/nodeId=(\d+)/g);
    if (!matches) return [];

    const nodeIds: string[] = matches.map((m: string) => m.replace('nodeId=', ''));
    return [...new Set(nodeIds)];
  } catch (e) {
    return [];
  }
}

async function findStudentNodeIdByName(username: string): Promise<string | null> {
  if (studentCache.has(username)) {
    return studentCache.get(username)!;
  }

  const node = await prisma.graphNode.findFirst({
    where: { 
      nodeType: 'Student',
      displayName: username,
    },
    select: { id: true },
  });

  if (node) {
    studentCache.set(username, node.id);
    return node.id;
  }

  return null;
}

async function findKnowledgeNodeIds(nodeId: string): Promise<string[]> {
  if (knowledgeCache.has(nodeId)) {
    return knowledgeCache.get(nodeId)!;
  }

  const resources = await prisma.resource.findMany({
    where: {
      url: { contains: `nodeId=${nodeId}` },
    },
    include: {
      knowledgeRelations: {
        select: { knowledgeNodeId: true },
      },
    },
  });

  const knowledgeNodeIds = resources.flatMap((r) =>
    r.knowledgeRelations.map((kr) => kr.knowledgeNodeId),
  );

  const uniqueIds = [...new Set(knowledgeNodeIds)];
  knowledgeCache.set(nodeId, uniqueIds);

  return uniqueIds;
}

async function findOrCreateSession(scenarioId: string, studentNode: any) {
  const cacheKey = `${scenarioId}_${studentNode.schoolId}_${studentNode.gradeId}_${studentNode.classId}`;

  if (sessionCache.has(cacheKey)) {
    return sessionCache.get(cacheKey);
  }

  const existingSession = await prisma.interactionSession.findFirst({
    where: {
      scenarioId,
      schoolId: studentNode.schoolId ?? undefined,
      gradeId: studentNode.gradeId ?? undefined,
      classId: studentNode.classId ?? undefined,
    },
    orderBy: { occurredAt: 'desc' },
  });

  if (existingSession) {
    sessionCache.set(cacheKey, existingSession);
    return existingSession;
  }

  const session = await prisma.interactionSession.create({
    data: {
      scenarioId,
      schoolId: studentNode.schoolId || '',
      gradeId: studentNode.gradeId || '',
      classId: studentNode.classId || null,
      sessionName: '埋点数据导入 - 知识点学习',
      occurredAt: new Date(),
    },
  });

  sessionCache.set(cacheKey, session);
  return session;
}

async function createInteraction(
  sessionId: string,
  studentNodeId: string,
  knowledgeNodeId: string,
  relationId: string,
) {
  try {
    await prisma.interaction.create({
      data: {
        sessionId,
        sourceNodeId: studentNodeId,
        targetNodeId: knowledgeNodeId,
        interactionType: 'PLATFORM',
        strength: new Prisma.Decimal(1.0),
        actionType: 'STUDY',
        relationSourceId: relationId,
      },
    });
    return true;
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return false;
    }
    throw error;
  }
}

async function main() {
  console.log('开始导入埋点数据...\n');

  const records = readCSV();
  console.log(`共 ${records.length} 条记录`);

  const validRecords: Array<{
    username: string;
    user_id: string;
    orgName: string;
    nodeIds: string[];
    create_time: string;
  }> = [];

  for (const row of records) {
    const type = row.type;
    if (type !== '3' && type !== '4') continue;

    const nodeIds = extractNodeIds(row.meta);
    if (nodeIds.length === 0) continue;

    const meta = JSON.parse(row.meta);
    const username = meta.username || '';
    if (!username || username === 'None') continue;

    const orgName = Array.isArray(meta.orgName) ? meta.orgName[0] : (meta.orgName || '');

    validRecords.push({
      username,
      user_id: row.user_id,
      orgName,
      nodeIds,
      create_time: row.create_time,
    });
  }

  console.log(`有效记录: ${validRecords.length} 条\n`);

  if (validRecords.length === 0) {
    console.log('没有找到包含知识点推荐的记录，退出。');
    return;
  }

  const scenario = await prisma.learningScenario.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  if (!scenario) {
    throw new Error('数据库中没有场景记录');
  }

  console.log(`使用场景: ${scenario.nameZh} (${scenario.id})\n`);

  let createdRelations = 0;
  let existingRelations = 0;
  let createdInteractions = 0;
  let skippedInteractions = 0;
  let missingStudents = 0;
  let missingKnowledge = 0;
  const missingStudentList: Array<{ username: string; orgName: string; userId: string }> = [];

  for (let i = 0; i < validRecords.length; i++) {
    const record = validRecords[i];
    const progress = `[${i + 1}/${validRecords.length}]`;

    const studentNodeId = await findStudentNodeIdByName(record.username);
    if (!studentNodeId) {
      console.log(`${progress} 学生不存在: ${record.username}`);
      missingStudents++;
      missingStudentList.push({
        username: record.username,
        orgName: record.orgName || '未知学校',
        userId: record.user_id || '',
      });
      continue;
    }

    const studentNode = await prisma.graphNode.findUnique({
      where: { id: studentNodeId },
      select: { scenarioId: true, schoolId: true, gradeId: true, classId: true },
    });

    if (!studentNode) {
      console.log(`${progress} 学生节点不存在: ${studentNodeId}`);
      missingStudents++;
      continue;
    }

    for (const nodeId of record.nodeIds) {
      const knowledgeNodeIds = await findKnowledgeNodeIds(nodeId);

      if (knowledgeNodeIds.length === 0) {
        console.log(`${progress} 知识点不存在: nodeId=${nodeId}`);
        missingKnowledge++;
        continue;
      }

      for (const knowledgeNodeId of knowledgeNodeIds) {
        const existingRelation = await prisma.studentKnowledgeRelation.findUnique({
          where: {
            studentNodeId_knowledgeNodeId: {
              studentNodeId,
              knowledgeNodeId,
            },
          },
        });

        let relationId: string;

        if (existingRelation) {
          relationId = existingRelation.id;
          existingRelations++;
        } else {
          const relation = await prisma.studentKnowledgeRelation.create({
            data: {
              studentNodeId,
              knowledgeNodeId,
            },
          });
          relationId = relation.id;
          createdRelations++;
        }

        const session = await findOrCreateSession(studentNode.scenarioId, studentNode);
        const created = await createInteraction(
          session.id,
          studentNodeId,
          knowledgeNodeId,
          relationId,
        );

        if (created) {
          createdInteractions++;
        } else {
          skippedInteractions++;
        }
      }
    }
  }

  console.log('\n导入统计:');
  console.log(`  新创建关联: ${createdRelations}`);
  console.log(`  已存在关联: ${existingRelations}`);
  console.log(`  新创建交互: ${createdInteractions}`);
  console.log(`  已存在交互: ${skippedInteractions}`);
  console.log(`  学生不存在: ${missingStudents}`);
  console.log(`  知识点不存在: ${missingKnowledge}`);

  if (missingStudentList.length > 0) {
    console.log('\n缺失学生列表（需先导入这些学生）:');
    const uniqueStudents = [...new Map(missingStudentList.map(s => [s.username, s])).values()];
    for (const s of uniqueStudents) {
      console.log(`  - ${s.username} (${s.orgName})`);
    }
    console.log(`\n共 ${uniqueStudents.length} 个缺失学生，请先导入学生数据后再运行此脚本。`);
  }

  console.log('\n导入完成!');
}

main()
  .catch((error) => {
    console.error('\n导入失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
