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

const SCENARIO_CODE = 'SHOW_CASE';
const PROFILE_VERSION = 'v1.0_801_real';

// 维度映射配置（与 import-portrait-data.ts 保持一致）
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

// 从原始CSV计算维度得分（复用 generate-learning-portrait.ts 逻辑）
function calculateDimensionScores(record: Record<string, string>): Record<string, number> {
  const scores: Record<string, number> = {};

  // 1. 计算思维 - 问题17：编程自我效能感（5题）
  {
    const q17Cols = Object.keys(record).filter(k => k.includes('17、') && !k.includes('18、'));
    let sum = 0;
    q17Cols.forEach(col => sum += parseInt(record[col]) || 0);
    const avg = q17Cols.length > 0 ? sum / q17Cols.length : 3;
    scores['[SCORE]TECH_COMPUTATIONAL_THINKING'] = ((avg - 1) / 4) * 10;
  }

  // 2. 技术素养 - 问题15：人机信任度（6题）+ 问题19：AI态度（1题）
  {
    const q15Cols = Object.keys(record).filter(k => k.includes('15、'));
    const q19Col = Object.keys(record).find(k => k.includes('19、'));
    let sum = 0;
    let count = 0;
    q15Cols.forEach(col => { sum += parseInt(record[col]) || 0; count++; });
    if (q19Col) { sum += parseInt(record[q19Col]) || 0; count++; }
    const avg = count > 0 ? sum / count : 3;
    scores['[SCORE]TECH_LITERACY'] = ((avg - 1) / 4) * 10;
  }

  // 3. 兴趣稳定性 - 问题13：学习态度（2题）+ 问题18：学习动机（5题）
  {
    const q13Cols = Object.keys(record).filter(k => k.includes('13、'));
    const q18Cols = Object.keys(record).filter(k => k.includes('18、'));
    let sum = 0;
    let count = 0;
    q13Cols.forEach(col => { sum += parseInt(record[col]) || 0; count++; });
    q18Cols.forEach(col => { sum += parseInt(record[col]) || 0; count++; });
    const avg = count > 0 ? sum / count : 3;
    scores['[SCORE]RESILIENCE_INTEREST'] = ((avg - 1) / 4) * 10;
  }

  // 4. 学业压力 - 问题16：认知负荷（8题）- 反向编码
  {
    const q16Cols = Object.keys(record).filter(k => k.includes('16、'));
    let sum = 0;
    q16Cols.forEach(col => sum += (6 - (parseInt(record[col]) || 3)));
    const avg = q16Cols.length > 0 ? sum / q16Cols.length : 3;
    scores['[SCORE]ATTITUDE_PRESSURE'] = ((avg - 1) / 4) * 10;
  }

  // 5. 问题解决能力 - 问题17：编程自我效能感（5题）
  {
    const q17Cols = Object.keys(record).filter(k => k.includes('17、') && !k.includes('18、'));
    let sum = 0;
    q17Cols.forEach(col => sum += parseInt(record[col]) || 0);
    const avg = q17Cols.length > 0 ? sum / q17Cols.length : 3;
    scores['[SCORE]INNOVATION_PROBLEM_SOLVING'] = ((avg - 1) / 4) * 10;
  }

  // 6. 协作能力 - 学习风格中合作倾向：问题3、9、10、11
  {
    const col3 = Object.keys(record).find(k => k.startsWith('3、'));
    const col9 = Object.keys(record).find(k => k.startsWith('9、'));
    const col10 = Object.keys(record).find(k => k.startsWith('10、'));
    const col11 = Object.keys(record).find(k => k.startsWith('11、'));
    let sum = 0;
    let count = 0;
    [col3, col9, col10, col11].forEach(col => {
      if (col) {
        const val = parseInt(record[col]) || 2;
        sum += (val === 1 ? 5 : 1);
        count++;
      }
    });
    const avg = count > 0 ? sum / count : 3;
    scores['[SCORE]INNOVATION_COLLABORATION'] = ((avg - 1) / 4) * 10;
  }

  // 7. 实践能力 - 问题17：编程自我效能感（5题）
  {
    const q17Cols = Object.keys(record).filter(k => k.includes('17、') && !k.includes('18、'));
    let sum = 0;
    q17Cols.forEach(col => sum += parseInt(record[col]) || 0);
    const avg = q17Cols.length > 0 ? sum / q17Cols.length : 3;
    scores['[SCORE]INNOVATION_PRACTICE'] = ((avg - 1) / 4) * 10;
  }

  // 8-13. Mock维度（使用基于学生姓名的种子生成一致的数据）
  const mockDimensions = [
    { code: 'READING_COMPREHENSION', name: '阅读理解', mean: 3.2, std: 0.8, questions: 5 },
    { code: 'LANGUAGE_EXPRESSION', name: '语言表达', mean: 3.0, std: 0.9, questions: 5 },
    { code: 'SCIENCE_KNOWLEDGE', name: '科学知识', mean: 3.1, std: 0.85, questions: 6 },
    { code: 'SCIENCE_INQUIRY', name: '科学探究', mean: 2.9, std: 0.9, questions: 5 },
    { code: 'ANXIETY', name: '焦虑倾向', mean: 2.8, std: 0.9, questions: 10, reverse: [1, 3, 5, 7, 9] },
    { code: 'DEPRESSION', name: '抑郁倾向', mean: 2.6, std: 0.85, questions: 10, reverse: [2, 4, 6, 8, 10] },
    { code: 'INNOVATION', name: '创新能力', mean: 3.3, std: 0.8, questions: 10 },
  ];

  const studentName = record['1、你的姓名：'] || '';
  
  for (const dim of mockDimensions) {
    // 使用学生姓名作为种子，生成一致的mock数据
    let seed = 0;
    for (let i = 0; i < studentName.length; i++) {
      seed = ((seed << 5) - seed + studentName.charCodeAt(i)) | 0;
    }
    seed = Math.abs(seed);
    
    let sum = 0;
    for (let q = 1; q <= dim.questions; q++) {
      // 简单的伪随机生成
      const rand = ((seed + q) * 9301 + 49297) % 233280;
      const normalized = rand / 233280;
      let score = Math.round(dim.mean + (normalized - 0.5) * 2 * dim.std);
      score = Math.max(1, Math.min(5, score));
      
      if (dim.reverse?.includes(q)) {
        score = 6 - score;
      }
      
      sum += score;
    }
    
    const avg = sum / dim.questions;
    scores[`[SCORE]${dim.code}`] = ((avg - 1) / 4) * 10;
  }

  // 计算二级指标
  const secondaryScores: Record<string, number> = {};
  
  // 人文基础
  secondaryScores['COG_HUMANITIES'] = (scores['[SCORE]READING_COMPREHENSION'] + scores['[SCORE]LANGUAGE_EXPRESSION']) / 2;
  
  // 科学基础
  secondaryScores['COG_SCIENCE'] = (scores['[SCORE]SCIENCE_KNOWLEDGE'] + scores['[SCORE]SCIENCE_INQUIRY']) / 2;
  
  // 技术应用
  secondaryScores['COG_TECH'] = (scores['[SCORE]TECH_COMPUTATIONAL_THINKING'] + scores['[SCORE]TECH_LITERACY']) / 2;
  
  // 心理健康（反向：10 - 平均值）
  secondaryScores['PSY_MENTAL_HEALTH'] = 10 - (scores['[SCORE]ANXIETY'] + scores['[SCORE]DEPRESSION']) / 2;
  
  // 坚韧豁达
  secondaryScores['PSY_RESILIENCE'] = scores['[SCORE]RESILIENCE_INTEREST'];
  
  // 生活态度
  secondaryScores['PSY_ATTITUDE'] = scores['[SCORE]ATTITUDE_PRESSURE'];
  
  // 创新能力
  secondaryScores['PRAC_INNOVATION'] = scores['[SCORE]INNOVATION'];
  
  // 问题解决
  secondaryScores['PRAC_PROBLEM_SOLVING'] = scores['[SCORE]INNOVATION_PROBLEM_SOLVING'];
  
  // 协作能力
  secondaryScores['PRAC_COLLABORATION'] = scores['[SCORE]INNOVATION_COLLABORATION'];
  
  // 实践能力
  secondaryScores['PRAC_PRACTICE'] = scores['[SCORE]INNOVATION_PRACTICE'];

  // 计算一级指标
  const primaryScores: Record<string, number> = {};
  primaryScores['PRIMARY_COGNITIVE'] = (secondaryScores['COG_HUMANITIES'] + secondaryScores['COG_SCIENCE'] + secondaryScores['COG_TECH']) / 3;
  primaryScores['PRIMARY_PSYCHOLOGY'] = (secondaryScores['PSY_MENTAL_HEALTH'] + secondaryScores['PSY_RESILIENCE'] + secondaryScores['PSY_ATTITUDE']) / 3;
  primaryScores['PRIMARY_PRACTICE'] = (secondaryScores['PRAC_INNOVATION'] + secondaryScores['PRAC_PROBLEM_SOLVING'] + secondaryScores['PRAC_COLLABORATION'] + secondaryScores['PRAC_PRACTICE']) / 4;

  // 总得分
  scores['[SUMMARY]总画像得分'] = (primaryScores['PRIMARY_COGNITIVE'] + primaryScores['PRIMARY_PSYCHOLOGY'] + primaryScores['PRIMARY_PRACTICE']) / 3;

  return scores;
}

