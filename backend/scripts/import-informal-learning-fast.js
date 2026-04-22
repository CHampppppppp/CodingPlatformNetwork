const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const prisma = new PrismaClient();

const likertScaleMap = {
  '非常同意': 5,
  '同意': 4,
  '一般': 3,
  '不同意': 2,
  '非常不同意': 1,
};

function calculateAverageScore(responses) {
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
  
  // Collect unique organizations
  const schoolNames = new Set();
  const gradeSet = new Set();
  const classSet = new Set();
  
  for (const record of records) {
    if (record[6]) schoolNames.add(record[6]);
    if (record[6] && record[8]) gradeSet.add(`${record[6]}::${record[8]}`);
    if (record[6] && record[8] && record[9]) {
      classSet.add(`${record[6]}::${record[8]}::${record[9]}`);
    }
  }
  
  // Create schools in parallel
  console.log('Creating schools...');
  const schoolMap = new Map();
  await Promise.all(
    Array.from(schoolNames).map(async (name) => {
      const school = await prisma.school.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      schoolMap.set(name, school.id);
    })
  );
  console.log(`Created ${schoolMap.size} schools`);
  
  // Create grades in parallel
  console.log('Creating grades...');
  const gradeMap = new Map();
  await Promise.all(
    Array.from(gradeSet).map(async (key) => {
      const [schoolName, gradeName] = key.split('::');
      const schoolId = schoolMap.get(schoolName);
      const grade = await prisma.grade.upsert({
        where: { schoolId_gradeName: { schoolId, gradeName: parseInt(gradeName) || 0 } },
        update: {},
        create: { schoolId, gradeName: parseInt(gradeName) || 0 },
      });
      gradeMap.set(key, grade.id);
    })
  );
  console.log(`Created ${gradeMap.size} grades`);
  
  // Create classes in parallel
  console.log('Creating classes...');
  const classMap = new Map();
  await Promise.all(
    Array.from(classSet).map(async (key) => {
      const [schoolName, gradeName, className] = key.split('::');
      const gradeKey = `${schoolName}::${gradeName}`;
      const gradeId = gradeMap.get(gradeKey);
      const cls = await prisma.schoolClass.upsert({
        where: { gradeId_className: { gradeId, className } },
        update: {},
        create: { gradeId, className },
      });
      classMap.set(key, cls.id);
    })
  );
  console.log(`Created ${classMap.size} classes`);
  
  // Import students in batches
  console.log('Importing students...');
  const batchSize = 1000;
  let processed = 0;
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    
    await prisma.$transaction(async (tx) => {
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
          const schoolId = schoolMap.get(schoolName);
          const gradeKey = `${schoolName}::${gradeName}`;
          const gradeId = gradeMap.get(gradeKey);
          const classKey = `${schoolName}::${gradeName}::${className}`;
          const classId = classMap.get(classKey);
          
          const graphNode = await tx.graphNode.create({
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
          
          const responses = record.slice(15);
          const totalScore = calculateAverageScore(responses);
          
          await tx.studentSurveyResponse.create({
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
          console.error(`Failed: ${error.message}`);
          failed++;
        }
        processed++;
      }
    });
    
    console.log(`Progress: ${processed}/${records.length} (Success: ${success}, Failed: ${failed})`);
  }
  
  console.log('\nImport completed!');
  console.log(`Total: ${processed}, Success: ${success}, Failed: ${failed}`);
}

importData()
  .catch((error) => {
    console.error('Import failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
