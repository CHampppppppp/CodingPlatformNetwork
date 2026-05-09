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

const BATCH_SIZE = 2000;

async function main() {
  console.log('🚀 从 student_works 表提取同班同学交互数据...\n');

  const allStudents = await prisma.graphNode.findMany({
    where: { nodeType: 'Student' },
    select: { id: true, displayName: true, classId: true, schoolId: true, gradeId: true, scenarioId: true }
  });

  const studentMap = new Map();
  const nameToStudentMap = new Map();
  allStudents.forEach((s: any) => {
    studentMap.set(s.id, s);
    if (s.displayName) {
      nameToStudentMap.set(s.displayName.trim(), s);
    }
  });

  const externalIdMap = new Map();
  const profiles = await prisma.studentProfile.findMany({
    where: { externalUserId: { not: null } },
    select: { nodeId: true, externalUserId: true }
  });
  profiles.forEach((p: any) => {
    externalIdMap.set(p.externalUserId, p.nodeId);
  });

  console.log(`学生总数: ${allStudents.length}`);
  console.log(`External ID 映射数: ${externalIdMap.size}`);

  const sessionMap = new Map();
  const sessions = await prisma.interactionSession.findMany({
    select: { id: true, schoolId: true, gradeId: true, classId: true, scenarioId: true }
  });
  sessions.forEach((s: any) => {
    const key = `${s.scenarioId}_${s.schoolId}_${s.gradeId}_${s.classId || 'null'}`;
    sessionMap.set(key, s.id);
  });

  const works = await prisma.studentWork.findMany({
    where: {
      OR: [
        { likeDetails: { not: null } },
        { commentDetails: { not: null } }
      ]
    },
    select: {
      id: true,
      studentNodeId: true,
      likeDetails: true,
      commentDetails: true,
      sessionId: true
    }
  });

  console.log(`有社交数据的作品数: ${works.length}\n`);

  const interactionsToCreate: any[] = [];
  let skippedLikes = 0;
  let skippedComments = 0;
  let sameClassLikes = 0;
  let sameClassComments = 0;

  for (const work of works) {
    const author = studentMap.get(work.studentNodeId);
    if (!author) {
      skippedLikes += work.likeDetails ? work.likeDetails.split(';').length : 0;
      skippedComments += work.commentDetails ? work.commentDetails.split('|').length : 0;
      continue;
    }

    const sessionKey = `${author.scenarioId}_${author.schoolId}_${author.gradeId}_${author.classId || 'null'}`;
    const sessionId = work.sessionId || sessionMap.get(sessionKey);

    if (!sessionId) {
      console.log(`警告: 作品 ${work.id} 找不到对应 session`);
      continue;
    }

    if (work.likeDetails) {
      const likerIds = work.likeDetails.split(';').map((s: string) => s.trim()).filter(Boolean);
      for (const likerId of likerIds) {
        let likerNodeId: string | undefined;

        if (likerId.length === 25 && likerId.startsWith('cmo')) {
          likerNodeId = studentMap.has(likerId) ? likerId : undefined;
        } else if (likerId.length === 32) {
          likerNodeId = externalIdMap.get(likerId);
        }

        if (!likerNodeId || likerNodeId === work.studentNodeId) {
          skippedLikes++;
          continue;
        }

        const liker = studentMap.get(likerNodeId);
        if (!liker) {
          skippedLikes++;
          continue;
        }

        if (liker.classId !== author.classId || liker.schoolId !== author.schoolId) {
          skippedLikes++;
          continue;
        }

        sameClassLikes++;
        interactionsToCreate.push({
          sessionId,
          sourceNodeId: likerNodeId,
          targetNodeId: work.studentNodeId,
          interactionType: 'PLATFORM',
          actionType: 'LIKE',
          strength: new Prisma.Decimal(1.5)
        });
      }
    }

    if (work.commentDetails) {
      const comments = work.commentDetails.split('|').map((s: string) => s.trim()).filter(Boolean);
      for (const comment of comments) {
        const colonIdx = comment.indexOf(':');
        if (colonIdx <= 0) continue;

        const commenterName = comment.substring(0, colonIdx).trim();
        const commenter = nameToStudentMap.get(commenterName);

        if (!commenter || commenter.id === work.studentNodeId) {
          skippedComments++;
          continue;
        }

        if (commenter.classId !== author.classId || commenter.schoolId !== author.schoolId) {
          skippedComments++;
          continue;
        }

        sameClassComments++;
        interactionsToCreate.push({
          sessionId,
          sourceNodeId: commenter.id,
          targetNodeId: work.studentNodeId,
          interactionType: 'PLATFORM',
          actionType: 'COMMENT',
          strength: new Prisma.Decimal(2.5)
        });
      }
    }
  }

  console.log('=== 数据处理统计 ===');
  console.log(`同班 LIKE 交互: ${sameClassLikes}`);
  console.log(`同班 COMMENT 交互: ${sameClassComments}`);
  console.log(`跳过(非同班或无法匹配): LIKE=${skippedLikes}, COMMENT=${skippedComments}`);
  console.log(`待插入交互总数: ${interactionsToCreate.length}\n`);

  if (interactionsToCreate.length === 0) {
    console.log('没有需要插入的交互数据');
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  let skipped = 0;
  for (let i = 0; i < interactionsToCreate.length; i += BATCH_SIZE) {
    const batch = interactionsToCreate.slice(i, i + BATCH_SIZE);
    try {
      const result = await prisma.interaction.createMany({
        data: batch,
        skipDuplicates: true
      });
      created += result.count;
      skipped += batch.length - result.count;
    } catch (error: any) {
      console.error(`插入失败: ${error.message}`);
    }
  }

  console.log(`=== 插入结果 ===`);
  console.log(`成功创建: ${created}`);
  console.log(`跳过重复: ${skipped}`);

  const finalCount = await prisma.interaction.count({
    where: {
      actionType: { in: ['LIKE', 'COMMENT'] }
    }
  });
  console.log(`当前 LIKE/COMMENT 交互总数: ${finalCount}`);

  await prisma.$disconnect();
  console.log('\n✅ 完成!');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
