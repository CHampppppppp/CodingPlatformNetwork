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
  const adapter = new PrismaMssql(databaseUrl);
  prisma = new PrismaClient({ adapter });
} else {
  const adapter = new PrismaMariaDb(databaseUrl);
  prisma = new PrismaClient({ adapter });
}

async function main() {
  console.log('🔍 模拟 GraphService.buildWorkInteractionLinks 逻辑...\n');

  const studentNodes = await prisma.graphNode.findMany({
    where: { nodeType: 'Student' },
    select: { id: true, displayName: true, classId: true }
  });

  const studentIdSet = new Set(studentNodes.map((n: any) => n.id));
  const nameToIdMap = new Map(studentNodes.map((n: any) => [n.displayName, n.id]));

  console.log('学生节点总数:', studentNodes.length);

  const works = await prisma.studentWork.findMany({
    where: {
      OR: [
        { likeDetails: { not: null } },
        { commentDetails: { not: null } }
      ]
    },
    select: {
      studentNodeId: true,
      likeDetails: true,
      commentDetails: true
    }
  });

  console.log('有社交数据的作品数:', works.length);

  let likeLinks = 0;
  let commentLinks = 0;
  let skippedLikes = 0;
  let skippedComments = 0;

  for (const work of works) {
    const authorId = work.studentNodeId;

    if (work.likeDetails) {
      const likerIds = work.likeDetails.split(';').map((s: string) => s.trim()).filter(Boolean);
      for (const likerId of likerIds) {
        if (likerId === authorId) continue;
        if (!studentIdSet.has(likerId)) {
          skippedLikes++;
          continue;
        }
        likeLinks++;
      }
    }

    if (work.commentDetails) {
      const comments = work.commentDetails.split('|').map((s: string) => s.trim()).filter(Boolean);
      for (const comment of comments) {
        const colonIdx = comment.indexOf(':');
        if (colonIdx <= 0) continue;
        const commenterName = comment.substring(0, colonIdx).trim();
        const commenterNodeId = nameToIdMap.get(commenterName);

        if (!commenterNodeId || commenterNodeId === authorId) {
          skippedComments++;
          continue;
        }
        commentLinks++;
      }
    }
  }

  console.log('\n=== 连线生成统计 ===');
  console.log('LIKE 连线可生成数:', likeLinks);
  console.log('COMMENT 连线可生成数:', commentLinks);
  console.log('总生生连线数:', likeLinks + commentLinks);
  console.log('LIKE 因ID不匹配跳过:', skippedLikes);
  console.log('COMMENT 因名称不匹配跳过:', skippedComments);

  console.log('\n=== 名称匹配检查 ===');
  const sampleComments = works.slice(0, 100).flatMap((w: any) => 
    (w.commentDetails || '').split('|').map((s: string) => s.trim()).filter(Boolean)
  );
  
  let matchedNames = 0;
  let unmatchedNames = 0;
  const unmatchedNameSet = new Set();
  
  for (const comment of sampleComments) {
    const colonIdx = comment.indexOf(':');
    if (colonIdx <= 0) continue;
    const name = comment.substring(0, colonIdx).trim();
    if (nameToIdMap.has(name)) {
      matchedNames++;
    } else {
      unmatchedNames++;
      if (unmatchedNameSet.size < 10) unmatchedNameSet.add(name);
    }
  }

  console.log('评者名匹配成功:', matchedNames);
  console.log('评者名匹配失败:', unmatchedNames);
  console.log('匹配失败示例:', Array.from(unmatchedNameSet));

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
