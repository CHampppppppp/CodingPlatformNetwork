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
    console.log('🧹 开始清理展示场景多余知识点关联...\n');

    const scenario = await prisma.learningScenario.findUnique({
      where: { code: 'SHOW_CASE' },
    });

    if (!scenario) {
      console.log('❌ 展示场景不存在');
      return;
    }
    console.log(`📋 场景: ${scenario.nameZh} (${scenario.id})`);

    const knowledgeNodes = await prisma.graphNode.findMany({
      where: {
        nodeType: 'Knowledge',
        scenarioId: scenario.id,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        displayName: true,
      },
    });

    console.log(`📚 知识点总数: ${knowledgeNodes.length}`);

    if (knowledgeNodes.length <= KEEP_COUNT) {
      console.log(`✅ 知识点数量(${knowledgeNodes.length})已≤${KEEP_COUNT}，无需清理`);
      return;
    }

    const keepNodes = knowledgeNodes.slice(0, KEEP_COUNT);
    const deleteNodes = knowledgeNodes.slice(KEEP_COUNT);
    const deleteIds = deleteNodes.map((n) => n.id);

    console.log(`\n💾 保留知识点: ${keepNodes.length} 个`);
    keepNodes.forEach((node, idx) => {
      console.log(`  ${idx + 1}. ${node.displayName}`);
    });

    console.log(`\n🗑️  清理多余知识点关联: ${deleteNodes.length} 个`);
    deleteNodes.forEach((node, idx) => {
      console.log(`  ${idx + 1}. ${node.displayName}`);
    });

    let interactionCount = 0;
    let relationCount = 0;
    let resourceRelationCount = 0;

    for (const nodeId of deleteIds) {
      const interactionResult = await prisma.interaction.deleteMany({
        where: {
          OR: [
            { sourceNodeId: nodeId },
            { targetNodeId: nodeId },
          ],
        },
      });
      interactionCount += interactionResult.count;

      const relationResult = await prisma.studentKnowledgeRelation.deleteMany({
        where: { knowledgeNodeId: nodeId },
      });
      relationCount += relationResult.count;

      const resourceRelationResult = await prisma.resourceKnowledgeRelation.deleteMany({
        where: { knowledgeNodeId: nodeId },
      });
      resourceRelationCount += resourceRelationResult.count;
    }

    console.log(`\n📊 清理完成:`);
    console.log(`  - 删除交互记录: ${interactionCount} 条`);
    console.log(`  - 删除学生-知识点关联: ${relationCount} 条`);
    console.log(`  - 删除资源-知识点关联: ${resourceRelationCount} 条`);
    console.log(`  - 知识点节点: 未删除（仅删除关联）`);
    console.log(`  - 资源: 未删除`);

    console.log('\n✅ 全部完成!');

  } catch (error) {
    console.error('\n❌ 清理失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
