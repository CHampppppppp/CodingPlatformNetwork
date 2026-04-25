import { PrismaClient } from '@prisma/client';
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

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl)
});

const SCENARIO_CODE = 'INFORMAL_LEARNING';
const CSV_PATH = path.resolve(__dirname, '../datas/script_filterd/社团课等非正式学习学生_班均匀化.csv');

const LIKERT_MAP: Record<string, number> = {
  '非常同意': 5,
  '同意': 4,
  '一般': 3,
  '不同意': 2,
  '非常不同意': 1,
};

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

const SURVEY_FIELD_MAP: Record<string, string> = {
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

function parseLikert(value: string): number {
  return LIKERT_MAP[value?.trim()] ?? 0;
}

function calculateDimensionScore(row: any, columns: string[]): number {
  const scores = columns.map(col => parseLikert(row[col])).filter(s => s > 0);
  return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
}

function scoreToLevel(score: number): string {
  if (score >= 4) return '高';
  if (score >= 3) return '中';
  return '低';
}

function parseGrade(gradeStr: string): number {
  const match = gradeStr?.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

interface StudentData {
  name: string;
  userId: string;
  schoolName: string;
  gradeName: string;
  className: string;
  gender: string;
  learningStyle: string;
  personality: string;
  groupBehavior: string;
  submittedAt: Date | null;
  responses: any;
  works: {
    externalWorkId: string;
    workName: string;
    publishedAt: Date | null;
    themeId: string;
    themeName: string;
    themeDirectory: string;
    textbookName: string;
    likeCount: number;
    commentCount: number;
    teacherName: string;
    teacherScore: number | null;
    teacherComment: string;
    likeDetails: string;
    commentDetails: string;
    activityLogCount: number;
    activityLogMeta: string;
  } | null;
}

async function importData() {
  console.log('=== 开始导入社团课等非正式学习数据 ===\n');
  
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV文件不存在: ${CSV_PATH}`);
  }
  
  const buffer = fs.readFileSync(CSV_PATH);
  let csvContent = buffer.toString('utf-8');
  if (csvContent.charCodeAt(0) === 0xFEFF) {
    csvContent = csvContent.substring(1);
  }
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });
  
  for (const record of records) {
    const keys = Object.keys(record);
    for (const key of keys) {
      let cleanKey = key;
      while (cleanKey.charCodeAt(0) === 0xFEFF) {
        cleanKey = cleanKey.substring(1);
      }
      if (cleanKey !== key) {
        record[cleanKey] = record[key];
        delete record[key];
      }
    }
  }
  
  console.log(`CSV记录数: ${records.length}`);
  
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: SCENARIO_CODE },
  });
  if (!scenario) {
    throw new Error(`场景 ${SCENARIO_CODE} 不存在`);
  }
  console.log(`场景: ${scenario.nameZh} (${scenario.id})`);
  
  const dimensionDefs = await prisma.cognitiveDimensionDef.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  console.log(`认知维度定义: ${dimensionDefs.length} 个`);
  
  const resources = await prisma.resource.findMany({
    select: { id: true },
  });
  console.log(`资源数: ${resources.length}`);
  
  console.log('\n--- 阶段1: 预处理组织数据 ---');
  const schoolNames = new Set<string>();
  const gradeSet = new Set<string>();
  const classSet = new Set<string>();
  
  for (const row of records) {
    const schoolName = row['问卷_列7']?.trim();
    const gradeName = row['年级']?.trim();
    const className = row['班级']?.trim();
    if (schoolName) schoolNames.add(schoolName);
    if (schoolName && gradeName) gradeSet.add(`${schoolName}::${gradeName}`);
    if (schoolName && gradeName && className) classSet.add(`${schoolName}::${gradeName}::${className}`);
  }
  
  console.log(`唯一学校: ${schoolNames.size}, 年级: ${gradeSet.size}, 班级: ${classSet.size}`);
  
  const schoolMap = new Map<string, string>();
  for (const name of schoolNames) {
    const school = await prisma.school.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    schoolMap.set(name, school.id);
  }
  console.log(`学校创建完成`);
  
  const gradeMap = new Map<string, string>();
  for (const key of gradeSet) {
    const [schoolName, gradeName] = key.split('::');
    const schoolId = schoolMap.get(schoolName);
    const grade = await prisma.grade.upsert({
      where: { schoolId_gradeName: { schoolId, gradeName: parseGrade(gradeName) } },
      update: {},
      create: { schoolId, gradeName: parseGrade(gradeName) },
    });
    gradeMap.set(key, grade.id);
  }
  console.log(`年级创建完成`);
  
  const classMap = new Map<string, string>();
  for (const key of classSet) {
    const [schoolName, gradeName, className] = key.split('::');
    const gradeKey = `${schoolName}::${gradeName}`;
    const gradeId = gradeMap.get(gradeKey);
    const cls = await prisma.schoolClass.upsert({
      where: { gradeId_className: { gradeId, className } },
      update: {},
      create: { gradeId, className },
    });
    classMap.set(key, cls.id);
  }
  console.log(`班级创建完成`);
  
  console.log('\n--- 阶段2: 导入学生数据 ---');
  const batchSize = 100;
  let processed = 0;
  let success = 0;
  let failed = 0;
  let workDuplicateCount = 0;
  
  const classSatisfactionMap = new Map<string, { scores: number[]; count: number }>();
  const existingWorkIds = new Set<string>();
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    
    for (const row of batch) {
      try {
        const name = row['姓名']?.trim();
        const schoolName = row['问卷_列7']?.trim();
        const gradeName = row['年级']?.trim();
        const className = row['班级']?.trim();

        if (!name || !schoolName) {
          failed++;
          processed++;
          continue;
        }

        const schoolId = schoolMap.get(schoolName);
        const gradeKey = `${schoolName}::${gradeName}`;
        const gradeId = gradeMap.get(gradeKey);
        const classKey = `${schoolName}::${gradeName}::${className}`;
        const classId = classMap.get(classKey);
          
          const dimensionScores: Record<string, number> = {};
          for (const [dimCode, columns] of Object.entries(DIMENSION_COLUMN_MAP)) {
            dimensionScores[dimCode] = calculateDimensionScore(row, columns);
          }
          
          const allValidScores = Object.values(DIMENSION_COLUMN_MAP)
            .flat()
            .map(col => parseLikert(row[col]))
            .filter(s => s > 0);
          const totalScore = allValidScores.length > 0
            ? allValidScores.reduce((a, b) => a + b, 0) / allValidScores.length
            : 0;
          
          const q4 = Number(row['4、AI帮你生成的文案或图片，符合你心里的想法吗？']) || 0;
          const q5 = Number(row['5、智能体推送的资源链接对你制作海报有帮助吗？']) || 0;
          const q6 = Number(row['6、请评价你对今天自己制作的海报的满意程度：']) || 0;
          const q7 = Number(row['7、相比传统的「老师讲、学生做」，你更喜欢这种「和AI一起做项目」的上课方式吗？']) || 0;
          
          const satisfactionScores = [q4, q5, q6, q7].filter(s => s > 0);
          if (satisfactionScores.length > 0 && classId) {
            const avgSatisfaction = satisfactionScores.reduce((a, b) => a + b, 0) / satisfactionScores.length;
            const existing = classSatisfactionMap.get(classId);
            if (existing) {
              existing.scores.push(avgSatisfaction);
              existing.count++;
            } else {
              classSatisfactionMap.set(classId, { scores: [avgSatisfaction], count: 1 });
            }
          }
          
          const surveyData: any = {
            studentNodeId: '',
            scenarioId: scenario.id,
            submittedAt: parseDate(row['提交答卷时间']),
            gender: row['性别']?.trim() || null,
            learningStyle: row['问卷_列13']?.trim() || null,
            personality: row['问卷_列14']?.trim() || null,
            groupBehavior: row['问卷_列15']?.trim() || null,
            totalScore: totalScore,
            aiContentSatisfaction: q4 > 0 ? String(q4) : null,
            resourceHelpfulness: q5 > 0 ? String(q5) : null,
            posterSatisfaction: q6 > 0 ? String(q6) : null,
            teachingPreference: q7 > 0 ? String(q7) : null,
            helpSource: row['8、在这次设计中，谁给你的帮助最大？']?.trim() || null,
          };
          
          for (const [dimCode, fieldName] of Object.entries(SURVEY_FIELD_MAP)) {
            surveyData[fieldName] = dimensionScores[dimCode];
          }
          
          const graphNode = await prisma.graphNode.create({
            data: {
              nodeType: 'Student',
              displayName: name,
              scenarioId: scenario.id,
              schoolId,
              gradeId,
              classId,
              studentProfile: {
                create: {
                  externalUserId: row['user_id']?.trim() || null,
                  learningStylePreference: row['问卷_列13']?.trim() || null,
                  personality: row['问卷_列14']?.trim() || null,
                  groupBehavior: row['问卷_列15']?.trim() || null,
                },
              },
            },
          });
          
          surveyData.studentNodeId = graphNode.id;
          await prisma.studentSurveyResponse.create({ data: surveyData });
          
          const cognitiveProfile = await prisma.studentCognitiveProfile.create({
            data: {
              studentNodeId: graphNode.id,
              profileVersion: 'v1.0-informal-learning',
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
          
          const workId = row['作品_作品ID']?.trim();
          if (workId && !existingWorkIds.has(workId)) {
            try {
              await prisma.studentWork.create({
                data: {
                  studentNodeId: graphNode.id,
                  externalWorkId: workId,
                  workName: row['作品_作品名称']?.trim() || '未命名作品',
                  publishedAt: parseDate(row['作品_作品发布时间']),
                  themeId: row['作品_主题ID']?.trim() || null,
                  themeName: row['作品_主题名称']?.trim() || null,
                  themeDirectory: row['作品_主题所属目录']?.trim() || null,
                  textbookName: row['作品_所属教材']?.trim() || null,
                  likeCount: parseInt(row['作品_作品被点赞数']) || 0,
                  commentCount: parseInt(row['作品_作品被评论数']) || 0,
                  teacherName: row['作品_教师姓名']?.trim() || null,
                  teacherScore: row['作品_教师评分'] ? Number(row['作品_教师评分']) : null,
                  teacherComment: row['作品_教师评语']?.trim() || null,
                  likeDetails: row['点赞学生ID列表']?.trim() || null,
                  commentDetails: row['评论内容列表']?.trim() || null,
                  activityLogCount: parseInt(row['埋点记录数']) || 0,
                  activityLogMeta: row['埋点meta数据']?.trim() || null,
                },
              });
              existingWorkIds.add(workId);
            } catch (err: any) {
              if (err.code === 'P2002') {
                workDuplicateCount++;
              }
            }
          }
          
          success++;
        } catch (error: any) {
          if (failed < 5) {
            console.error(`记录 ${processed + 1} 失败:`, error.message, error.meta);
          }
          failed++;
        }
        processed++;
      }

    if (i % 5000 === 0 || i + batchSize >= records.length) {
      console.log(`进度: ${processed}/${records.length} (成功: ${success}, 失败: ${failed})`);
    }
  }
  
  console.log(`\n学生导入完成: 成功 ${success}, 失败 ${failed}`);
  
  console.log('\n--- 阶段3: 班级满意度统计 ---');
  const classIds = Array.from(classSatisfactionMap.keys());
  const classes = await prisma.schoolClass.findMany({
    where: { id: { in: classIds } },
    include: {
      grade: {
        include: {
          school: { select: { name: true } }
        }
      }
    }
  });
  const classInfoMap = new Map(classes.map(c => [c.id, c]));
  
  console.log(`\n班级满意度得分 (共 ${classSatisfactionMap.size} 个班级):`);
  console.log('学校 | 年级 | 班级 | 学生数 | 满意度得分');
  console.log('---|---|---|---|---|');
  
  const satisfactionResults: any[] = [];
  for (const [classId, data] of classSatisfactionMap.entries()) {
    const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    const cls = classInfoMap.get(classId);
    const schoolName = cls?.grade?.school?.name || '未知';
    const gradeName = cls?.grade?.gradeName || '?';
    const className = cls?.className || '?';
    
    satisfactionResults.push({
      schoolName,
      gradeName,
      className,
      studentCount: data.count,
      satisfactionScore: avgScore.toFixed(2),
    });
  }
  
  satisfactionResults.sort((a, b) => b.satisfactionScore - a.satisfactionScore);
  
  for (const r of satisfactionResults.slice(0, 20)) {
    console.log(`${r.schoolName} | ${r.gradeName}年级 | ${r.className} | ${r.studentCount} | ${r.satisfactionScore}`);
  }
  if (satisfactionResults.length > 20) {
    console.log(`... 还有 ${satisfactionResults.length - 20} 个班级`);
  }
  
  console.log('\n--- 阶段4: Mock学生对资源的评分 ---');
  const students = await prisma.graphNode.findMany({
    where: { nodeType: 'Student', scenarioId: scenario.id },
    select: { id: true },
  });
  console.log(`找到 ${students.length} 名学生`);
  
  if (resources.length === 0) {
    console.log('没有资源可评分，跳过');
  } else {
    const ratings: any[] = [];
    const shuffledStudents = [...students].sort(() => 0.5 - Math.random());
    const activeStudents = shuffledStudents.slice(0, Math.floor(students.length * 0.8));
    
    for (const student of activeStudents) {
      const ratedCount = 3 + Math.floor(Math.random() * 8);
      const shuffledResources = [...resources].sort(() => 0.5 - Math.random());
      const selectedResources = shuffledResources.slice(0, Math.min(ratedCount, resources.length));
      
      for (const resource of selectedResources) {
        const rate = parseFloat((1 + Math.random() * 4).toFixed(2));
        ratings.push({
          studentId: student.id,
          resourceId: resource.id,
          rate,
        });
      }
    }
    
    let createdCount = 0;
    const rateBatchSize = 200;
    for (let i = 0; i < ratings.length; i += rateBatchSize) {
      const result = await prisma.studentResourceRate.createMany({
        data: ratings.slice(i, i + rateBatchSize),
        skipDuplicates: true,
      });
      createdCount += result.count;
    }
    
    console.log(`成功创建 ${createdCount} 条评分记录`);
    console.log(`  - 参与学生: ${activeStudents.length} / ${students.length}`);
    console.log(`  - 人均评分: ${(createdCount / activeStudents.length).toFixed(1)}`);
  }
  
  console.log('\n=== 全部完成 ===');
  await prisma.$disconnect();
}

importData().catch(err => {
  console.error('导入失败:', err);
  process.exit(1);
});
