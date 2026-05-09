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

const KEEP_COUNT = 6;

async function main() {
  try {
    console.log('🧹 开始清理展示场景多余知识点...\n');

    // 1. 查询展示场景
    const scenario = await prisma.learningScenario.findUnique({
      where: { code: 'SHOW_CASE' },
    });

    if (!scenario) {
      console.log('❌ 展示场景不存在');
      return;
    }
    console.log(`📋 场景: ${scenario.nameZh} (${scenario.id})`);

    // 2. 查询该场景下的所有知识点
    const knowledgeNodes = await prisma.graphNode.findMany({
      where: {
        nodeType: 'Knowledge',
        scenarioId: scenario.id,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        displayName: true,
        createdAt: true,
      },
    });

    console.log(`📚 知识点总数: ${knowledgeNodes.length}`);

    if (knowledgeNodes.length <= KEEP_COUNT) {
      console.log(`✅ 知识点数量(${knowledgeNodes.length})已≤${KEEP_COUNT}，无需清理`);
      return;
    }

    // 3. 保留前6个，删除其余的
    const keepNodes = knowledgeNodes.slice(0, KEEP_COUNT);
    const deleteNodes = knowledgeNodes.slice(KEEP_COUNT);

    console.log(`\n💾 将保留知识点: ${keepNodes.length} 个`);
    keepNodes.forEach((node, idx) => {
      console.log(`  ${idx + 1}. ${node.displayName} (${node.id})`);
    });

    console.log(`\n🗑️  将删除知识点: ${deleteNodes.length} 个`);
    deleteNodes.forEach((node, idx) => {
      console.log(`  ${idx + 1}. ${node.displayName} (${node.id})`);
    });

    // 4. 删除多余知识点（级联删除关联数据）
    let deletedCount = 0;
    for (const node of deleteNodes) {
      try {
        // 删除相关的交互记录
        await prisma.interaction.deleteMany({
          where: {
            OR: [
              { sourceNodeId: node.id },
              { targetNodeId: node.id },
            ],
          },
        });

        // 删除学生-知识点关联
        await prisma.studentKnowledgeRelation.deleteMany({
          where: { knowledgeNodeId: node.id },
        });

        // 删除资源-知识点关联
        await prisma.resourceKnowledgeRelation.deleteMany({
          where: { knowledgeNodeId: node.id },
        });

        // 删除知识点节点（会自动级联删除knowledgeProfile）
        await prisma.graphNode.delete({
          where: { id: node.id },
        });

        deletedCount++;
        console.log(`  ✅ 已删除: ${node.displayName}`);
      } catch (error) {
        console.error(`  ❌ 删除失败 ${node.displayName}:`, error);
      }
    }

    // 5. 验证结果
    const remainingCount = await prisma.graphNode.count({
      where: {
        nodeType: 'Knowledge',
        scenarioId: scenario.id,
      },
    });

    console.log(`\n📊 清理完成:`);
    console.log(`  - 删除知识点: ${deletedCount} 个`);
    console.log(`  - 剩余知识点: ${remainingCount} 个`);

    console.log('\n✅ 全部完成!');

  } catch (error) {
    console.error('\n❌ 清理失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
