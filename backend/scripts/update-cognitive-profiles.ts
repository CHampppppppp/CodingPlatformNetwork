#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

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

interface SchoolConfig {
  name: string;
  csvPath: string;
}

const SCHOOLS: SchoolConfig[] = [
  {
    name: '杭州市钱塘区前进小学',
    csvPath: path.resolve(__dirname, '../datas/script_filterd/前进小学学生.csv'),
  },
  {
    name: '杭州市星洲小学',
    csvPath: path.resolve(__dirname, '../datas/script_filterd/星洲小学学生.csv'),
  },
];

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

const DIMENSION_COLUMN_MAP: Record<string, string[]> = {
  learningMotivation: ['问卷_列16', '问卷_列17', '问卷_列18'],
  learningAttitude: ['问卷_列19', '问卷_列20', '问卷_列21'],
  learningEngagement: ['问卷_列22', '问卷_列23', '问卷_列24'],
  selfRegulatedLearning: ['问卷_列25', '问卷_列26', '问卷_列27'],
  computationalThinking: ['问卷_列28', '问卷_列29', '问卷_列30'],
  learningMethod: ['问卷_列31', '问卷_列32', '问卷_列33'],
  cognitiveLoad: ['问卷_列34', '问卷_列35', '问卷_列36'],
  humanAiTrust: ['问卷_列37', '问卷_列38', '问卷_列39'],
  aiLiteracy: ['问卷_列40', '问卷_列41', '问卷_列42', '问卷_列43', '问卷_列44', '问卷_列45', '问卷_列46', '问卷_列47'],
  knowledgeReserve: ['问卷_列48', '问卷_列49', '问卷_列50', '问卷_列51', '问卷_列52', '问卷_列53'],
};

const SURVEY_RESPONSE_FIELD_MAP: Record<string, string> = {
  learningMotivation: 'motivationScore',
  learningAttitude: 'attitudeScore',
  learningEngagement: 'engagementScore',
  selfRegulatedLearning: 'selfRegulationScore',
  computationalThinking: 'computationalThinkingScore',
  learningMethod: 'learningMethodScore',
  cognitiveLoad: 'cognitiveLoadScore',
  humanAiTrust: 'humanAiTrustScore',
  aiLiteracy: 'aiLiteracyScore',
  knowledgeReserve: 'priorKnowledgeScore',
};

function calculateDimensionScore(row: any, columns: string[]): number {
  const scores = columns.map((col) => parseOptionScore(row[col])).filter((s) => s > 0);
  return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
}

async function updateSchool(schoolConfig: SchoolConfig) {
  console.log(`\n=== 开始更新 ${schoolConfig.name} 的认知画像 ===`);

  const csvContent = fs.readFileSync(schoolConfig.csvPath, { encoding: 'utf-8' });
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

  const school = await prisma.school.findUnique({
    where: { name: schoolConfig.name },
  });
  if (!school) {
    console.log(`⚠️ 学校 ${schoolConfig.name} 不存在，跳过`);
    return;
  }

  const existingStudents = await prisma.graphNode.findMany({
    where: {
      nodeType: 'Student',
      scenarioId: scenario.id,
      schoolId: school.id,
    },
    include: {
      studentProfile: true,
    },
  });
  console.log(`数据库中找到 ${existingStudents.length} 名学生`);

  if (existingStudents.length === 0) {
    console.log('⚠️ 没有可更新的学生，建议先运行 import-qianjin-xingzhou-students.ts 导入');
    return;
  }

  const studentMap = new Map<string, typeof existingStudents[0]>();
  for (const s of existingStudents) {
    studentMap.set(s.displayName.trim(), s);
  }

  const dimensionDefs = await prisma.cognitiveDimensionDef.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  let updatedCount = 0;
  let skippedCount = 0;

  for (const row of records) {
    const name = row['姓名']?.trim();
    if (!name) continue;

    const studentNode = studentMap.get(name);
    if (!studentNode) {
      console.log(`⚠️ 未找到学生: ${name}，跳过`);
      skippedCount++;
      continue;
    }

    const dimensionScores: Record<string, number> = {};
    for (const [dimCode, columns] of Object.entries(DIMENSION_COLUMN_MAP)) {
      dimensionScores[dimCode] = calculateDimensionScore(row, columns);
    }

    const allValidScores = Object.values(DIMENSION_COLUMN_MAP)
      .flat()
      .map((col) => parseOptionScore(row[col]))
      .filter((s) => s > 0);
    const totalScore = allValidScores.length > 0
      ? allValidScores.reduce((a, b) => a + b, 0) / allValidScores.length
      : 0;

    const q4 = Number(row['4、AI帮你生成的文案或图片，符合你心里的想法吗？']) || 0;
    const q5 = Number(row['5、智能体推送的资源链接对你制作海报有帮助吗？']) || 0;
    const q6 = Number(row['6、请评价你对今天自己制作的海报的满意程度：']) || 0;
    const q7 = Number(row['7、相比传统的"老师讲、学生做"，你更喜欢这种"和AI一起做项目"的上课方式吗？']) || 0;
    const q8 = Number(row['8、在这次设计中，谁给你的帮助最大？']) || 0;

    const gender = row['性别']?.trim();
    const learningStyle = row['问卷_列13']?.trim();
    const personality = row['问卷_列14']?.trim();
    const groupBehavior = row['问卷_列15']?.trim();

    await prisma.studentSurveyResponse.updateMany({
      where: { studentNodeId: studentNode.id },
      data: {
        totalScore: totalScore,
        aiContentSatisfaction: q4 > 0 ? String(q4) : null,
        resourceHelpfulness: q5 > 0 ? String(q5) : null,
        posterSatisfaction: q6 > 0 ? String(q6) : null,
        teachingPreference: q7 > 0 ? String(q7) : null,
        helpSource: q8 > 0 ? String(q8) : null,
        gender: gender || null,
        learningStyle: learningStyle || null,
        personality: personality || null,
        groupBehavior: groupBehavior || null,
        ...Object.fromEntries(
          Object.entries(SURVEY_RESPONSE_FIELD_MAP).map(([dimCode, fieldName]) => [
            fieldName,
            dimensionScores[dimCode],
          ])
        ),
      },
    });

    const cognitiveProfile = await prisma.studentCognitiveProfile.create({
      data: {
        studentNodeId: studentNode.id,
        profileVersion: 'v1.1-dimension-split',
        generatedAt: new Date(),
        totalScore: totalScore,
      },
    });

    for (const dim of dimensionDefs) {
      const dimScore = dimensionScores[dim.dimensionCode] ?? 0;
      await prisma.studentCognitiveDimensionScore.create({
        data: {
          profileId: cognitiveProfile.id,
          dimensionCode: dim.dimensionCode,
          scoreValue: dimScore,
          scoreLevel: scoreToLevel(dimScore),
        },
      });
    }

    console.log(
      `更新学生: ${name} (总均分: ${totalScore.toFixed(2)}, ` +
      `维度: ${Object.entries(dimensionScores).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(', ')})`
    );
    updatedCount++;
  }

  console.log(`\n✅ 更新完成: ${updatedCount} 名, 跳过: ${skippedCount} 名`);
}

async function main() {
  console.log('=== 开始更新学生认知画像（维度拆分版本）===');

  for (const schoolConfig of SCHOOLS) {
    await updateSchool(schoolConfig);
  }

  console.log('\n=== 全部更新完成 ===');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
