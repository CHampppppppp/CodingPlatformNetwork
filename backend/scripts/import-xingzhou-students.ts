#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const SCHOOL_NAME = '杭州市星洲小学';
const GRADE_NAME = 5;
const CLASS_NAME = '五年级5班';
const SCENARIO_CODE = 'COLLABORATIVE_LEARNING';
const CSV_PATH = path.resolve(__dirname, '../datas/script_filterd/星洲小学学生.csv');

function parseOptionScore(value: string): number {
  const map: Record<string, number> = {
    '非常同意': 5,
    '同意': 4,
    '一般': 3,
    '不同意': 2,
    '非常不同意': 1,
  };
  return map[value?.trim()] ?? 0;
}

function scoreToLevel(score: number): string {
  if (score >= 4) return '高';
  if (score >= 3) return '中';
  return '低';
}

async function main() {
  console.log('=== 开始导入星洲小学学生数据 ===');

  const csvContent = fs.readFileSync(CSV_PATH, { encoding: 'utf-8' });
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    encoding: 'utf-8',
    bom: true,
  });
  console.log(`读取到 ${records.length} 条学生记录`);

  const scenario = await prisma.learningScenario.findUnique({
    where: { code: SCENARIO_CODE },
  });
  if (!scenario) {
    throw new Error(`场景 ${SCENARIO_CODE} 不存在`);
  }
  console.log(`场景: ${scenario.nameZh} (${scenario.code})`);

  let school = await prisma.school.findUnique({
    where: { name: SCHOOL_NAME },
  });
  if (!school) {
    school = await prisma.school.create({ data: { name: SCHOOL_NAME } });
    console.log(`创建学校: ${school.name}`);
  } else {
    console.log(`使用已有学校: ${school.name}`);
  }

  let grade = await prisma.grade.findUnique({
    where: { schoolId_gradeName: { schoolId: school.id, gradeName: GRADE_NAME } },
  });
  if (!grade) {
    grade = await prisma.grade.create({
      data: { schoolId: school.id, gradeName: GRADE_NAME },
    });
    console.log(`创建年级: ${grade.gradeName}`);
  } else {
    console.log(`使用已有年级: ${grade.gradeName}`);
  }

  let schoolClass = await prisma.schoolClass.findUnique({
    where: { gradeId_className: { gradeId: grade.id, className: CLASS_NAME } },
  });
  if (!schoolClass) {
    schoolClass = await prisma.schoolClass.create({
      data: { gradeId: grade.id, className: CLASS_NAME },
    });
    console.log(`创建班级: ${schoolClass.className}`);
  } else {
    console.log(`使用已有班级: ${schoolClass.className}`);
  }

  const session = await prisma.interactionSession.create({
    data: {
      scenarioId: scenario.id,
      schoolId: school.id,
      gradeId: grade.id,
      classId: schoolClass.id,
      sessionName: `${CLASS_NAME} - 在线协作学习活动`,
      occurredAt: new Date('2026-01-13T14:50:00Z'),
    },
  });
  console.log(`创建交互会话: ${session.sessionName}`);

  const knowledgeNodes = await prisma.graphNode.findMany({
    where: { nodeType: 'Knowledge', scenarioId: scenario.id },
    select: { id: true, displayName: true },
  });
  console.log(`找到 ${knowledgeNodes.length} 个知识点节点`);

  const dimensionDefs = await prisma.cognitiveDimensionDef.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  console.log(`找到 ${dimensionDefs.length} 个认知维度`);

  const studentNodeIds: string[] = [];
  for (const row of records) {
    const name = row['姓名']?.trim();
    if (!name) continue;

    const externalUserId = row['问卷_列2']?.trim();
    const gender = row['问卷_列12']?.trim();
    const learningStyle = row['问卷_列13']?.trim();
    const personality = row['问卷_列14']?.trim();
    const groupBehavior = row['问卷_列15']?.trim();

    const q16to47: number[] = [];
    for (let i = 16; i <= 47; i++) {
      q16to47.push(parseOptionScore(row[`问卷_列${i}`]));
    }
    const validQ16to47 = q16to47.filter((s) => s > 0);
    const totalRawScore = validQ16to47.reduce((a, b) => a + b, 0);
    const avgScore = validQ16to47.length > 0 ? totalRawScore / validQ16to47.length : 0;

    const q4 = Number(row['4、AI帮你生成的文案或图片，符合你心里的想法吗？']) || 0;
    const q5 = Number(row['5、智能体推送的资源链接对你制作海报有帮助吗？']) || 0;
    const q6 = Number(row['6、请评价你对今天自己制作的海报的满意程度：']) || 0;
    const q7 = Number(row['7、相比传统的"老师讲、学生做"，你更喜欢这种"和AI一起做项目"的上课方式吗？']) || 0;
    const q8 = Number(row['8、在这次设计中，谁给你的帮助最大？']) || 0;

    const studentNode = await prisma.graphNode.create({
      data: {
        nodeType: 'Student',
        displayName: name,
        scenarioId: scenario.id,
        schoolId: school.id,
        gradeId: grade.id,
        classId: schoolClass.id,
        studentProfile: {
          create: {
            externalUserId: externalUserId || null,
            learningStylePreference: learningStyle || null,
            personality: personality || null,
            groupBehavior: groupBehavior || null,
          },
        },
      },
    });
    studentNodeIds.push(studentNode.id);

    await prisma.studentSurveyResponse.create({
      data: {
        studentNodeId: studentNode.id,
        scenarioId: scenario.id,
        submittedAt: row['提交答卷时间'] ? new Date(row['提交答卷时间']) : null,
        gender: gender || null,
        learningStyle: learningStyle || null,
        personality: personality || null,
        groupBehavior: groupBehavior || null,
        motivationScore: avgScore,
        attitudeScore: avgScore,
        engagementScore: avgScore,
        selfRegulationScore: avgScore,
        computationalThinkingScore: avgScore,
        learningMethodScore: avgScore,
        cognitiveLoadScore: avgScore,
        humanAiTrustScore: avgScore,
        aiLiteracyScore: avgScore,
        priorKnowledgeScore: avgScore,
        totalScore: avgScore,
        aiContentSatisfaction: q4 > 0 ? String(q4) : null,
        resourceHelpfulness: q5 > 0 ? String(q5) : null,
        posterSatisfaction: q6 > 0 ? String(q6) : null,
        teachingPreference: q7 > 0 ? String(q7) : null,
        helpSource: q8 > 0 ? String(q8) : null,
      },
    });

    const cognitiveProfile = await prisma.studentCognitiveProfile.create({
      data: {
        studentNodeId: studentNode.id,
        profileVersion: 'v1.0-csv-import',
        generatedAt: new Date(),
        totalScore: avgScore,
      },
    });

    for (const dim of dimensionDefs) {
      await prisma.studentCognitiveDimensionScore.create({
        data: {
          profileId: cognitiveProfile.id,
          dimensionCode: dim.dimensionCode,
          scoreValue: avgScore,
          scoreLevel: scoreToLevel(avgScore),
        },
      });
    }

    console.log(`导入学生: ${name} (平均分: ${avgScore.toFixed(2)})`);
  }

  console.log(`\n成功导入 ${studentNodeIds.length} 名学生`);

  const interactionData: any[] = [];
  for (const studentId of studentNodeIds) {
    const kCount = 3 + Math.floor(Math.random() * 4);
    const shuffled = [...knowledgeNodes].sort(() => 0.5 - Math.random());
    for (let i = 0; i < Math.min(kCount, shuffled.length); i++) {
      interactionData.push({
        sessionId: session.id,
        sourceNodeId: studentId,
        targetNodeId: shuffled[i].id,
        interactionType: 'PLATFORM',
        actionType: 'RESOURCE_RECOMMENDATION',
        strength: 1 + Math.random() * 2,
      });
    }
  }

  for (let i = 0; i < studentNodeIds.length; i++) {
    const peerCount = 1 + Math.floor(Math.random() * 3);
    const peers = [...studentNodeIds]
      .filter((_, idx) => idx !== i)
      .sort(() => 0.5 - Math.random())
      .slice(0, peerCount);
    for (const peerId of peers) {
      interactionData.push({
        sessionId: session.id,
        sourceNodeId: studentNodeIds[i],
        targetNodeId: peerId,
        interactionType: 'PLATFORM',
        actionType: Math.random() > 0.5 ? 'COMMENT' : 'LIKE',
        strength: 1 + Math.random() * 2,
      });
    }
  }

  const batchSize = 50;
  for (let i = 0; i < interactionData.length; i += batchSize) {
    const batch = interactionData.slice(i, i + batchSize);
    await prisma.interaction.createMany({ data: batch });
  }
  console.log(`创建 ${interactionData.length} 条交互关系`);

  console.log('\n=== 导入完成 ===');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
