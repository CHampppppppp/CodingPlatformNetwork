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

interface ExtractedResource {
  url: string;
  title: string;
  type: string;
  prompt: string;
}

function normalizeUrl(raw: string): string {
  return raw.trim().replace(/[\)\]>\"]+$/g, '').replace(/^[\"\[<\(]+/g, '');
}

function inferResourceType(url: string): string {
  if (url.includes('b23.tv') || url.includes('bilibili')) return 'VIDEO';
  if (url.includes('k.zjer.cn')) return 'VIDEO';
  if (url.includes('kdocs.cn')) return 'DOCUMENT';
  if (url.startsWith('浙教版')) return 'DOCUMENT';
  return 'ARTICLE';
}

function extractTitle(url: string, prompt: string): string {
  if (url.startsWith('浙教版')) return url;
  if (url.includes('b23.tv')) return 'B站教程视频';
  if (url.includes('k.zjer.cn')) {
    if (prompt.includes('html') || prompt.includes('网页')) return '网页制作教学视频';
    return '之江汇课程资源';
  }
  if (url.includes('kdocs.cn')) return '金山文档教程';
  return '网络学习资源';
}

function extractResourcesFromCsv(): ExtractedResource[] {
  const csvPath = path.resolve(__dirname, '../datas/filterd/埋点数据_接入省科技平台_user_id非空_转换后.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(content, { columns: false, skip_empty_lines: true, trim: true });
  const resources: ExtractedResource[] = [];

  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    const type = parseInt(row[3], 10);
    if (type !== 3 && type !== 4 && type !== 7 && type !== 9) continue;

    const metaStr = row[4];
    if (!metaStr) continue;

    try {
      const meta = JSON.parse(metaStr);
      let prompt = '';
      const urls: string[] = [];

      if (type === 7 || type === 9) {
        if (meta.videoUrl) urls.push(normalizeUrl(meta.videoUrl));
        if (meta.text_book) urls.push(normalizeUrl(meta.text_book));
      } else if (meta.content) {
        prompt = (meta.content.prompt || '').replace(/\s+/g, ' ').trim();
        const answer = meta.content.answer || '';
        const hrefMatches = answer.match(/href=[\"']([^\"']+)[\"']/g);
        if (hrefMatches) {
          hrefMatches.forEach((m: string) => {
            const url = normalizeUrl(m.replace(/href=[\"']/g, '').replace(/[\"']$/g, ''));
            if (url) urls.push(url);
          });
        }
        const textbookMatches = answer.match(/浙教版[^<\n]+/g);
        if (textbookMatches) {
          textbookMatches.forEach((m: string) => urls.push(normalizeUrl(m)));
        }
      }

      const basePrompt = prompt || meta.name || 'unknown';
      urls.forEach((url) => {
        if (!url) return;
        resources.push({
          url,
          title: extractTitle(url, basePrompt),
          type: inferResourceType(url),
          prompt: basePrompt,
        });
      });
    } catch (_e) {}
  }

  return resources;
}

function matchKnowledgeNode(prompt: string, knowledgeNodes: { id: string; displayName: string }[]): string | null {
  const p = prompt.toLowerCase();

  const keywordMap: Record<string, string[]> = {
    'html语言': ['html', '网页', '查看网页', '源代码', '开发人员工具'],
    'html标签': ['html', '标签', '网页结构'],
    '编写网页': ['网页', '制作网页', '校园网页', 'web'],
    '基本标签': ['标签', 'html基础', '基本标签'],
    '文本标签': ['文本', '文字格式', '字体'],
    '格式排版': ['排版', '格式', '段落', '换行'],
    '超链接': ['链接', '超链接', '跳转'],
    '多媒体': ['图片', '音乐', '视频', '媒体'],
    '表格': ['表格', 'table'],
    'html网页添加CSS': ['css', '样式', '颜色', '背景色', '装饰'],
    '文档整体属性': ['文档', '页面属性', '整体'],
    '互联网应用的数据传输': ['传输', '数据', '互联网'],
  };

  for (const [kname, keywords] of Object.entries(keywordMap)) {
    if (keywords.some((kw) => p.includes(kw))) {
      const node = knowledgeNodes.find((n) => n.displayName === kname);
      if (node) return node.id;
    }
  }

  return null;
}

async function main() {
  const rawResources = extractResourcesFromCsv();
  console.log(`📄 CSV 中提取到 ${rawResources.length} 条资源推荐记录`);

  const uniqueResources = new Map<string, ExtractedResource>();
  rawResources.forEach((r) => {
    if (!uniqueResources.has(r.url)) {
      uniqueResources.set(r.url, r);
    }
  });
  console.log(`🔍 去重后得到 ${uniqueResources.size} 个唯一资源`);

  const knowledgeNodes = await prisma.graphNode.findMany({
    where: { nodeType: 'Knowledge' },
    select: { id: true, displayName: true },
  });
  console.log(`📚 数据库中有 ${knowledgeNodes.length} 个知识点节点`);

  let fallbackNode = await prisma.graphNode.findFirst({
    where: { nodeType: 'Knowledge', displayName: '向世界介绍我的学校' },
    select: { id: true },
  });

  if (!fallbackNode) {
    const defaultScenario = await prisma.learningScenario.findFirst({
      where: { code: 'COLLABORATIVE_LEARNING' },
    });

    if (defaultScenario) {
      const school = await prisma.school.findFirst();
      fallbackNode = await prisma.graphNode.create({
        data: {
          nodeType: 'Knowledge',
          displayName: '向世界介绍我的学校',
          scenarioId: defaultScenario.id,
          schoolId: school?.id,
          knowledgeProfile: {
            create: {
              category: '主题活动',
              knowledgeType: 'project',
            },
          },
        },
      });
      console.log(`➕ 创建项目知识点节点: 向世界介绍我的学校`);
    }
  }

  const resourceMap = new Map<string, { dbId: string; knowledgeNodeId: string }>();

  for (const [url, res] of uniqueResources.entries()) {
    let knowledgeNodeId = matchKnowledgeNode(res.prompt, knowledgeNodes);
    if (!knowledgeNodeId && fallbackNode) {
      knowledgeNodeId = fallbackNode.id;
    }
    if (!knowledgeNodeId) {
      console.warn(`⚠️ 无法为资源匹配知识点节点: ${url}`);
      continue;
    }

    const existingResource = await prisma.resource.findFirst({
      where: { url },
    });

    const dbResource =
      existingResource ||
      (await prisma.resource.create({
        data: {
          title: res.title,
          url: res.url,
          resourceType: res.type,
          description: `来源埋点数据：${res.prompt.substring(0, 50)}`,
        },
      }));

    if (!existingResource) {
      console.log(`➕ 创建资源: ${res.title} (${res.type})`);
    }

    const existingRelation = await prisma.resourceKnowledgeRelation.findFirst({
      where: { resourceId: dbResource.id, knowledgeNodeId },
    });

    if (!existingRelation) {
      await prisma.resourceKnowledgeRelation.create({
        data: { resourceId: dbResource.id, knowledgeNodeId },
      });
    }

    resourceMap.set(url, { dbId: dbResource.id, knowledgeNodeId });
  }

  console.log(`✅ 成功入库 ${resourceMap.size} 个资源并关联知识点`);

  const students = await prisma.graphNode.findMany({
    where: { nodeType: 'Student' },
    select: { id: true },
  });
  console.log(`🧑‍🎓 数据库中有 ${students.length} 个学生节点`);

  const session = await prisma.interactionSession.findFirst({
    orderBy: { occurredAt: 'desc' },
  });

  if (!session) {
    console.error('❌ 未找到交互会话，无法创建交互记录');
    await prisma.$disconnect();
    return;
  }

  const resourceEntries = Array.from(resourceMap.values());
  let interactionCount = 0;

  for (const student of students) {
    const numRecommendations = Math.floor(Math.random() * 3) + 2;
    const shuffled = [...resourceEntries].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, numRecommendations);

    for (const entry of selected) {
      const existingInteraction = await prisma.interaction.findFirst({
        where: {
          sessionId: session.id,
          sourceNodeId: student.id,
          targetNodeId: entry.knowledgeNodeId,
          actionType: 'RESOURCE_RECOMMENDATION',
        },
      });

      if (!existingInteraction) {
        await prisma.interaction.create({
          data: {
            sessionId: session.id,
            sourceNodeId: student.id,
            targetNodeId: entry.knowledgeNodeId,
            interactionType: 'PLATFORM',
            actionType: 'RESOURCE_RECOMMENDATION',
            strength: Math.floor(Math.random() * 3) + 1,
          },
        });
        interactionCount++;
      }
    }
  }

  console.log(`🔗 创建 ${interactionCount} 条学生-知识点资源推荐交互`);
  console.log('\n✅ 模拟数据生成完成');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ 生成失败:', err);
  process.exit(1);
});
