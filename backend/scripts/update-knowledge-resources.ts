#!/usr/bin/env ts-node
/**
 * 根据 datas/5.5 目录下的知识点CSV和MD文件更新资源关联
 * 处理逻辑：
 * 1. 读取6个CSV文件，提取具体知识点和对应的资源URL
 * 2. 读取MD文件，提取认知维度资源（带类型和描述）
 * 3. 为CSV中的资源创建/更新Resource记录，并关联到对应的知识点节点
 * 4. 为MD中的资源创建/更新Resource记录；若对应的认知维度知识点节点不存在，则先创建
 */
import { PrismaClient } from '@prisma/client';
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

function mapResourceType(type: string): string {
  const typeMap: Record<string, string> = {
    'VIDEO': 'VIDEO',
    '视频': 'VIDEO',
    'ARTICLE': 'ARTICLE',
    '文章': 'ARTICLE',
    'DOCUMENT': 'DOCUMENT',
    '文档': 'DOCUMENT',
    'PRACTICE': 'PRACTICE',
    '练习': 'PRACTICE',
    '练习题': 'PRACTICE',
    'GAME': 'GAME',
    '游戏': 'GAME',
    '互动游戏': 'GAME',
  };
  return typeMap[type?.toUpperCase()] || 'DOCUMENT';
}

function inferResourceTypeFromUrl(url: string): string {
  if (!url) return 'DOCUMENT';
  const lower = url.toLowerCase();
  if (lower.includes('bilibili.com') || lower.includes('b23.tv')) {
    return 'VIDEO';
  }
  if (lower.includes('zhihu.com') || lower.includes('baijiahao.baidu.com')) {
    return 'ARTICLE';
  }
  if (lower.includes('k.zjer.cn') || lower.includes('courseteaching')) {
    return 'VIDEO';
  }
  if (lower.includes('wenku.baidu.com') || lower.includes('book118.com') || lower.includes('renrendoc.com')) {
    return 'DOCUMENT';
  }
  if (lower.includes('kdocs.cn') || lower.includes('docer.kdocs.cn')) {
    return 'DOCUMENT';
  }
  if (lower.includes('baike.baidu.com')) {
    return 'ARTICLE';
  }
  if (lower.includes('image.baidu.com')) {
    return 'DOCUMENT';
  }
  if (lower.includes('mp.weixin.qq.com')) {
    return 'ARTICLE';
  }
  if (lower.includes('cloud.tencent.com') || lower.includes('developer.baidu.com') || lower.includes('runoob.com')) {
    return 'DOCUMENT';
  }
  if (lower.includes('moe.gov.cn') || lower.includes('xiyi.edu.cn')) {
    return 'ARTICLE';
  }
  if (lower.includes('ruiwen.com') || lower.includes('easylearn.baidu.com')) {
    return 'PRACTICE';
  }
  return 'DOCUMENT';
}

function truncateUrl(url: string, maxLength: number = 191): string {
  if (!url || url.length <= maxLength) return url;
  return url.substring(0, maxLength);
}

function readCSV(filePath: string): any[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relaxQuotes: true,
    relaxColumnCount: true,
  });
}

function readMarkdownResources(filePath: string): Map<string, any[]> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const resources = new Map<string, any[]>();
  
  const lines = content.split('\n');
  let currentDimension = '';
  
  for (const line of lines) {
    const dimMatch = line.match(/### 【(.+)】/);
    if (dimMatch) {
      currentDimension = dimMatch[1];
      resources.set(currentDimension, []);
      continue;
    }
    
    const rowMatch = line.match(/\| (.+) \| (.+) \| (.+) \| (.+) \|/);
    if (rowMatch && currentDimension && !line.includes('---')) {
      const [_, url, title, type, description] = rowMatch;
      const trimmedUrl = url.trim();
      const trimmedTitle = title.trim();
      if (trimmedUrl === '#' || trimmedUrl === 'URL' || trimmedUrl === '链接' ||
          trimmedTitle === '标题' || trimmedTitle === 'Title' || trimmedTitle === '名称') {
        continue;
      }
      const resourceList = resources.get(currentDimension) || [];
      resourceList.push({
        url: trimmedUrl,
        title: trimmedTitle,
        type: mapResourceType(type.trim()),
        description: description.trim(),
      });
      resources.set(currentDimension, resourceList);
    }
  }
  
  return resources;
}

