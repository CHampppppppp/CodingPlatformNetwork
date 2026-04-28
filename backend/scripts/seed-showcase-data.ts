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

const NEW_KNOWLEDGE_POINTS = [
  { name: '机器学习基础', category: '人工智能', knowledgeType: '知识点', content: '了解机器学习的基本概念、监督学习与无监督学习的区别，以及常见算法如决策树、神经网络等。' },
  { name: '自然语言处理', category: '人工智能', knowledgeType: '知识点', content: '掌握自然语言处理的基本技术，包括分词、词性标注、命名实体识别和文本分类等核心概念。' },
  { name: '计算机视觉', category: '人工智能', knowledgeType: '知识点', content: '理解计算机视觉的基本原理，包括图像分类、目标检测、图像分割和特征提取等关键技术。' },
  { name: '生成式AI应用', category: '人工智能', knowledgeType: '知识点', content: '探索生成式AI在文本、图像、音频和视频等领域的应用场景，理解AIGC的基本原理。' },
  { name: 'AI伦理与安全', category: '人工智能', knowledgeType: '知识点', content: '认识人工智能发展中的伦理挑战，包括数据隐私、算法偏见、AI安全和社会影响等议题。' },
  { name: 'Python编程基础', category: '编程', knowledgeType: '知识点', content: '掌握Python编程语言的基本语法、数据类型、控制结构和函数定义，为AI开发打下基础。' },
  { name: '深度学习框架', category: '人工智能', knowledgeType: '知识点', content: '了解TensorFlow、PyTorch等主流深度学习框架的基本使用方法，能够搭建简单的神经网络模型。' },
];

const RESOURCE_POOL = [
  { title: '精讲视频', resourceType: 'VIDEO', description: '由名师录制的高清精讲视频，深入浅出讲解核心概念与重难点。' },
  { title: '实践案例', resourceType: 'ARTICLE', description: '精选真实应用场景案例，帮助学生理解知识点的实际价值。' },
  { title: '互动练习', resourceType: 'PRACTICE', description: '配套在线练习题库，支持即时反馈与错题解析。' },
  { title: '知识图谱', resourceType: 'DOCUMENT', description: '结构化知识梳理，帮助学生建立完整的知识体系。' },
];

function getResourceUrl(title: string, type: string): string {
  const slug = title.replace(/\s+/g, '-').toLowerCase();
  switch (type) {
    case 'VIDEO': return `https://edu-video.example.com/v/${slug}`;
    case 'ARTICLE': return `https://edu-article.example.com/a/${slug}`;
    case 'PRACTICE': return `https://edu-quiz.example.com/q/${slug}`;
    case 'GAME': return `https://edu-game.example.com/g/${slug}`;
    case 'DOCUMENT': return `https://edu-doc.example.com/d/${slug}.pdf`;
    default: return `https://edu.example.com/r/${slug}`;
  }
}

