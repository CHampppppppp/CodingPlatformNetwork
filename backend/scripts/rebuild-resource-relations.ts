#!/usr/bin/env ts-node
/**
 * 根据 datas/5.5 目录下的知识点数据重新创建资源关联
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
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

// 资源类型映射
function mapResourceType(type: string): string {
  const typeMap: Record<string, string> = {
    'VIDEO': 'VIDEO',
    '视频': 'VIDEO',
    'ARTICLE': 'ARTICLE',
    '文章': 'ARTICLE',
    'DOCUMENT': 'DOCUMENT',
    '文档': 'DOCUMENT',
    'PRACTICE': 'PRACTICE',
    '练习题': 'PRACTICE',
    '练习': 'PRACTICE',
    'GAME': 'GAME',
    '互动游戏': 'GAME',
    '游戏': 'GAME',
  };
  return typeMap[type?.toUpperCase()] || 'DOCUMENT';
}

// 读取CSV文件
function readCSV(filePath: string): any[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relaxQuotes: true,
    relaxColumnCount: true,
  });
}

// 读取Markdown文件中的资源
function readMarkdownResources(filePath: string): Map<string, any[]> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const resources = new Map<string, any[]>();
  
  const lines = content.split('\n');
  let currentDimension = '';
  
  for (const line of lines) {
    // 匹配维度标题
    const dimMatch = line.match(/### 【(.+)】/);
    if (dimMatch) {
      currentDimension = dimMatch[1];
      resources.set(currentDimension, []);
      continue;
    }
    
    // 匹配表格行
    const rowMatch = line.match(/\| (.+) \| (.+) \| (.+) \| (.+) \|/);
    if (rowMatch && currentDimension && !line.includes('---')) {
      const [_, url, title, type, description] = rowMatch;
      const resourceList = resources.get(currentDimension) || [];
      resourceList.push({
        url: url.trim(),
        title: title.trim(),
        type: mapResourceType(type.trim()),
        description: description.trim(),
      });
      resources.set(currentDimension, resourceList);
    }
  }
  
  return resources;
}

async function main() {
  console.log('🚀 开始重新创建资源关联...\n');

  const dataDir = path.resolve(__dirname, '../datas/5.5');

  // 1. 获取所有场景
  const scenarios = await prisma.learningScenario.findMany({
    where: { isActive: true },
  });
  console.log(`📊 活跃场景数: ${scenarios.length}\n`);

  // 2. 读取CSV文件
  const csvFiles = [
    '副本10.23 知识点梳理及推荐（word）.csv',
    '副本10.23 知识点梳理及推荐（ppt）.csv',
    '副本10.23 知识点梳理及推荐（网页）.csv',
    '副本10.23 知识点梳理及推荐（海报）.csv',
    '副本10.23 知识点梳理及推荐（视频）.csv',
    '副本10.23 知识点梳理及推荐（名片）.csv',
  ];

  // 收集所有知识点和对应的资源
  const knowledgeResources = new Map<string, any[]>();
  
  for (const file of csvFiles) {
    const filePath = path.join(dataDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ 文件不存在: ${file}`);
      continue;
    }

    const records = readCSV(filePath);
    console.log(`📄 ${file}: ${records.length} 条记录`);

    for (const record of records) {
      const knowledgeName = record['具体知识点']?.trim();
      const resourceUrl = record['资源（视频、文本、图片等）链接']?.trim();
      
      if (!knowledgeName || !resourceUrl) continue;
      
      const resources = knowledgeResources.get(knowledgeName) || [];
      resources.push({
        url: resourceUrl,
        title: `${knowledgeName} - 学习资源`,
        type: 'VIDEO', // 默认视频类型，因为大多是B站链接
        description: `关于"${knowledgeName}"的学习资源`,
      });
      knowledgeResources.set(knowledgeName, resources);
    }
  }

  // 3. 读取Markdown中的认知维度资源
  const mdFilePath = path.join(dataDir, '知识点-资源关联.md');
  if (fs.existsSync(mdFilePath)) {
    console.log('\n📄 读取认知维度资源...');
    const dimensionResources = readMarkdownResources(mdFilePath);
    console.log(`认知维度数: ${dimensionResources.size}`);
    
    // 这里需要将认知维度资源关联到对应的知识节点
    // 暂时跳过，先处理CSV中的资源
  }

  console.log(`\n📊 共收集 ${knowledgeResources.size} 个知识点的资源\n`);

  // 4. 删除旧的资源关联（但不删除资源本身，除非需要）
  console.log('🗑️  删除旧的资源-知识节点关联...');
  const deletedRelations = await prisma.resourceKnowledgeRelation.deleteMany({});
  console.log(`  已删除 ${deletedRelations.count} 条旧关联\n`);

  // 5. 为每个场景的知识节点创建资源关联
  let totalCreated = 0;
  let totalLinked = 0;

  for (const scenario of scenarios) {
    console.log(`📌 处理场景: ${scenario.nameZh}`);

    // 获取该场景下的知识节点
    const knowledgeNodes = await prisma.graphNode.findMany({
      where: {
        nodeType: 'Knowledge',
        scenarioId: scenario.id,
      },
      select: { id: true, displayName: true },
    });

    console.log(`  知识节点数: ${knowledgeNodes.length}`);

    if (knowledgeNodes.length === 0) {
      console.log('  ⚠️ 无知识节点，跳过\n');
      continue;
    }

    for (const node of knowledgeNodes) {
      // 查找匹配的资源
      const resources = knowledgeResources.get(node.displayName);
      
      if (!resources || resources.length === 0) {
        console.log(`  ⚠️ 知识节点 "${node.displayName}" 无对应资源`);
        continue;
      }

      for (const resourceData of resources) {
        // 检查是否已存在相同URL的资源
        let resource = await prisma.resource.findFirst({
          where: { url: resourceData.url },
        });

        if (!resource) {
          // 创建新资源
          resource = await prisma.resource.create({
            data: {
              title: resourceData.title,
              description: resourceData.description,
              resourceType: resourceData.type,
              url: resourceData.url,
            },
          });
          totalCreated++;
        }

        // 创建关联
        try {
          await prisma.resourceKnowledgeRelation.create({
            data: {
              resourceId: resource.id,
              knowledgeNodeId: node.id,
            },
          });
          totalLinked++;
        } catch (e: any) {
          if (e.code === 'P2002') {
            // 关联已存在，跳过
            console.log(`    关联已存在: ${resource.title} <-> ${node.displayName}`);
          } else {
            throw e;
          }
        }
      }
    }

    console.log('');
  }

  // 6. 统计结果
  const totalResources = await prisma.resource.count();
  const totalRelations = await prisma.resourceKnowledgeRelation.count();

  console.log('\n✅ 完成!');
  console.log(`📊 统计:`);
  console.log(`  - 新建资源: ${totalCreated}`);
  console.log(`  - 新建关联: ${totalLinked}`);
  console.log(`  - 资源总数: ${totalResources}`);
  console.log(`  - 关联总数: ${totalRelations}`);
}

main()
  .catch((error) => {
    console.error('\n❌ 失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