async function getOrCreateScenario(): Promise<string> {
  let scenario = await prisma.learningScenario.findUnique({
    where: { code: SCENARIO_CODE },
  });

  if (!scenario) {
    throw new Error(`场景 ${SCENARIO_CODE} 不存在，请先创建展示场景`);
  }

  console.log(`📋 使用场景: ${scenario.nameZh} (${scenario.id})`);
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

async function importShowCase801Data() {
  const csvPath = path.resolve(
    __dirname,
    '../datas/4.27/副本293617618_按序号_801802803GAI后测_96_94.csv'
  );

  console.log('📖 读取CSV文件...');
  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  }) as Record<string, string>[];

  console.log(`✅ 读取到 ${records.length} 条801班学生记录`);

  const scenarioId = await getOrCreateScenario();
  await verifyDimensions();

  const nameCol = '1、你的姓名：';

  let successCount = 0;
  let skipCount = 0;

  const existingStudentWithOrg = await prisma.graphNode.findFirst({
    where: {
      scenarioId,
      nodeType: 'STUDENT',
      schoolId: { not: null },
      gradeId: { not: null },
      classId: { not: null },
    },
    select: { schoolId: true, gradeId: true, classId: true },
  });

  const orgInfo = existingStudentWithOrg || null;
  if (orgInfo) {
    console.log(`📋 使用班级org信息: schoolId=${orgInfo.schoolId}, gradeId=${orgInfo.gradeId}, classId=${orgInfo.classId}`);
  } else {
    console.log(`⚠️ 未找到班级org信息，新建节点将无school/grade/class`);
  }

  for (const [index, record] of records.entries()) {
    const studentName = record[nameCol]?.trim();
    if (!studentName) {
      console.warn(`⚠️ 跳过第 ${index + 1} 行: 姓名为空`);
      skipCount++;
      continue;
    }

    // 计算维度得分
    const calculatedScores = calculateDimensionScores(record);
    const totalScore = calculatedScores['[SUMMARY]总画像得分'];

    // 查找或创建学生节点（在 SHOW_CASE 场景下）
    let studentNode = await prisma.graphNode.findFirst({
      where: {
        nodeType: 'STUDENT',
        displayName: studentName,
        scenarioId: scenarioId,
      },
    });

    if (!studentNode) {
      const createData: any = {
        nodeType: 'STUDENT',
        displayName: studentName,
        scenarioId,
      };
      if (orgInfo) {
        createData.schoolId = orgInfo.schoolId;
        createData.gradeId = orgInfo.gradeId;
        createData.classId = orgInfo.classId;
      }
      studentNode = await prisma.graphNode.create({ data: createData });
      console.log(`✅ 创建学生节点: ${studentName} (${studentNode.id})`);
    } else {
      console.log(`📋 使用已有节点: ${studentName} (${studentNode.id})`);
    }

    // 检查是否已有该版本的画像
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

    // 创建学情画像
    const profile = await prisma.studentCognitiveProfile.create({
      data: {
        studentNodeId: studentNode.id,
        profileVersion: PROFILE_VERSION,
        generatedAt: new Date('2024-12-09'),
        totalScore: totalScore,
      },
    });

    // 创建维度得分
    const dimensionScores = dimensionMappings.map(mapping => {
      const scoreValue = calculatedScores[mapping.csvPrefix] || 0;
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

    // 更新学生扩展属性（学习风格等）
    const learningStyle = inferLearningStyle(record);
    
    await prisma.studentProfile.upsert({
      where: { nodeId: studentNode.id },
      create: {
        nodeId: studentNode.id,
        learningStyle: learningStyle,
      },
      update: {
        learningStyle: learningStyle,
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

// 推断学习风格
function inferLearningStyle(record: Record<string, string>): string {
  // 问题2：为了较好地理解某些事物，我首先
  // 1=仔细观察, 2=听别人讲解
  const q2 = parseInt(record[Object.keys(record).find(k => k.startsWith('2、')) || ''] || '0');
  
  // 问题6：当我做家庭作业时，我比较喜欢
  // 1=独立完成, 2=与人合作
  const q6 = parseInt(record[Object.keys(record).find(k => k.startsWith('6、')) || ''] || '0');
  
  // 问题7：我喜欢
  // 1=动手操作, 2=思考分析
  const q7 = parseInt(record[Object.keys(record).find(k => k.startsWith('7、')) || ''] || '0');
  
  // 问题8：我办事时喜欢
  // 1=按常规方法, 2=尝试新方法
  const q8 = parseInt(record[Object.keys(record).find(k => k.startsWith('8、')) || ''] || '0');
  
  if (q2 === 1 && q7 === 1) return '视觉-动手型';
  if (q2 === 2 && q6 === 2) return '听觉-合作型';
  if (q7 === 2 && q8 === 2) return '思考-创新型';
  if (q6 === 1 && q8 === 1) return '独立-常规型';
  
  return '综合型';
}

async function main() {
  try {
    console.log('🚀 开始导入801班学情画像数据到 SHOW_CASE 场景...\n');
    await importShowCase801Data();
    console.log('\n✅ 全部完成!');
  } catch (error) {
    console.error('\n❌ 导入失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
