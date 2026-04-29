import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL!;
let prisma: PrismaClient;
if (dbUrl.startsWith('sqlserver://')) {
  prisma = new PrismaClient({ adapter: new PrismaMssql(dbUrl) });
} else {
  prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbUrl) });
}

const RESOURCE_POOL = [
  { title: '单元测试卷A', resourceType: 'PRACTICE', description: '基础概念与理解的综合测试，涵盖本单元核心知识点。' },
  { title: '单元测试卷B', resourceType: 'PRACTICE', description: '进阶应用与分析能力测试，包含案例分析和综合题。' },
  { title: '期中模拟试卷', resourceType: 'PRACTICE', description: '模拟真实考试环境，全面检验阶段性学习成果。' },
  { title: '微课精讲', resourceType: 'VIDEO', description: '15分钟精华微课，由名师梳理知识脉络与重难点。' },
  { title: '课堂实录', resourceType: 'VIDEO', description: '真实课堂教学录像，展示师生互动与知识讲解过程。' },
  { title: '教学课件', resourceType: 'DOCUMENT', description: '配套教学PPT课件，图文并茂，适合课堂演示与自学。' },
  { title: '学案导学', resourceType: 'DOCUMENT', description: '引导学生自主学习的学案，包含学习目标、预习任务和探究活动。' },
  { title: '趣味知识闯关', resourceType: 'GAME', description: '寓教于乐的知识闯关游戏，通过关卡挑战巩固所学内容。' },
  { title: '互动测评', resourceType: 'GAME', description: '实时在线互动测评系统，支持抢答、投票、即时反馈。' },
  { title: '拓展阅读', resourceType: 'ARTICLE', description: '精选拓展阅读材料，深入介绍知识点的应用场景与前沿发展。' },
  { title: '实验操作手册', resourceType: 'DOCUMENT', description: '详细的实验步骤指导，包含实验目的、器材准备、操作步骤和记录表。' },
  { title: '错题集', resourceType: 'PRACTICE', description: '精选易错题目汇编，附带详细解析和避坑指南。' },
  { title: '思维导图', resourceType: 'DOCUMENT', description: '结构化知识思维导图，帮助建立知识体系与逻辑框架。' },
  { title: '名师答疑视频', resourceType: 'VIDEO', description: '针对常见疑难问题的名师答疑视频，逐一击破学习障碍。' },
  { title: '小组合作项目', resourceType: 'GAME', description: '协作式学习项目任务，培养团队合作与问题解决能力。' },
];

function buildSearchUrl(title: string, type: string): string {
  const encoded = encodeURIComponent(title);
  switch (type) {
    case 'VIDEO':
      return `https://search.bilibili.com/all?keyword=${encoded}`;
    case 'ARTICLE':
      return `https://www.zhihu.com/search?type=content&q=${encoded}`;
    case 'DOCUMENT':
      return `https://wenku.baidu.com/search?word=${encoded}`;
    case 'PRACTICE':
    case 'GAME':
    default:
      return `https://cn.bing.com/search?q=${encoded}`;
  }
}

async function main() {
  try {
    console.log('🚀 开始批量创建mock教学资源...\n');

    const scenario = await prisma.learningScenario.findUnique({
      where: { code: 'SHOW_CASE' },
    });
    if (!scenario) {
      throw new Error('展示场景不存在');
    }

    const students = await prisma.graphNode.findMany({
      where: { scenarioId: scenario.id, nodeType: 'Student' },
      select: { id: true },
    });
    console.log(`👥 SHOW_CASE场景学生数: ${students.length}`);

    const knowledgeNodes = await prisma.graphNode.findMany({
      where: {
        scenarioId: scenario.id,
        nodeType: 'Knowledge',
      },
      select: { id: true, displayName: true },
    });
    console.log(`📚 SHOW_CASE场景知识点数: ${knowledgeNodes.length}`);

    let createdCount = 0;
    let rateCount = 0;
    const createdResources: Array<{ title: string; id: string }> = [];

    for (const knowledge of knowledgeNodes) {
      const numResources = 2 + Math.floor(Math.random() * 3);
      const shuffledPool = [...RESOURCE_POOL].sort(() => 0.5 - Math.random());
      const selectedTemplates = shuffledPool.slice(0, numResources);

      for (const tpl of selectedTemplates) {
        const uniqueSuffix = `-${knowledge.id.substring(0, 6)}`;
        const title = `${knowledge.displayName} - ${tpl.title}${uniqueSuffix}`;

        const existing = await prisma.resource.findFirst({
          where: { title },
        });
        if (existing) {
          continue;
        }

        const resource = await prisma.resource.create({
          data: {
            title,
            description: tpl.description,
            resourceType: tpl.resourceType,
            url: buildSearchUrl(title, tpl.resourceType),
            knowledgeRelations: {
              create: { knowledgeNodeId: knowledge.id },
            },
          },
        });

        createdResources.push({ title: resource.title, id: resource.id });
        createdCount++;

        const numRates = Math.floor(Math.random() * students.length * 0.6) + 1;
        const shuffledStudents = [...students].sort(() => 0.5 - Math.random());
        const selectedStudents = shuffledStudents.slice(0, numRates);

        for (const student of selectedStudents) {
          const rate = Number((2.5 + Math.random() * 2.5).toFixed(2));
          try {
            await prisma.studentResourceRate.create({
              data: {
                studentId: student.id,
                resourceId: resource.id,
                rate,
              },
            });
            rateCount++;
          } catch (e: any) {
            if (e?.code !== 'P2002') throw e;
          }
        }
      }
    }

    console.log(`\n✅ 创建资源: ${createdCount} 个`);
    console.log(`✅ 创建评分: ${rateCount} 条`);

    const totalResources = await prisma.resource.count();
    console.log(`📊 数据库资源总数: ${totalResources}`);

    const sampleResources = await prisma.resource.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: { title: true, resourceType: true },
    });
    console.log(`\n📋 最新资源示例:`);
    sampleResources.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.resourceType}] ${r.title}`);
    });

    console.log('\n✅ 全部完成!');

  } catch (error) {
    console.error('\n❌ 失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