async function main() {
  try {
    console.log('🚀 开始为展示场景生成mock数据...\n');

    const scenario = await prisma.learningScenario.findUnique({
      where: { code: 'SHOW_CASE' },
    });
    if (!scenario) {
      throw new Error('展示场景(SHOW_CASE)不存在');
    }
    console.log(`✅ 展示场景: ${scenario.nameZh} (id=${scenario.id.slice(0,8)})`);

    const students = await prisma.graphNode.findMany({
      where: { scenarioId: scenario.id, nodeType: 'Student' },
      select: { id: true, displayName: true, schoolId: true, gradeId: true, classId: true },
    });
    console.log(`👥 学生数量: ${students.length}`);

    const existingKnowledges = await prisma.graphNode.findMany({
      where: { scenarioId: scenario.id, nodeType: 'Knowledge' },
      select: { id: true, displayName: true },
    });
    console.log(`📚 现有知识点: ${existingKnowledges.length}`);
    existingKnowledges.forEach(k => console.log(`   - ${k.displayName}`));

    let createdKnowledgeCount = 0;
    const allKnowledgeNodes = [...existingKnowledges];

    for (const kp of NEW_KNOWLEDGE_POINTS) {
      const exists = await prisma.graphNode.findFirst({
        where: { scenarioId: scenario.id, nodeType: 'Knowledge', displayName: kp.name },
      });
      if (exists) {
        console.log(`   ⏭️ 知识点已存在: ${kp.name}`);
        allKnowledgeNodes.push({ id: exists.id, displayName: exists.displayName });
        continue;
      }

      const knowledgeNode = await prisma.graphNode.create({
        data: {
          nodeType: 'Knowledge',
          displayName: kp.name,
          scenarioId: scenario.id,
          knowledgeProfile: {
            create: {
              content: kp.content,
              knowledgeType: kp.knowledgeType,
              category: kp.category,
            },
          },
        },
      });
      allKnowledgeNodes.push({ id: knowledgeNode.id, displayName: knowledgeNode.displayName });
      createdKnowledgeCount++;
      console.log(`   ✅ 创建知识点: ${kp.name}`);
    }

    console.log(`\n📊 知识点总数: ${allKnowledgeNodes.length} (新增 ${createdKnowledgeCount})`);

    let session = await prisma.interactionSession.findFirst({
      where: { scenarioId: scenario.id },
    });

    if (!session) {
      const firstStudent = students[0];
      if (!firstStudent?.schoolId || !firstStudent?.gradeId) {
        throw new Error('无法获取学生组织信息来创建交互会话');
      }
      session = await prisma.interactionSession.create({
        data: {
          scenarioId: scenario.id,
          schoolId: firstStudent.schoolId,
          gradeId: firstStudent.gradeId,
          classId: firstStudent.classId,
          sessionName: '展示场景 - 知识交互模拟',
          occurredAt: new Date(),
        },
      });
      console.log(`\n✅ 创建交互会话: ${session.sessionName}`);
    } else {
      console.log(`\n✅ 使用现有交互会话: ${session.sessionName || session.id.slice(0,8)}`);
    }

    let interactionCount = 0;
    const existingInteractions = await prisma.interaction.findMany({
      where: {
        sessionId: session.id,
        sourceNode: { nodeType: 'Student' },
        targetNode: { nodeType: 'Knowledge' },
      },
      select: { sourceNodeId: true, targetNodeId: true },
    });
    const existingInteractionSet = new Set(
      existingInteractions.map(i => `${i.sourceNodeId}_${i.targetNodeId}`)
    );

    for (const student of students) {
      const numKnowledges = 2 + Math.floor(Math.random() * 5);
      const shuffledKnowledges = [...allKnowledgeNodes].sort(() => 0.5 - Math.random());
      const selectedKnowledges = shuffledKnowledges.slice(0, numKnowledges);

      for (const knowledge of selectedKnowledges) {
        const key = `${student.id}_${knowledge.id}`;
        if (existingInteractionSet.has(key)) continue;

        const interactionType = Math.random() > 0.3 ? 'PLATFORM' : 'PHYSICAL';
        const strength = Number((1.0 + Math.random() * 4.0).toFixed(4));

        await prisma.interaction.create({
          data: {
            sessionId: session.id,
            sourceNodeId: student.id,
            targetNodeId: knowledge.id,
            interactionType,
            strength,
            actionType: 'KNOWLEDGE_LEARNING',
            durationSec: Math.floor(300 + Math.random() * 2700),
          },
        });
        existingInteractionSet.add(key);
        interactionCount++;
      }
    }

    console.log(`✅ 创建学生-知识点交互: ${interactionCount} 条`);

    let resourceCount = 0;
    let resourceRelationCount = 0;

    for (const knowledge of allKnowledgeNodes) {
      const numResources = 1 + Math.floor(Math.random() * 2);
      const shuffledPool = [...RESOURCE_POOL].sort(() => 0.5 - Math.random());
      const selectedTemplates = shuffledPool.slice(0, numResources);

      for (const tpl of selectedTemplates) {
        const title = `${knowledge.displayName} - ${tpl.title}`;

        const existing = await prisma.resource.findFirst({ where: { title } });
        if (existing) {
          const existingRel = await prisma.resourceKnowledgeRelation.findFirst({
            where: { resourceId: existing.id, knowledgeNodeId: knowledge.id },
          });
          if (!existingRel) {
            await prisma.resourceKnowledgeRelation.create({
              data: { resourceId: existing.id, knowledgeNodeId: knowledge.id },
            });
            resourceRelationCount++;
          }
          continue;
        }

        const resource = await prisma.resource.create({
          data: {
            title,
            description: tpl.description,
            resourceType: tpl.resourceType,
            url: getResourceUrl(title, tpl.resourceType),
            knowledgeRelations: {
              create: { knowledgeNodeId: knowledge.id },
            },
          },
        });
        resourceCount++;
        resourceRelationCount++;
      }
    }

    console.log(`✅ 创建资源: ${resourceCount} 个`);
    console.log(`✅ 创建资源-知识点关联: ${resourceRelationCount} 条`);

    let rateCount = 0;
    const allResources = await prisma.resource.findMany({
      where: {
        knowledgeRelations: {
          some: {
            knowledgeNode: { scenarioId: scenario.id },
          },
        },
      },
      include: {
        knowledgeRelations: {
          select: { knowledgeNodeId: true },
        },
      },
    });

    for (const resource of allResources) {
      const relatedKnowledgeIds = resource.knowledgeRelations.map(r => r.knowledgeNodeId);

      const relatedInteractions = await prisma.interaction.findMany({
        where: {
          sourceNodeId: { in: students.map(s => s.id) },
          targetNodeId: { in: relatedKnowledgeIds },
        },
        select: { sourceNodeId: true },
        distinct: ['sourceNodeId'],
      });
      const relatedStudentIds = relatedInteractions.map(i => i.sourceNodeId);

      for (const studentId of relatedStudentIds) {
        const existingRate = await prisma.studentResourceRate.findFirst({
          where: { studentId, resourceId: resource.id },
        });
        if (existingRate) continue;

        const rate = Number((2.0 + Math.random() * 3.0).toFixed(2));
        await prisma.studentResourceRate.create({
          data: { studentId, resourceId: resource.id, rate },
        });
        rateCount++;
      }
    }

    console.log(`✅ 创建学生资源评分: ${rateCount} 条`);


    const finalKnowledgeCount = await prisma.graphNode.count({
      where: { scenarioId: scenario.id, nodeType: 'Knowledge' },
    });
    const finalInteractionCount = await prisma.interaction.count({
      where: {
        sessionId: session.id,
        sourceNode: { nodeType: 'Student' },
        targetNode: { nodeType: 'Knowledge' },
      },
    });
    const finalResourceCount = await prisma.resource.count({
      where: {
        knowledgeRelations: {
          some: { knowledgeNode: { scenarioId: scenario.id } },
        },
      },
    });

    console.log('\n📊 最终统计:');
    console.log(`   知识点总数: ${finalKnowledgeCount}`);
    console.log(`   学生-知识点交互: ${finalInteractionCount}`);
    console.log(`   资源总数: ${finalResourceCount}`);
    console.log(`   学生评分: ${rateCount}`);
    console.log('\n🎉 全部完成!');

  } catch (error) {
    console.error('\n❌ 失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
