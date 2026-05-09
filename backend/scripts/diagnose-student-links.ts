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
  console.log('🔍 开始诊断生生交互数据...\n');

  // 1. 统计 interactions 表中各 actionType 的数量
  console.log('=== 1. interactions_test 表 actionType 分布 ===');
  const actionTypeStats = await prisma.$queryRaw`
    SELECT actionType, COUNT(*) as count, 
           SUM(CASE WHEN actionType IN ('LIKE', 'COMMENT') THEN 1 ELSE 0 END) as socialCount
    FROM interactions_test 
    GROUP BY actionType
  `;
  console.table(actionTypeStats);

  // 2. 详细查看 LIKE/COMMENT 交互记录
  console.log('\n=== 2. LIKE/COMMENT 交互详情（前10条）===');
  const socialInteractions = await prisma.interaction.findMany({
    where: {
      actionType: { in: ['LIKE', 'COMMENT'] },
    },
    take: 10,
    include: {
      sourceNode: {
        select: { id: true, nodeType: true, displayName: true, scenarioId: true },
      },
      targetNode: {
        select: { id: true, nodeType: true, displayName: true, scenarioId: true },
      },
      session: {
        select: { id: true, scenarioId: true, schoolId: true, gradeId: true, classId: true },
      },
    },
  });

  if (socialInteractions.length === 0) {
    console.log('⚠️  没有找到 LIKE/COMMENT 交互记录！');
  } else {
    for (const i of socialInteractions) {
      console.log(`\n交互ID: ${i.id}`);
      console.log(`  ActionType: ${i.actionType}`);
      console.log(`  Source: ${i.sourceNode.displayName} (type=${i.sourceNode.nodeType}, scenario=${i.sourceNode.scenarioId})`);
      console.log(`  Target: ${i.targetNode.displayName} (type=${i.targetNode.nodeType}, scenario=${i.targetNode.scenarioId})`);
      console.log(`  Session: ${i.session.id}`);
      console.log(`  Session scenario: ${i.session.scenarioId}`);
      console.log(`  Session class: ${i.session.classId}`);
      console.log(`  Strength: ${i.strength}`);
    }
  }

  // 3. 统计生生交互数量（source 和 target 都是 Student）
  console.log('\n=== 3. 生生交互统计 ===');
  const studentStudentCount = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM interactions_test i
    JOIN graph_nodes_test s ON i.sourceNodeId = s.id
    JOIN graph_nodes_test t ON i.targetNodeId = t.id
    WHERE s.nodeType = 'Student' AND t.nodeType = 'Student'
  `;
  console.log(`生生交互总数: ${studentStudentCount[0].count}`);

  // 按 actionType 分组统计生生交互
  const ssByActionType = await prisma.$queryRaw`
    SELECT i.actionType, COUNT(*) as count
    FROM interactions_test i
    JOIN graph_nodes_test s ON i.sourceNodeId = s.id
    JOIN graph_nodes_test t ON i.targetNodeId = t.id
    WHERE s.nodeType = 'Student' AND t.nodeType = 'Student'
    GROUP BY i.actionType
  `;
  console.log('\n按 actionType 分组的生生交互:');
  console.table(ssByActionType);

  // 4. 检查 session 分布
  console.log('\n=== 4. LIKE/COMMENT 交互的 Session 分布 ===');
  const sessionDistribution = await prisma.$queryRaw`
    SELECT s.id as sessionId, s.scenarioId, COUNT(*) as interactionCount,
           ls.code as scenarioCode, ls.nameZh as scenarioName
    FROM interactions_test i
    JOIN interaction_sessions_test s ON i.sessionId = s.id
    LEFT JOIN learning_scenarios_test ls ON s.scenarioId = ls.id
    WHERE i.actionType IN ('LIKE', 'COMMENT')
    GROUP BY s.id, s.scenarioId, ls.code, ls.nameZh
  `;
  console.table(sessionDistribution);

  // 5. 检查 sourceNode.scenarioId 与 session.scenarioId 是否一致
  console.log('\n=== 5. 数据一致性检查：sourceNode.scenarioId vs session.scenarioId ===');
  const consistencyCheck = await prisma.$queryRaw`
    SELECT COUNT(*) as mismatchCount
    FROM interactions_test i
    JOIN graph_nodes_test s ON i.sourceNodeId = s.id
    JOIN interaction_sessions_test sess ON i.sessionId = sess.id
    WHERE i.actionType IN ('LIKE', 'COMMENT')
      AND s.scenarioId != sess.scenarioId
  `;
  console.log(`LIKE/COMMENT 中 sourceNode.scenarioId ≠ session.scenarioId 的数量: ${consistencyCheck[0].mismatchCount}`);

  // 6. 检查 GraphService 的查询条件
  console.log('\n=== 6. 模拟 GraphService 查询条件 ===');
  
  // 获取所有场景
  const scenarios = await prisma.learningScenario.findMany({
    select: { id: true, code: true, nameZh: true },
  });
  
  for (const scenario of scenarios) {
    const sessions = await prisma.interactionSession.findMany({
      where: { scenarioId: scenario.id },
      select: { id: true, classId: true },
    });
    
    const sessionIds = sessions.map(s => s.id);
    
    if (sessionIds.length === 0) continue;
    
    // 查询该场景下有多少 LIKE/COMMENT 交互
    const count = await prisma.interaction.count({
      where: {
        sessionId: { in: sessionIds },
        actionType: { in: ['LIKE', 'COMMENT'] },
      },
    });
    
    // 加上 sourceNode.scenarioId 过滤（GraphService 中的逻辑）
    const countWithFilter = await prisma.interaction.count({
      where: {
        sessionId: { in: sessionIds },
        actionType: { in: ['LIKE', 'COMMENT'] },
        sourceNode: { scenarioId: scenario.id },
      },
    });
    
    console.log(`\n场景: ${scenario.nameZh} (${scenario.code})`);
    console.log(`  Sessions: ${sessionIds.length} 个`);
    console.log(`  LIKE/COMMENT 交互（仅 session 过滤）: ${count}`);
    console.log(`  LIKE/COMMENT 交互（+ sourceNode.scenarioId 过滤）: ${countWithFilter}`);
    
    if (count > 0 && countWithFilter === 0) {
      console.log(`  ⚠️  警告: sourceNode.scenarioId 过滤导致所有数据被排除！`);
    }
  }

  // 7. 检查 student_works 表的数据格式
  console.log('\n=== 7. student_works_test 表数据格式检查 ===');
  const works = await prisma.studentWork.findMany({
    where: {
      OR: [
        { likeDetails: { not: null } },
        { commentDetails: { not: null } },
      ],
    },
    take: 5,
    select: { id: true, likeDetails: true, commentDetails: true, studentNodeId: true },
  });
  
  if (works.length === 0) {
    console.log('⚠️  student_works_test 表中没有 likeDetails/commentDetails 数据');
  } else {
    for (const w of works) {
      console.log(`\nWork ID: ${w.id}, StudentNodeId: ${w.studentNodeId}`);
      console.log(`  likeDetails: ${w.likeDetails?.substring(0, 100)}...`);
      console.log(`  commentDetails: ${w.commentDetails?.substring(0, 100)}...`);
      
      // 检查格式：是 JSON 还是分号分隔
      const isJsonLike = w.likeDetails?.trim().startsWith('[') || w.likeDetails?.trim().startsWith('{');
      const isSemicolonLike = w.likeDetails?.includes(';');
      console.log(`  likeDetails 格式推测: ${isJsonLike ? 'JSON' : isSemicolonLike ? '分号分隔' : '其他'}`);
    }
  }

  console.log('\n✅ 诊断完成');
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
