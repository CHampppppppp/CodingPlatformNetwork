import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';

const adapter = new PrismaMariaDb('mysql://root@localhost:3306/interaction_network_test');
const prisma = new PrismaClient({ adapter });

const CSV_FILE = path.resolve(__dirname, '../datas/script_filterd/秀水小学学生筛选数据.csv');

const likertToScore: Record<string, number> = {
  '非常同意': 5,
  '同意': 4,
  '一般': 3,
  '不同意': 2,
  '非常不同意': 1,
};

function parseLikert(value: string): number | null {
  const score = likertToScore[value?.trim()];
  return score ?? null;
}

async function importData() {
  console.log('Reading CSV file...');
  const fileContent = fs.readFileSync(CSV_FILE, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    encoding: 'utf-8'
  });

  console.log(`Found ${records.length} records to import`);

  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'COLLABORATIVE_LEARNING' }
  });

  if (!scenario) {
    throw new Error('Scenario COLLABORATIVE_LEARNING not found');
  }

  console.log('Creating/retrieving school...');
  let school = await prisma.school.findUnique({
    where: { name: '杭州市秀水小学' }
  });

  if (!school) {
    school = await prisma.school.create({
      data: { name: '杭州市秀水小学' }
    });
    console.log('Created school:', school.name);
  } else {
    console.log('Found existing school:', school.name);
  }

  console.log('Creating/retrieving grade...');
  let grade = await prisma.grade.findUnique({
    where: { 
      schoolId_gradeName: {
        schoolId: school.id,
        gradeName: 6
      }
    }
  });

  if (!grade) {
    grade = await prisma.grade.create({
      data: {
        schoolId: school.id,
        gradeName: 6
      }
    });
    console.log('Created grade: 6年级');
  } else {
    console.log('Found existing grade: 6年级');
  }

  console.log('Creating/retrieving class...');
  let schoolClass = await prisma.schoolClass.findUnique({
    where: {
      gradeId_className: {
        gradeId: grade.id,
        className: '六年级10班'
      }
    }
  });

  if (!schoolClass) {
    schoolClass = await prisma.schoolClass.create({
      data: {
        gradeId: grade.id,
        className: '六年级10班'
      }
    });
    console.log('Created class: 六年级10班');
  } else {
    console.log('Found existing class: 六年级10班');
  }

  console.log('\nImporting students...');
  let successCount = 0;
  let errorCount = 0;

  for (const record of records) {
    try {
      const studentName = record['姓名']?.trim();
      const externalUserId = record['user_id']?.trim();
      const gender = record['性别']?.trim();
      const learningStyle = record['问卷_列13']?.trim();
      const personality = record['问卷_列14']?.trim();
      const groupBehavior = record['问卷_列15']?.trim();

      const totalScore = record['总分'] ? parseFloat(record['总分']) : null;

      const aiContentSatisfaction = record['4、AI帮你生成的文案或图片，符合你心里的想法吗？']?.trim();
      const resourceHelpfulness = record['5、智能体推送的资源链接对你制作海报有帮助吗？']?.trim();
      const posterSatisfaction = record['6、请评价你对今天自己制作的海报的满意程度：']?.trim();
      const teachingPreference = record['7、相比传统的"老师讲、学生做"，你更喜欢这种"和AI一起做项目"的上课方式吗？']?.trim();
      const helpSource = record['8、在这次设计中，谁给你的帮助最大？']?.trim();

      const existingNode = await prisma.graphNode.findFirst({
        where: {
          nodeType: 'Student',
          displayName: studentName,
          scenarioId: scenario.id
        }
      });

      if (existingNode) {
        console.log(`Student ${studentName} already exists, skipping...`);
        continue;
      }

      const studentNode = await prisma.graphNode.create({
        data: {
          nodeType: 'Student',
          displayName: studentName,
          scenarioId: scenario.id,
          schoolId: school.id,
          gradeId: grade.id,
          classId: schoolClass.id,
          studentProfile: {
            create: {
              externalUserId: externalUserId || null,
              learningStylePreference: learningStyle || null,
              personality: personality || null,
              groupBehavior: groupBehavior || null
            }
          }
        },
        include: {
          studentProfile: true
        }
      });

      await prisma.studentSurveyResponse.create({
        data: {
          studentNodeId: studentNode.id,
          scenarioId: scenario.id,
          gender: gender || null,
          learningStyle: learningStyle || null,
          personality: personality || null,
          groupBehavior: groupBehavior || null,
          totalScore: totalScore ? totalScore : null,
          aiContentSatisfaction: aiContentSatisfaction || null,
          resourceHelpfulness: resourceHelpfulness || null,
          posterSatisfaction: posterSatisfaction || null,
          teachingPreference: teachingPreference || null,
          helpSource: helpSource || null
        }
      });

      successCount++;
      console.log(`✓ Imported: ${studentName}`);

    } catch (error) {
      errorCount++;
      console.error(`✗ Failed to import ${record['姓名']}:`, error);
    }
  }

  console.log(`\nImport complete!`);
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
}

importData()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
