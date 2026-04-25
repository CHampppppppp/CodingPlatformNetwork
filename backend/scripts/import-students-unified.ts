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

const DIMENSION_COLUMN_MAP: Record<string, number[]> = {
  learningMotivation: [15, 16, 17],
  learningAttitude: [18, 19, 20],
  learningEngagement: [21, 22, 23],
  selfRegulatedLearning: [24, 25, 26],
  computationalThinking: [27, 28, 29],
  learningMethod: [30, 31, 32],
  cognitiveLoad: [33, 34, 35],
  humanAiTrust: [36, 37, 38],
  aiLiteracy: [39, 40, 41, 42, 43, 44, 45, 46],
  knowledgeReserve: [47, 48, 49, 50, 51, 52],
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

interface SchoolConfig {
  name: string;
  gradeName: number;
  className: string;
  csvPath: string;
  csvFormat: 'simple' | 'complex';
  sessionName?: string;
  sessionDate?: string;
}

interface ImportConfig {
  schools: SchoolConfig[];
}

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

function calculateDimensionScore(row: any[], columnIndices: number[]): number {
  const scores = columnIndices.map(idx => parseOptionScore(row[idx])).filter(s => s > 0);
  return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
}

function parseSimpleCSV(filePath: string): any[] {
  const csvContent = fs.readFileSync(filePath, { encoding: 'utf-8' });
  return parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    encoding: 'utf-8',
    bom: true,
  });
}

function parseComplexCSV(filePath: string): any[] {
  const csvContent = fs.readFileSync(filePath, { encoding: 'utf-8' });
  const allLines = csvContent.split('\n');
  
  const records: any[] = [];
  let currentLine = '';
  let isFirstLine = true;
  
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim();
    
    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }
    
    if (line === '"') {
      continue;
    }
    
    if (line.startsWith('"') && !line.endsWith('"')) {
      currentLine = line;
    } else if (!line.startsWith('"') && currentLine) {
      currentLine += '\n' + line;
    } else {
      if (currentLine) {
        currentLine += '\n' + line;
        try {
          const parsed = parse(currentLine, {
            columns: false,
            skip_empty_lines: true,
            relax_quotes: true,
            relax_column_count: true,
          });
          if (parsed.length > 0 && parsed[0].length > 5) {
            records.push(parsed[0]);
          }
        } catch (e) {
          continue;
        }
        currentLine = '';
      } else {
        try {
          const parsed = parse(line, {
            columns: false,
            skip_empty_lines: true,
            relax_quotes: true,
            relax_column_count: true,
          });
          if (parsed.length > 0 && parsed[0].length > 5) {
            records.push(parsed[0]);
          }
        } catch (e) {
          console.warn(`Skipping malformed line: ${line.substring(0, 50)}...`);
        }
      }
    }
  }
  
  return records;
}

