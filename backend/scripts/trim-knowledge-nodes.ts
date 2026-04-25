#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

let prisma: PrismaClient;
if (databaseUrl.startsWith('sqlserver://')) {
  const adapter = new PrismaMssql(databaseUrl);
  prisma = new PrismaClient({ adapter });
} else {
  const adapter = new PrismaMariaDb(databaseUrl);
  prisma = new PrismaClient({ adapter });
}

const SCENARIO_CODE = 'COLLABORATIVE_LEARNING';
const KNOWLEDGE_NODES_TO_KEEP = [
  'html语言',
  'html标签',
  '超链接',
  '基本标签',
  '文档整体属性',
  '文本标签',
  '格式排版',
  '多媒体',
  '表格',
  'html网页添加CSS',
];

async function main() {
  console.log('=== 开始精简知识点节点 ===');

  const scenario = await prisma.learningScenario.findUnique({
    where: { code: SCENARIO_CODE },
  });

  if (!scenario) {
    throw new Error(`场景 ${SCENARIO_CODE} 不存在`);
  }

  const allKnowledgeNodes = await prisma.graphNode.findMany({
    where: { nodeType: 'Knowledge', scenarioId: scenario.id },
    include: { knowledgeProfile: true },
  });

  console.log(`当前共有 ${allKnowledgeNodes.length} 个知识点节点`);

  const nodesToDelete = allKnowledgeNodes.filter(
    (node) => !KNOWLEDGE_NODES_TO_KEEP.includes(node.displayName)
  );

  console.log(`保留 ${KNOWLEDGE_NODES_TO_KEEP.length} 个核心知识点`);
  console.log(`将删除 ${nodesToDelete.length} 个知识点节点`);

  let deletedCount = 0;
  let skippedCount = 0;

  for (const node of nodesToDelete) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.resourceKnowledgeRelation.deleteMany({
          where: { knowledgeNodeId: node.id },
        });

        await tx.interaction.deleteMany({
          where: {
            OR: [
              { sourceNodeId: node.id },
              { targetNodeId: node.id },
            ],
          },
        });

        await tx.knowledgeProfile.deleteMany({
          where: { nodeId: node.id },
        });

        await tx.graphNode.delete({
          where: { id: node.id },
        });
      });

      deletedCount++;
      console.log(`✓ 删除: ${node.displayName}`);
    } catch (error) {
      skippedCount++;
      console.warn(`✗ 跳过 ${node.displayName}:`, error instanceof Error ? error.message : '未知错误');
    }
  }

  console.log(`\n=== 精简完成 ===`);
  console.log(`成功删除: ${deletedCount} 个节点`);
  console.log(`跳过: ${skippedCount} 个节点`);

  const remainingNodes = await prisma.graphNode.findMany({
    where: { nodeType: 'Knowledge', scenarioId: scenario.id },
    include: { knowledgeProfile: true },
    orderBy: { displayName: 'asc' },
  });

  console.log(`\n=== 保留的知识点节点 (${remainingNodes.length}个) ===`);
  remainingNodes.forEach((node) => {
    console.log(`  - ${node.displayName} (${node.knowledgeProfile?.category || '无分类'})`);
  });

  const remainingCount = await prisma.graphNode.count({
    where: { nodeType: 'Knowledge', scenarioId: scenario.id },
  });
  console.log(`\n当前知识点节点总数: ${remainingCount}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
