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
  console.log('🔍 调查 externalUserId 映射关系...\n');

  // 1. 检查 student_profiles 表中 externalUserId 的分布
  const profileStats = await prisma.studentProfile.groupBy({
    by: ['externalUserId'],
    _count: { externalUserId: true }
  });
  
  const profilesWithExternalId = profileStats.filter((p: any) => p.externalUserId !== null);
  console.log('=== student_profiles 表统计 ===');
  console.log('有 externalUserId 的记录数:', profilesWithExternalId.length);
  console.log('无 externalUserId 的记录数:', profileStats.length - profilesWithExternalId.length);
  
  if (profilesWithExternalId.length > 0) {
    console.log('\nexternalUserId 示例（前10个）:');
    profilesWithExternalId.slice(0, 10).forEach((p: any, i: number) => {
      console.log(`  [${i+1}] ${p.externalUserId} (长度: ${p.externalUserId.length})`);
    });
  }

  // 2. 建立 externalUserId -> nodeId 映射
  const profiles = await prisma.studentProfile.findMany({
    where: { externalUserId: { not: null } },
    select: { nodeId: true, externalUserId: true }
  });

  const externalIdToNodeId = new Map();
  profiles.forEach((p: any) => {
    externalIdToNodeId.set(p.externalUserId, p.nodeId);
  });

  console.log('\n=== externalUserId -> nodeId 映射 ===');
  console.log('映射条目数:', externalIdToNodeId.size);

  // 3. 检查 likeDetails 中的 ID 能否通过 externalUserId 映射
  const works = await prisma.studentWork.findMany({
    where: { likeDetails: { not: null } },
    select: { likeDetails: true },
    take: 1000
  });

  let allLikerIds: string[] = [];
  works.forEach((w: any) => {
    if (w.likeDetails) {
      const ids = w.likeDetails.split(';').map((s: string) => s.trim()).filter(Boolean);
      allLikerIds.push(...ids);
    }
  });

  const uniqueLikerIds = [...new Set(allLikerIds)];
  let matchedByExternalId = 0;
  let notMatched = 0;
  const notMatchedIds: string[] = [];

  uniqueLikerIds.forEach((id: string) => {
    if (externalIdToNodeId.has(id)) {
      matchedByExternalId++;
    } else {
      notMatched++;
      if (notMatchedIds.length < 10) notMatchedIds.push(id);
    }
  });

  console.log('\n=== likeDetails ID 匹配情况 ===');
  console.log('总唯一点赞者ID数:', uniqueLikerIds.length);
  console.log('通过 externalUserId 匹配成功:', matchedByExternalId);
  console.log('未匹配:', notMatched);
  console.log('匹配率:', ((matchedByExternalId / uniqueLikerIds.length) * 100).toFixed(2) + '%');
  
  if (notMatchedIds.length > 0) {
    console.log('\n未匹配的 ID 示例:');
    notMatchedIds.forEach((id, i) => {
      console.log(`  [${i+1}] ${id} (长度: ${id.length})`);
    });
  }

  // 4. 检查 commentDetails 中的姓名匹配情况
  const commentWorks = await prisma.studentWork.findMany({
    where: { commentDetails: { not: null } },
    select: { commentDetails: true },
    take: 1000
  });

  // 获取所有学生的 displayName
  const studentNodes = await prisma.graphNode.findMany({
    where: { nodeType: 'Student' },
    select: { id: true, displayName: true }
  });

  const nameToIdMap = new Map();
  const displayNameSet = new Set();
  studentNodes.forEach((n: any) => {
    if (n.displayName) {
      nameToIdMap.set(n.displayName.trim(), n.id);
      displayNameSet.add(n.displayName.trim());
    }
  });

  let allCommenterNames: string[] = [];
  commentWorks.forEach((w: any) => {
    if (w.commentDetails) {
      const comments = w.commentDetails.split('|').map((s: string) => s.trim()).filter(Boolean);
      comments.forEach((comment: string) => {
        const colonIdx = comment.indexOf(':');
        if (colonIdx > 0) {
          const name = comment.substring(0, colonIdx).trim();
          allCommenterNames.push(name);
        }
      });
    }
  });

  const uniqueCommenterNames = [...new Set(allCommenterNames)];
  let matchedByName = 0;
  let notMatchedByName = 0;
  const notMatchedNames: string[] = [];

  uniqueCommenterNames.forEach((name: string) => {
    if (nameToIdMap.has(name)) {
      matchedByName++;
    } else {
      notMatchedByName++;
      if (notMatchedNames.length < 15) notMatchedNames.push(name);
    }
  });

  console.log('\n=== commentDetails 姓名匹配情况 ===');
  console.log('总唯一评者姓名数:', uniqueCommenterNames.length);
  console.log('通过 displayName 匹配成功:', matchedByName);
  console.log('未匹配:', notMatchedByName);
  console.log('匹配率:', ((matchedByName / uniqueCommenterNames.length) * 100).toFixed(2) + '%');
  
  if (notMatchedNames.length > 0) {
    console.log('\n未匹配的姓名示例:');
    notMatchedNames.forEach((name, i) => {
      console.log(`  [${i+1}] "${name}"`);
    });
  }

  // 5. 模拟修复后的连线生成统计
  console.log('\n=== 修复后的连线生成预估 ===');
  
  let fixedLikeLinks = 0;
  let stillSkippedLikes = 0;
  
  works.forEach((w: any) => {
    if (w.likeDetails) {
      const ids = w.likeDetails.split(';').map((s: string) => s.trim()).filter(Boolean);
      ids.forEach((id: string) => {
        if (externalIdToNodeId.has(id)) {
          fixedLikeLinks++;
        } else {
          stillSkippedLikes++;
        }
      });
    }
  });

  let fixedCommentLinks = 0;
  let stillSkippedComments = 0;
  
  commentWorks.forEach((w: any) => {
    if (w.commentDetails) {
      const comments = w.commentDetails.split('|').map((s: string) => s.trim()).filter(Boolean);
      comments.forEach((comment: string) => {
        const colonIdx = comment.indexOf(':');
        if (colonIdx > 0) {
          const name = comment.substring(0, colonIdx).trim();
          if (nameToIdMap.has(name)) {
            fixedCommentLinks++;
          } else {
            stillSkippedComments++;
          }
        }
      });
    }
  });

  console.log('LIKE 连线（修复后）:', fixedLikeLinks);
  console.log('LIKE 仍跳过:', stillSkippedLikes);
  console.log('COMMENT 连线（修复后）:', fixedCommentLinks);
  console.log('COMMENT 仍跳过:', stillSkippedComments);
  console.log('总生生连线（修复后）:', fixedLikeLinks + fixedCommentLinks);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
