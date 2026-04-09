import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import * as dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaMssql(databaseUrl);
const prisma = new PrismaClient({ adapter });

const sampleKnowledgePoints = [
  {
    name: 'Word文档编辑',
    content: '掌握Word文档的基本编辑操作，包括文字输入、格式设置、段落调整等',
    category: '信息技术',
    type: '知识单元'
  },
  {
    name: 'Excel数据处理',
    content: '学习Excel表格的创建、数据录入、公式计算和图表制作',
    category: '信息技术',
    type: '知识点'
  },
  {
    name: '分数加减法',
    content: '掌握同分母和异分母分数加减法的计算方法和应用场景',
    category: '数学',
    type: '知识点'
  },
  {
    name: '网络基础知识',
    content: '了解互联网的基本概念、网络协议和网络安全常识',
    category: '信息技术',
    type: '知识单元'
  },
  {
    name: '人工智能入门',
    content: '认识人工智能的基本概念、应用领域和发展趋势',
    category: '信息技术',
    type: '知识点'
  }
];

async function seedKnowledgeData() {
  console.log('=== 开始初始化知识点数据 ===\n');

  const scenario = await prisma.learningScenario.findFirst({
    where: { code: 'SHOW_CASE' }
  });

  if (!scenario) {
    console.error('❌ 错误：找不到展示场景（SHOW_CASE），请先创建学习场景');
    await prisma.$disconnect();
    return;
  }

  console.log(`✓ 找到学习场景: ${scenario.nameZh} (ID: ${scenario.id})\n`);

  let createdCount = 0;

  for (const kp of sampleKnowledgePoints) {
    const existing = await prisma.graphNode.findFirst({
      where: {
        nodeType: 'Knowledge',
        displayName: kp.name,
        scenarioId: scenario.id
      }
    });

    if (existing) {
      console.log(`⏭️  跳过已存在的知识点: ${kp.name}`);
      continue;
    }

    const node = await prisma.graphNode.create({
      data: {
        nodeType: 'Knowledge',
        displayName: kp.name,
        scenarioId: scenario.id,
        knowledgeProfile: {
          create: {
            content: kp.content,
            knowledgeType: kp.type,
            category: kp.category
          }
        }
      },
      include: { knowledgeProfile: true }
    });

    console.log(`✓ 创建知识点: ${kp.name} (ID: ${node.id})`);
    createdCount++;
  }

  console.log(`\n=== 初始化完成 ===`);
  console.log(`✅ 成功创建 ${createdCount} 个知识点`);

  const totalKnowledge = await prisma.graphNode.count({
    where: { nodeType: 'Knowledge' }
  });
  console.log(`📊 数据库中知识点总数: ${totalKnowledge}`);

  await prisma.$disconnect();
}

seedKnowledgeData().catch(console.error);