async function main() {
  console.log('🚀 开始更新知识点与资源关联...\n');

  const dataDir = path.resolve(__dirname, '../datas/5.5');

  const scenarios = await prisma.learningScenario.findMany({
    where: { isActive: true },
  });
  console.log(`📊 活跃场景数: ${scenarios.length}`);
  
  const showCaseScenario = scenarios.find(s => s.code === 'SHOW_CASE');
  const targetScenario = showCaseScenario || scenarios[0];
  if (!targetScenario) {
    throw new Error('没有可用的学习场景');
  }
  console.log(`📌 目标场景: ${targetScenario.code} (${targetScenario.nameZh})\n`);

  const csvFiles = [
    '副本10.23 知识点梳理及推荐（word）.csv',
    '副本10.23 知识点梳理及推荐（ppt）.csv',
    '副本10.23 知识点梳理及推荐（网页）.csv',
    '副本10.23 知识点梳理及推荐（海报）.csv',
    '副本10.23 知识点梳理及推荐（视频）.csv',
    '副本10.23 知识点梳理及推荐（名片）.csv',
  ];

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
      if (!resources.some((r: any) => r.url === resourceUrl)) {
        resources.push({
          url: resourceUrl,
          title: `${knowledgeName} - 学习资源`,
          type: inferResourceTypeFromUrl(resourceUrl),
          description: `关于"${knowledgeName}"的学习资源`,
          source: 'csv',
        });
        knowledgeResources.set(knowledgeName, resources);
      }
    }
  }

  console.log(`\n📊 CSV中共收集 ${knowledgeResources.size} 个知识点的资源`);

  const mdFilePath = path.join(dataDir, '知识点-资源关联.md');
  const mdDimensionResources = new Map<string, any[]>();
  if (fs.existsSync(mdFilePath)) {
    console.log('\n📄 读取认知维度资源...');
    const dimensionResources = readMarkdownResources(mdFilePath);
    console.log(`认知维度数: ${dimensionResources.size}`);
    
    for (const [dimension, resources] of dimensionResources.entries()) {
      console.log(`  - ${dimension}: ${resources.length} 个资源`);
      mdDimensionResources.set(dimension, resources);
    }
  }

  const allKnowledgeNodes = await prisma.graphNode.findMany({
    where: {
      nodeType: 'Knowledge',
      scenarioId: targetScenario.id,
    },
    select: { id: true, displayName: true },
  });

  console.log(`\n📚 数据库中知识节点数: ${allKnowledgeNodes.length}`);

  const nodeMap = new Map<string, typeof allKnowledgeNodes[0]>();
  for (const node of allKnowledgeNodes) {
    nodeMap.set(node.displayName, node);
  }

  console.log('\n🔧 检查并创建认知维度知识节点...');
  const mdDimensionNodes = new Map<string, typeof allKnowledgeNodes[0]>();
  
  for (const dimension of mdDimensionResources.keys()) {
    let node = nodeMap.get(dimension);
    if (!node) {
      const newNode = await prisma.graphNode.create({
        data: {
          nodeType: 'Knowledge',
          displayName: dimension,
          scenarioId: targetScenario.id,
          knowledgeProfile: {
            create: {
              category: '认知维度',
              knowledgeType: 'dimension',
            },
          },
        },
      });
      node = { id: newNode.id, displayName: newNode.displayName };
      nodeMap.set(dimension, node);
      console.log(`  ✨ 创建知识节点: ${dimension}`);
    } else {
      console.log(`  ✓ 已存在: ${dimension}`);
    }
    mdDimensionNodes.set(dimension, node);
  }

  console.log('\n🗑️  删除旧的资源-知识节点关联...');
  const deletedRelations = await prisma.resourceKnowledgeRelation.deleteMany({});
  console.log(`  已删除 ${deletedRelations.count} 条旧关联\n`);

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalLinked = 0;
  let csvLinked = 0;
  let mdLinked = 0;

  console.log('📌 处理CSV文件中的资源关联...');
  for (const [knowledgeName, resources] of knowledgeResources.entries()) {
    const node = nodeMap.get(knowledgeName);
    
    if (!node) {
      console.log(`  ⚠️ 知识节点 "${knowledgeName}" 在数据库中不存在，跳过`);
      continue;
    }

    for (const resourceData of resources) {
      let resource = await prisma.resource.findFirst({
        where: { url: truncateUrl(resourceData.url) },
      });

      if (!resource) {
        resource = await prisma.resource.create({
          data: {
            title: resourceData.title,
            description: resourceData.description,
            resourceType: resourceData.type,
            url: truncateUrl(resourceData.url),
          },
        });
        totalCreated++;
      } else {
        resource = await prisma.resource.update({
          where: { id: resource.id },
          data: {
            title: resourceData.title,
            description: resourceData.description,
            resourceType: resourceData.type,
            url: truncateUrl(resourceData.url),
          },
        });
        totalUpdated++;
      }

      try {
        await prisma.resourceKnowledgeRelation.create({
          data: {
            resourceId: resource.id,
            knowledgeNodeId: node.id,
          },
        });
        totalLinked++;
        csvLinked++;
      } catch (e: any) {
        if (e.code === 'P2002') {
          console.log(`    关联已存在: ${resource.title} <-> ${node.displayName}`);
        } else {
          throw e;
        }
      }
    }
  }

  console.log('\n📌 处理MD文件中的认知维度资源关联...');
  for (const [dimension, resources] of mdDimensionResources.entries()) {
    const node = mdDimensionNodes.get(dimension);
    
    if (!node) {
      console.log(`  ⚠️ 认知维度 "${dimension}" 的知识节点不存在，跳过`);
      continue;
    }

    for (const resourceData of resources) {
      let resource = await prisma.resource.findFirst({
        where: { url: truncateUrl(resourceData.url) },
      });

      if (!resource) {
        resource = await prisma.resource.create({
          data: {
            title: resourceData.title,
            description: resourceData.description,
            resourceType: resourceData.type,
            url: truncateUrl(resourceData.url),
          },
        });
        totalCreated++;
      } else {
        resource = await prisma.resource.update({
          where: { id: resource.id },
          data: {
            title: resourceData.title,
            description: resourceData.description,
            resourceType: resourceData.type,
            url: truncateUrl(resourceData.url),
          },
        });
        totalUpdated++;
      }

      try {
        await prisma.resourceKnowledgeRelation.create({
          data: {
            resourceId: resource.id,
            knowledgeNodeId: node.id,
          },
        });
        totalLinked++;
        mdLinked++;
      } catch (e: any) {
        if (e.code === 'P2002') {
          console.log(`    关联已存在: ${resource.title} <-> ${node.displayName}`);
        } else {
          throw e;
        }
      }
    }
  }

  const totalResources = await prisma.resource.count();
  const totalRelations = await prisma.resourceKnowledgeRelation.count();
  const totalKnowledgeNodes = await prisma.graphNode.count({
    where: { nodeType: 'Knowledge', scenarioId: targetScenario.id },
  });

  console.log('\n✅ 完成!');
  console.log(`📊 统计:`);
  console.log(`  - 知识点节点总数: ${totalKnowledgeNodes}`);
  console.log(`  - 新建资源: ${totalCreated}`);
  console.log(`  - 更新资源: ${totalUpdated}`);
  console.log(`  - 新建关联: ${totalLinked}`);
  console.log(`    - CSV关联: ${csvLinked}`);
  console.log(`    - MD关联: ${mdLinked}`);
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