async function importSchool(schoolConfig: SchoolConfig) {
  console.log(`\n=== 开始导入 ${schoolConfig.name} - ${schoolConfig.className} ===`);

  const csvPath = path.isAbsolute(schoolConfig.csvPath) 
    ? schoolConfig.csvPath 
    : path.resolve(__dirname, schoolConfig.csvPath);

  if (!fs.existsSync(csvPath)) {
    console.log(`⚠️ CSV文件不存在: ${csvPath}，跳过`);
    return;
  }

  const records = schoolConfig.csvFormat === 'complex' 
    ? parseComplexCSV(csvPath)
    : parseSimpleCSV(csvPath);
    
  console.log(`读取到 ${records.length} 条学生记录`);

  const scenario = await prisma.learningScenario.findUnique({
    where: { code: SCENARIO_CODE },
  });
  if (!scenario) {
    throw new Error(`场景 ${SCENARIO_CODE} 不存在`);
  }

  let school = await prisma.school.findUnique({
    where: { name: schoolConfig.name },
  });
  if (!school) {
    school = await prisma.school.create({ data: { name: schoolConfig.name } });
    console.log(`创建学校: ${school.name}`);
  } else {
    console.log(`使用已有学校: ${school.name}`);
  }

  let grade = await prisma.grade.findUnique({
    where: {
      schoolId_gradeName: {
        schoolId: school.id,
        gradeName: schoolConfig.gradeName,
      },
    },
  });
  if (!grade) {
    grade = await prisma.grade.create({
      data: { schoolId: school.id, gradeName: schoolConfig.gradeName },
    });
    console.log(`创建年级: ${grade.gradeName}`);
  } else {
    console.log(`使用已有年级: ${grade.gradeName}`);
  }

  let schoolClass = await prisma.schoolClass.findUnique({
    where: {
      gradeId_className: {
        gradeId: grade.id,
        className: schoolConfig.className,
      },
    },
  });
  if (!schoolClass) {
    schoolClass = await prisma.schoolClass.create({
      data: { gradeId: grade.id, className: schoolConfig.className },
    });
    console.log(`创建班级: ${schoolClass.className}`);
  } else {
    console.log(`使用已有班级: ${schoolClass.className}`);
  }

  const existingStudents = await prisma.graphNode.count({
    where: {
      nodeType: 'Student',
      scenarioId: scenario.id,
      classId: schoolClass.id,
    },
  });
  if (existingStudents > 0) {
    console.log(`⚠️ 该班级已存在 ${existingStudents} 名学生，跳过导入`);
    return;
  }

  const sessionName = schoolConfig.sessionName || `${schoolConfig.className} - 在线协作学习活动`;
  const sessionDate = schoolConfig.sessionDate ? new Date(schoolConfig.sessionDate) : new Date();
  
  const session = await prisma.interactionSession.create({
    data: {
      scenarioId: scenario.id,
      schoolId: school.id,
      gradeId: grade.id,
      classId: schoolClass.id,
      sessionName,
      occurredAt: sessionDate,
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
    const name = schoolConfig.csvFormat === 'complex' 
      ? row[0]?.trim()
      : row['姓名']?.trim();
      
    if (!name) continue;

    const externalUserId = schoolConfig.csvFormat === 'complex'
      ? row[2]?.trim()
      : row['user_id']?.trim();
      
    const gender = schoolConfig.csvFormat === 'complex'
      ? row[11]?.trim()
      : row['性别']?.trim();
      
    const learningStyle = schoolConfig.csvFormat === 'complex'
      ? row[12]?.trim()
      : row['问卷_列13']?.trim();
      
    const personality = schoolConfig.csvFormat === 'complex'
      ? row[13]?.trim()
      : row['问卷_列14']?.trim();
      
    const groupBehavior = schoolConfig.csvFormat === 'complex'
      ? row[14]?.trim()
      : row['问卷_列15']?.trim();

    const dimensionScores: Record<string, number> = {};
    for (const [dimCode, columns] of Object.entries(DIMENSION_COLUMN_MAP)) {
      dimensionScores[dimCode] = calculateDimensionScore(row, columns);
    }

    const allValidScores = Object.values(DIMENSION_COLUMN_MAP)
      .flat()
      .map(idx => parseOptionScore(row[idx]))
      .filter(s => s > 0);
    const totalScore = allValidScores.length > 0
      ? allValidScores.reduce((a, b) => a + b, 0) / allValidScores.length
      : 0;

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
        totalScore: totalScore,
      },
    });

    const cognitiveProfile = await prisma.studentCognitiveProfile.create({
      data: {
        studentNodeId: studentNode.id,
        profileVersion: 'v1.0-unified-import',
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

    console.log(`导入学生: ${name} (总均分: ${totalScore.toFixed(2)})`);
  }

  if (knowledgeNodes.length > 0 && studentNodeIds.length > 0) {
    const interactionData: any[] = [];
    for (const studentId of studentNodeIds) {
      const kCount = 2 + Math.floor(Math.random() * 3);
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
  }

  console.log(`✅ 成功导入 ${studentNodeIds.length} 名学生`);
}

async function main() {
  const args = process.argv.slice(2);
  const configArg = args.find(arg => arg.startsWith('--config='));
  
  if (!configArg) {
    console.error('使用方法: npx ts-node scripts/import-students-unified.ts --config=./import-config.json');
    console.error('');
    console.error('配置文件示例:');
    console.error(JSON.stringify({
      schools: [
        {
          name: '杭州市学军小学云栖校区',
          gradeName: 5,
          className: '五年级1班',
          csvPath: './datas/script_filterd/学军云栖学生_完整.csv',
          csvFormat: 'complex',
          sessionName: 'AI协作海报制作活动',
          sessionDate: '2026-01-13T14:00:00Z'
        }
      ]
    }, null, 2));
    process.exit(1);
  }

  const configPath = configArg.replace('--config=', '');
  const fullConfigPath = path.isAbsolute(configPath) 
    ? configPath 
    : path.resolve(__dirname, configPath);

  if (!fs.existsSync(fullConfigPath)) {
    console.error(`配置文件不存在: ${fullConfigPath}`);
    process.exit(1);
  }

  const config: ImportConfig = JSON.parse(fs.readFileSync(fullConfigPath, 'utf-8'));

  console.log('=== 开始统一导入学生数据 ===');
  console.log(`配置文件: ${fullConfigPath}`);
  console.log(`共 ${config.schools.length} 个学校/班级`);

  for (const schoolConfig of config.schools) {
    await importSchool(schoolConfig);
  }

  console.log('\n=== 全部导入完成 ===');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
