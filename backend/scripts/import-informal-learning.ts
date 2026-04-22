import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

const likertScaleMap: Record<string, number> = {
  '非常同意': 5,
  '同意': 4,
  '一般': 3,
  '不同意': 2,
  '非常不同意': 1,
};

function calculateAverageScore(responses: string[]): number {
  const scores = responses.map(r => likertScaleMap[r] || 0).filter(s => s > 0);
  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

async function importData() {
  console.log('Starting CSV import...');
  
  const csvPath = path.join(__dirname, '../datas/filterd/社团课等非正式学习学生.csv');
  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  
  const records = parse(fileContent, {
    skip_empty_lines: true,
    trim: true,
  });
  
  console.log(`Total records: ${records.length}`);
  
  let scenario = await prisma.learningScenario.findUnique({
    where: { code: 'INFORMAL_LEARNING' },
  });
  
  if (!scenario) {
    scenario = await prisma.learningScenario.create({
      data: {
        code: 'INFORMAL_LEARNING',
        nameZh: '社团课等非正式学习',
        sortOrder: 6,
        isActive: true,
      },
    });
    console.log('Created scenario:', scenario.id);
  } else {
    console.log('Found existing scenario:', scenario.id);
  }
  
  const schoolCache = new Map<string, string>();
  const gradeCache = new Map<string, string>();
  const classCache = new Map<string, string>();
  
  const batchSize = 50;
  let processed = 0;
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    
    for (const record of batch) {
      try {
        if (!record[2] || !record[6]) {
          failed++;
          processed++;
          continue;
        }
        
        const schoolName = record[6];
        const gradeName = record[8];
        const className = record[9];
        
        let schoolId = schoolCache.get(schoolName);
        if (!schoolId) {
          const existingSchool = await prisma.school.findUnique({
            where: { name: schoolName },
          });
          
          if (existingSchool) {
            schoolId = existingSchool.id;
          } else {
            const newSchool = await prisma.school.create({
              data: { name: schoolName },
            });
            schoolId = newSchool.id;
          }
          schoolCache.set(schoolName, schoolId);
        }
        
        const gradeCacheKey = `${schoolId}::${gradeName}`;
        let gradeId = gradeCache.get(gradeCacheKey);
        if (!gradeId) {
          const existingGrade = await prisma.grade.findUnique({
            where: { schoolId_gradeName: { schoolId, gradeName: parseInt(gradeName) || 0 } },
          });
          
          if (existingGrade) {
            gradeId = existingGrade.id;
          } else {
            const newGrade = await prisma.grade.create({
              data: {
                schoolId,
                gradeName: parseInt(gradeName) || 0,
              },
            });
            gradeId = newGrade.id;
          }
          gradeCache.set(gradeCacheKey, gradeId);
        }
        
        const classCacheKey = `${gradeId}::${className}`;
        let classId = classCache.get(classCacheKey);
        if (!classId) {
          const existingClass = await prisma.schoolClass.findUnique({
            where: { gradeId_className: { gradeId, className } },
          });
          
          if (existingClass) {
            classId = existingClass.id;
          } else {
            const newClass = await prisma.schoolClass.create({
              data: {
                gradeId,
                className,
              },
            });
            classId = newClass.id;
          }
          classCache.set(classCacheKey, classId);
        }
        
        const graphNode = await prisma.graphNode.create({
          data: {
            nodeType: 'Student',
            displayName: record[2],
            scenarioId: scenario.id,
            schoolId,
            gradeId,
            classId,
            studentProfile: {
              create: {
                externalUserId: record[1],
                learningStylePreference: record[12],
                personality: record[13],
                groupBehavior: record[14],
              },
            },
          },
        });
        
        const responses = record.slice(15, 55);
        const totalScore = calculateAverageScore(responses);
        
        await prisma.studentSurveyResponse.create({
          data: {
            studentNodeId: graphNode.id,
            scenarioId: scenario.id,
            submittedAt: new Date(record[10]),
            gender: record[11],
            learningStyle: record[12],
            personality: record[13],
            groupBehavior: record[14],
            totalScore: totalScore,
          },
        });
        
        success++;
      } catch (error) {
        console.error(`Failed to process record ${processed + 1}:`, error);
        failed++;
      }
      processed++;
    }
    
    if (i % 1000 === 0) {
      console.log(`Progress: ${processed}/${records.length} (Success: ${success}, Failed: ${failed})`);
    }
  }
  
  console.log('\nImport completed!');
  console.log(`Total processed: ${processed}`);
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
}

importData()
  .catch((error) => {
    console.error('Import failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });