#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import path from 'path';

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

// 知识点数据
const KNOWLEDGE_POINTS = [
  {
    displayName: '人工智能基础概念',
    content: '了解人工智能的定义、发展历程及基本应用领域，包括机器学习、深度学习等核心概念。',
    knowledgeType: '知识单元',
    category: '人工智能',
  },
  {
    displayName: '提示词工程',
    content: '掌握与大语言模型交互的提示词设计技巧，包括角色设定、任务描述、约束条件等要素。',
    knowledgeType: '知识点',
    category: '人工智能',
  },
  {
    displayName: '数据可视化',
    content: '学习使用图表、图形等方式呈现数据，理解柱状图、折线图、饼图等常见可视化形式的适用场景。',
    knowledgeType: '知识点',
    category: '数据处理',
  },
  {
    displayName: '信息甄别与验证',
    content: '培养对网络信息的批判性思维，学会识别虚假信息、验证信息来源的可靠性。',
    knowledgeType: '知识单元',
    category: '信息素养',
  },
  {
    displayName: '算法思维',
    content: '理解算法的基本概念，学习用流程图描述问题解决步骤，培养逻辑思维能力。',
    knowledgeType: '知识点',
    category: '计算思维',
  },
];

// 资源模板
const RESOURCE_TEMPLATES = [
  { titleSuffix: '入门视频教程', resourceType: 'VIDEO', description: '通过生动有趣的动画讲解核心概念' },
  { titleSuffix: '实践操作指南', resourceType: 'DOCUMENT', description: '详细的步骤说明和案例分析' },
  { titleSuffix: '互动练习题', resourceType: 'PRACTICE', description: '巩固知识点的配套练习' },
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
    console.log('🚀 开始为801班级创建知识点和平台交互数据...\n');

    // 1. 查询展示场景
    const scenario = await prisma.learningScenario.findUnique({
      where: { code: 'SHOW_CASE' },
    });
    if (!scenario) {
      throw new Error('展示场景 (SHOW_CASE) 不存在');
    }
    console.log(`📋 场景: ${scenario.nameZh} (${scenario.id})`);

    // 2. 查询801班级的学生
    const students = await prisma.graphNode.findMany({
      where: {
        scenarioId: scenario.id,
        nodeType: 'Student',
        classId: { not: null },
      },
      include: {
        studentProfile: true,
      },
    });

    if (students.length === 0) {
      throw new Error('未找到801班级的学生节点');
    }
    console.log(`👥 学生数量: ${students.length}`);

    // 获取第一个学生的组织信息用于知识点节点
    const firstStudent = students[0];
    const schoolId = firstStudent.schoolId;
    const gradeId = firstStudent.gradeId;
    const classId = firstStudent.classId;

    console.log(`🏫 学校ID: ${schoolId}`);
    console.log(`📚 年级ID: ${gradeId}`);
    console.log(`🏠 班级ID: ${classId}`);

    // 3. 查找或创建交互会话
    let session = await prisma.interactionSession.findFirst({
      where: {
        scenarioId: scenario.id,
        classId: classId || undefined,
      },
      orderBy: { occurredAt: 'desc' },
    });

    if (!session) {
      session = await prisma.interactionSession.create({
        data: {
          scenarioId: scenario.id,
          schoolId: schoolId || '',
          gradeId: gradeId || '',
          classId: classId || null,
          sessionName: '801班 - 知识点平台学习',
          occurredAt: new Date(),
        },
      });
      console.log(`✅ 创建交互会话: ${session.sessionName} (${session.id})`);
    } else {
      console.log(`📋 使用已有交互会话: ${session.sessionName} (${session.id})`);
    }

    // 4. 创建知识点节点
    const createdKnowledgeNodes: Array<{ id: string; displayName: string }> = [];

    for (const kp of KNOWLEDGE_POINTS) {
      // 检查是否已存在同名知识点
      const existing = await prisma.graphNode.findFirst({
        where: {
          scenarioId: scenario.id,
          nodeType: 'Knowledge',
          displayName: kp.displayName,
        },
      });

      if (existing) {
        console.log(`⚠️ 知识点已存在: ${kp.displayName} (${existing.id})`);
        createdKnowledgeNodes.push({ id: existing.id, displayName: existing.displayName });
        continue;
      }

      const knowledgeNode = await prisma.graphNode.create({
        data: {
          nodeType: 'Knowledge',
          displayName: kp.displayName,
          scenarioId: scenario.id,
          schoolId: schoolId,
          gradeId: gradeId,
          classId: classId,
          knowledgeProfile: {
            create: {
              content: kp.content,
              knowledgeType: kp.knowledgeType,
              category: kp.category,
            },
          },
        },
      });

      createdKnowledgeNodes.push({ id: knowledgeNode.id, displayName: knowledgeNode.displayName });
      console.log(`✅ 创建知识点: ${knowledgeNode.displayName} (${knowledgeNode.id})`);
    }

    // 5. 创建资源并关联到知识点
    const createdResources: Array<{ id: string; title: string }> = [];

    for (let i = 0; i < createdKnowledgeNodes.length; i++) {
      const knowledgeNode = createdKnowledgeNodes[i];
      const template = RESOURCE_TEMPLATES[i % RESOURCE_TEMPLATES.length];

      const resource = await prisma.resource.create({
        data: {
          title: `${knowledgeNode.displayName} - ${template.titleSuffix}`,
          description: template.description,
          resourceType: template.resourceType,
          url: buildSearchUrl(`${knowledgeNode.displayName} - ${template.titleSuffix}`, template.resourceType),
          knowledgeRelations: {
            create: {
              knowledgeNodeId: knowledgeNode.id,
            },
          },
        },
      });

      createdResources.push({ id: resource.id, title: resource.title });
      console.log(`✅ 创建资源: ${resource.title} (${resource.id})`);
    }

    // 6. 随机创建学生-知识点交互（平台采集，虚线）
    let interactionCount = 0;
    const interactions = [];

    for (const knowledgeNode of createdKnowledgeNodes) {
      // 随机抽取约60%的学生与该知识点关联
      const shuffledStudents = [...students].sort(() => 0.5 - Math.random());
      const selectedStudents = shuffledStudents.slice(0, Math.ceil(students.length * 0.6));

      for (const student of selectedStudents) {
        // 随机强度 1.0 - 3.0
        const strength = Number((1.0 + Math.random() * 2.0).toFixed(2));

        interactions.push({
          interactionType: 'PLATFORM',
          sessionId: session.id,
          sourceNodeId: student.id,
          targetNodeId: knowledgeNode.id,
          strength: strength,
          actionType: 'LEARN',
        });
      }
    }

    // 批量创建交互，跳过已存在的
    for (const interaction of interactions) {
      try {
        await prisma.interaction.create({
          data: interaction,
        });
        interactionCount++;
      } catch (error: any) {
        if (error?.code === 'P2002') {
          // 已存在，跳过
          continue;
        }
        throw error;
      }
    }

    console.log(`✅ 创建学生-知识点交互: ${interactionCount} 条 (PLATFORM/虚线)`);

    // 7. Mock 学生对资源的评分
    let rateCount = 0;

    for (const resource of createdResources) {
      // 随机抽取约50%的学生评分
      const shuffledStudents = [...students].sort(() => 0.5 - Math.random());
      const selectedStudents = shuffledStudents.slice(0, Math.ceil(students.length * 0.5));

      for (const student of selectedStudents) {
        // 随机评分 3.0 - 5.0
        const rate = Number((3.0 + Math.random() * 2.0).toFixed(2));

        try {
          await prisma.studentResourceRate.create({
            data: {
              studentId: student.id,
              resourceId: resource.id,
              rate: rate,
            },
          });
          rateCount++;
        } catch (error: any) {
          if (error?.code === 'P2002') {
            // 已存在，跳过
            continue;
          }
          throw error;
        }
      }
    }

    console.log(`✅ 创建学生资源评分: ${rateCount} 条`);

    // 8. 输出统计
    console.log(`\n📊 数据统计:`);
    console.log(`  - 知识点节点: ${createdKnowledgeNodes.length}`);
    console.log(`  - 学习资源: ${createdResources.length}`);
    console.log(`  - 平台交互(虚线): ${interactionCount}`);
    console.log(`  - 学生评分: ${rateCount}`);

    console.log(`\n📋 知识点列表:`);
    createdKnowledgeNodes.forEach((kp, idx) => {
      console.log(`  ${idx + 1}. ${kp.displayName}`);
    });

    console.log(`\n📋 资源列表:`);
    createdResources.forEach((r, idx) => {
      console.log(`  ${idx + 1}. ${r.title}`);
    });

    console.log(`\n✅ 全部完成!`);

  } catch (error) {
    console.error('\n❌ 创建失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
