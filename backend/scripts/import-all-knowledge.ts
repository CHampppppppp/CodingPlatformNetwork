#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaMssql(databaseUrl);
const prisma = new PrismaClient({ adapter });

interface KnowledgePoint {
  category: string;
  name: string;
  steps: string[];
  resourceUrl: string;
  textbookRef: string;
}

const csvFiles = [
  { file: '副本10.23 知识点梳理及推荐（网页）.csv', type: '网页' },
  { file: '副本10.23 知识点梳理及推荐（word）.csv', type: 'Word' },
  { file: '副本10.23 知识点梳理及推荐（ppt）.csv', type: 'PPT' },
  { file: '副本10.23 知识点梳理及推荐（海报）.csv', type: '海报' },
  { file: '副本10.23 知识点梳理及推荐（视频）.csv', type: '视频' },
  { file: '副本10.23 知识点梳理及推荐（名片）.csv', type: '名片' },
];

function parseKnowledgeCsv(filePath: string): KnowledgePoint[] {
  if (!fs.existsSync(filePath)) {
    console.warn(`文件不存在: ${filePath}`);
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, { columns: false, skip_empty_lines: true, trim: true, relaxQuotes: true, relaxColumnCount: true });
  const rows = records.slice(1);

  const knowledgePoints: KnowledgePoint[] = [];

  for (const row of rows) {
    const category = row[0]?.trim();
    const name = row[1]?.trim();
    const step1 = row[2]?.trim();
    const step2 = row[3]?.trim();
    const step3 = row[4]?.trim();
    const resourceUrl = row[5]?.trim();
    const textbookRef = row[6]?.trim();

    if (!name) continue;

    const steps = [step1, step2, step3].filter((s) => s && s.length > 0);

    knowledgePoints.push({
      category: category || '未分类',
      name,
      steps,
      resourceUrl,
      textbookRef,
    });
  }

  return knowledgePoints;
}

async function main() {
  console.log('🚀 开始导入知识点和资源...\n');

  const scenario = await prisma.learningScenario.findFirst({
    where: { code: 'COLLABORATIVE_LEARNING' },
  });

  if (!scenario) {
    console.error('❌ 未找到学习场景');
    await prisma.$disconnect();
    return;
  }

  let totalKnowledge = 0;
  let totalResources = 0;

  for (const { file, type } of csvFiles) {
    const filePath = path.resolve(__dirname, `../datas/script_filterd/${file}`);
    const knowledgePoints = parseKnowledgeCsv(filePath);

    console.log(`📁 ${file}: 解析到 ${knowledgePoints.length} 个知识点`);

    for (const kp of knowledgePoints) {
      const existingKnowledge = await prisma.graphNode.findFirst({
        where: {
          nodeType: 'Knowledge',
          displayName: kp.name,
          scenarioId: scenario.id,
        },
      });

      const knowledgeNode =
        existingKnowledge ||
        (await prisma.graphNode.create({
          data: {
            nodeType: 'Knowledge',
            displayName: kp.name,
            scenarioId: scenario.id,
            knowledgeProfile: {
              create: {
                category: kp.category,
                knowledgeType: type,
                content: kp.steps.join('\n'),
              },
            },
          },
        }));

      if (!existingKnowledge) {
        totalKnowledge++;
      }

      if (kp.resourceUrl) {
        const resourceType = kp.resourceUrl.includes('b23.tv')
          ? 'VIDEO'
          : kp.resourceUrl.includes('k.zjer.cn')
            ? 'VIDEO'
            : 'ARTICLE';

        const existingResource = await prisma.resource.findFirst({
          where: { url: kp.resourceUrl },
        });

        const resource =
          existingResource ||
          (await prisma.resource.create({
            data: {
              title: `${kp.name} - 教学资源`,
              url: kp.resourceUrl,
              resourceType,
              description: `教材参考: ${kp.textbookRef || '无'}`,
            },
          }));

        if (!existingResource) {
          totalResources++;
        }

        const existingRelation = await prisma.resourceKnowledgeRelation.findFirst({
          where: {
            resourceId: resource.id,
            knowledgeNodeId: knowledgeNode.id,
          },
        });

        if (!existingRelation) {
          await prisma.resourceKnowledgeRelation.create({
            data: {
              resourceId: resource.id,
              knowledgeNodeId: knowledgeNode.id,
            },
          });
        }
      }
    }
  }

  console.log(`\n✅ 导入完成`);
  console.log(`   新增知识点: ${totalKnowledge}`);
  console.log(`   新增资源: ${totalResources}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ 导入失败:', err);
  process.exit(1);
});
