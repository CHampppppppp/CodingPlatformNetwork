import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';

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

const SCENARIO_CODE = 'PORTAIT_801802803';
const PROFILE_VERSION = 'v1.0_gai_posttest';

const dimensionMappings = [
  { csvPrefix: '[SCORE]TECH_COMPUTATIONAL_THINKING', code: 'COG_COMPUTATIONAL', name: '计算思维' },
  { csvPrefix: '[SCORE]TECH_LITERACY', code: 'COG_TECH_LITERACY', name: '技术素养' },
  { csvPrefix: '[SCORE]RESILIENCE_INTEREST', code: 'PSY_RESILIENCE', name: '兴趣稳定性' },
  { csvPrefix: '[SCORE]ATTITUDE_PRESSURE', code: 'PSY_PRESSURE', name: '学业压力' },
  { csvPrefix: '[SCORE]INNOVATION_PROBLEM_SOLVING', code: 'PRAC_PROBLEM_SOLVING', name: '问题解决能力' },
  { csvPrefix: '[SCORE]INNOVATION_COLLABORATION', code: 'PRAC_COLLABORATION', name: '协作能力' },
  { csvPrefix: '[SCORE]INNOVATION_PRACTICE', code: 'PRAC_PRACTICE', name: '实践能力' },
  { csvPrefix: '[SCORE]READING_COMPREHENSION', code: 'COG_READING', name: '阅读理解' },
  { csvPrefix: '[SCORE]LANGUAGE_EXPRESSION', code: 'COG_LANGUAGE', name: '语言表达' },
  { csvPrefix: '[SCORE]SCIENCE_KNOWLEDGE', code: 'COG_SCIENCE_KNOWLEDGE', name: '科学知识' },
  { csvPrefix: '[SCORE]SCIENCE_INQUIRY', code: 'COG_SCIENCE_INQUIRY', name: '科学探究' },
  { csvPrefix: '[SCORE]ANXIETY', code: 'PSY_ANXIETY', name: '焦虑倾向' },
  { csvPrefix: '[SCORE]DEPRESSION', code: 'PSY_DEPRESSION', name: '抑郁倾向' },
  { csvPrefix: '[SCORE]INNOVATION', code: 'PRAC_INNOVATION', name: '创新能力' },
];

function getScoreLevel(score: number): string {
  if (score >= 7) return '高';
  if (score >= 4) return '中';
  return '低';
}

async function getOrCreateScenario(): Promise<string> {
  let scenario = await prisma.learningScenario.findUnique({
    where: { code: SCENARIO_CODE },
  });

  if (!scenario) {
    scenario = await prisma.learningScenario.create({
      data: {
        code: SCENARIO_CODE,
        nameZh: '801802803班GAI后测学情画像',
        sortOrder: 999,
        isActive: true,
      },
    });
    console.log(`✅ 创建场景: ${scenario.nameZh} (${scenario.id})`);
  } else {
    console.log(`📋 使用已有场景: ${scenario.nameZh} (${scenario.id})`);
  }

  return scenario.id;
}

async function verifyDimensions(): Promise<void> {
  const defs = await prisma.cognitiveDimensionDef.findMany({
    where: {
      dimensionCode: {
        in: dimensionMappings.map(d => d.code),
      },
    },
  });

  if (defs.length !== dimensionMappings.length) {
    const missing = dimensionMappings
      .filter(m => !defs.find(d => d.dimensionCode === m.code))
      .map(m => m.code);
    throw new Error(`缺少维度定义: ${missing.join(', ')}\n请先执行 init-portrait-dimensions.sql`);
  }

  console.log(`✅ 维度定义验证通过: ${defs.length} 个维度`);
}

async function importPortraitData() {
  const csvPath = path.resolve(
    __dirname,
    '../datas/4.27/副本293617618_学情画像与平台数据融合.csv'
  );

  console.log('📖 读取CSV文件...');
  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  }) as Record<string, string>[];

  console.log(`✅ 读取到 ${records.length} 条学生记录`);

  const scenarioId = await getOrCreateScenario();
  await verifyDimensions();

  const nameCol = '1、你的姓名：';
  const genderCol = '1、你的性别：';
  const schoolCol = '2、你的学校：';

  let successCount = 0;
  let skipCount = 0;

  for (const [index, record] of records.entries()) {
    const studentName = record[nameCol]?.trim();
    if (!studentName) {
      console.warn(`⚠️ 跳过第 ${index + 1} 行: 姓名为空`);
      skipCount++;
      continue;
    }

    const totalScore = parseFloat(record['[SUMMARY]总画像得分'] || '0');

    let studentNode = await prisma.graphNode.findFirst({
      where: {
        nodeType: 'STUDENT',
        displayName: studentName,
      },
    });

    if (!studentNode) {
      studentNode = await prisma.graphNode.create({
        data: {
          nodeType: 'STUDENT',
          displayName: studentName,
          scenarioId,
        },
      });
      console.log(`✅ 创建学生节点: ${studentName} (${studentNode.id})`);
    } else {
      console.log(`📋 使用已有节点: ${studentName} (${studentNode.id})`);
    }

    const existingProfile = await prisma.studentCognitiveProfile.findFirst({
      where: {
        studentNodeId: studentNode.id,
        profileVersion: PROFILE_VERSION,
      },
    });

    if (existingProfile) {
      console.log(`⏭️  跳过已有画像: ${studentName} (版本 ${PROFILE_VERSION})`);
      skipCount++;
      continue;
    }

    const profile = await prisma.studentCognitiveProfile.create({
      data: {
        studentNodeId: studentNode.id,
        profileVersion: PROFILE_VERSION,
        generatedAt: new Date('2024-12-09'),
        totalScore: totalScore,
      },
    });

    const dimensionScores = dimensionMappings.map(mapping => {
      const scoreValue = parseFloat(record[mapping.csvPrefix] || '0');
      return {
        profileId: profile.id,
        dimensionCode: mapping.code,
        scoreValue: scoreValue,
        scoreLevel: getScoreLevel(scoreValue),
      };
    });

    await prisma.studentCognitiveDimensionScore.createMany({
      data: dimensionScores,
    });

    const gender = record['gender'] || record['1、你的性别：'] || null;
    const learningStyle = record['learningStyle'] || null;

    await prisma.studentProfile.upsert({
      where: { nodeId: studentNode.id },
      create: {
        nodeId: studentNode.id,
        learningStylePreference: learningStyle,
      },
      update: {
        learningStylePreference: learningStyle,
      },
    });

    console.log(`✅ 导入完成: ${studentName} (总得分: ${totalScore.toFixed(2)})`);
    successCount++;
  }

  console.log('\n📊 导入统计:');
  console.log(`  - 成功: ${successCount} 人`);
  console.log(`  - 跳过: ${skipCount} 人`);
  console.log(`  - 总计: ${records.length} 人`);
}

async function main() {
  try {
    console.log('🚀 开始导入学情画像数据...\n');
    await importPortraitData();
    console.log('\n✅ 全部完成!');
  } catch (error) {
    console.error('\n❌ 导入失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
