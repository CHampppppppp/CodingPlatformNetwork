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
  console.log('🔍 查询学生作品表中的点赞/评论数据...\n');

  // 1. student_works_test 表总记录数
  const totalWorks = await prisma.studentWork.count();
  console.log('=== student_works_test 表统计 ===');
  console.log('总记录数:', totalWorks);

  // 2. 有 likeDetails 的记录数
  const worksWithLikes = await prisma.studentWork.count({
    where: { likeDetails: { not: null } }
  });
  console.log('有 likeDetails 的记录数:', worksWithLikes);

  // 3. 有 commentDetails 的记录数
  const worksWithComments = await prisma.studentWork.count({
    where: { commentDetails: { not: null } }
  });
  console.log('有 commentDetails 的记录数:', worksWithComments);

  // 4. 两者都有的记录数
  const worksWithBoth = await prisma.studentWork.count({
    where: { 
      AND: [
        { likeDetails: { not: null } },
        { commentDetails: { not: null } }
      ]
    }
  });
  console.log('两者都有的记录数:', worksWithBoth);

  // 5. likeDetails 非空但 likeCount=0 的记录（数据不一致）
  const inconsistentLikes = await prisma.studentWork.count({
    where: {
      likeDetails: { not: null },
      likeCount: 0
    }
  });
  console.log('likeDetails 有数据但 likeCount=0 的记录数:', inconsistentLikes);

  // 6. commentDetails 非空但 commentCount=0 的记录
  const inconsistentComments = await prisma.studentWork.count({
    where: {
      commentDetails: { not: null },
      commentCount: 0
    }
  });
  console.log('commentDetails 有数据但 commentCount=0 的记录数:', inconsistentComments);

  // 7. 查看有社交数据的记录中的 likeCount/commentCount 分布
  console.log('\n=== 社交数据统计 ===');
  const socialWorks = await prisma.studentWork.findMany({
    where: {
      OR: [
        { likeDetails: { not: null } },
        { commentDetails: { not: null } }
      ]
    },
    select: {
      likeCount: true,
      commentCount: true
    }
  });

  const totalLikes = socialWorks.reduce((sum, w) => sum + w.likeCount, 0);
  const totalComments = socialWorks.reduce((sum, w) => sum + w.commentCount, 0);
  console.log('所有有社交数据的作品的 likeCount 总和:', totalLikes);
  console.log('所有有社交数据的作品的 commentCount 总和:', totalComments);
  console.log('平均每作品点赞数:', totalLikes / socialWorks.length);
  console.log('平均每作品评论数:', totalComments / socialWorks.length);

  // 8. 查看几条示例数据
  console.log('\n=== 示例数据（前3条）===');
  const samples = await prisma.studentWork.findMany({
    where: {
      OR: [
        { likeDetails: { not: null } },
        { commentDetails: { not: null } }
      ]
    },
    take: 3,
    include: {
      studentNode: {
        select: { displayName: true }
      }
    }
  });

  samples.forEach((w, i) => {
    console.log(`\n[${i+1}] 作品ID: ${w.id}`);
    console.log(`    作者: ${w.studentNode?.displayName || '未知'} (${w.studentNodeId})`);
    console.log(`    LikeCount: ${w.likeCount}, CommentCount: ${w.commentCount}`);
    console.log(`    LikeDetails: ${w.likeDetails ? w.likeDetails.substring(0, 80) : 'null'}${w.likeDetails && w.likeDetails.length > 80 ? '...' : ''}`);
    console.log(`    CommentDetails: ${w.commentDetails ? w.commentDetails.substring(0, 80) : 'null'}${w.commentDetails && w.commentDetails.length > 80 ? '...' : ''}`);
  });

  // 9. interactions_test 表中 actionType=LIKE/COMMENT 的记录数
  console.log('\n=== interactions_test 表统计 ===');
  const interactionLikes = await prisma.interaction.count({
    where: { actionType: 'LIKE' }
  });
  const interactionComments = await prisma.interaction.count({
    where: { actionType: 'COMMENT' }
  });
  console.log('actionType=LIKE 的记录数:', interactionLikes);
  console.log('actionType=COMMENT 的记录数:', interactionComments);

  // 10. 检查这些 LIKE/COMMENT 交互是否来自 student_works
  console.log('\n=== 交互来源分析 ===');
  const likeInteractions = await prisma.interaction.findMany({
    where: { actionType: 'LIKE' },
    take: 3,
    include: {
      sourceNode: { select: { nodeType: true, displayName: true } },
      targetNode: { select: { nodeType: true, displayName: true } }
    }
  });
  
  if (likeInteractions.length > 0) {
    console.log('LIKE 交互示例:');
    likeInteractions.forEach(i => {
      console.log(`  ${i.sourceNode.displayName} (${i.sourceNode.nodeType}) -> ${i.targetNode.displayName} (${i.targetNode.nodeType}), strength=${i.strength}`);
    });
  }

  const commentInteractions = await prisma.interaction.findMany({
    where: { actionType: 'COMMENT' },
    take: 3,
    include: {
      sourceNode: { select: { nodeType: true, displayName: true } },
      targetNode: { select: { nodeType: true, displayName: true } }
    }
  });
  
  if (commentInteractions.length > 0) {
    console.log('COMMENT 交互示例:');
    commentInteractions.forEach(i => {
      console.log(`  ${i.sourceNode.displayName} (${i.sourceNode.nodeType}) -> ${i.targetNode.displayName} (${i.targetNode.nodeType}), strength=${i.strength}`);
    });
  }

  console.log('\n✅ 查询完成');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
