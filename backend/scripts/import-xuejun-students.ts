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

const SCHOOL_NAME = '杭州市学军小学云栖校区';
const GRADE_NAME = 5;
const CLASS_NAME = '五年级1班';
const SCENARIO_CODE = 'COLLABORATIVE_LEARNING';
const CSV_PATH = path.resolve(__dirname, '../datas/script_filterd/学军云栖学生_完整.csv');

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

function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  try {
    // Handle format: 2026/1/13 15:19
    const parts = dateStr.trim().split(/[\/\s:]/);
    if (parts.length >= 5) {
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const day = parseInt(parts[2]);
      const hour = parseInt(parts[3]);
      const minute = parseInt(parts[4]);
      return new Date(year, month, day, hour, minute);
    }
    return new Date(dateStr);
  } catch {
    return null;
  }
}

async function main() {
  console.log('=== 开始导入学军云栖学生数据 ===');

  // Read and parse CSV
  const csvContent = fs.readFileSync(CSV_PATH, { encoding: 'utf-8' });
  const allLines = csvContent.split('\n');
  
  // CSV has a pattern: data line, then " line, repeating
  // We need to merge data lines that are split across multiple physical lines
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
      sessionName: `${CLASS_NAME} - AI协作海报制作活动`,
      occurredAt: new Date('2026-01-13T14:00:00Z'),
    },
  });
  console.log(`创建交互会话: ${session.sessionName}`);

  const dimensionDefs = await prisma.cognitiveDimensionDef.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  console.log(`找到 ${dimensionDefs.length} 个认知维度`);

  const knowledgeNodes = await prisma.graphNode.findMany({
    where: { nodeType: 'Knowledge', scenarioId: scenario.id },
    select: { id: true, displayName: true },
  });
  console.log(`找到 ${knowledgeNodes.length} 个知识点节点`);

  const studentNodeIds: string[] = [];
  const importedStudents: { name: string; nodeId: string }[] = [];
  
  for (const row of records) {
    try {
      const name = row[0]?.trim();
      if (!name) continue;

      const externalUserId = row[2]?.trim();
      const gender = row[11]?.trim();
      const learningStyle = row[12]?.trim();
      const personality = row[13]?.trim();
      const groupBehavior = row[14]?.trim();

      // Parse Likert scale questions (columns 15-51, which are indices 15-51)
      // Note: columns 15-50 are Likert scale, column 51 is something else
      const likertScores: number[] = [];
      for (let i = 15; i <= 50; i++) {
        const score = parseOptionScore(row[i]);
        if (score > 0) likertScores.push(score);
      }
      
      const totalRawScore = likertScores.reduce((a, b) => a + b, 0);
      const avgScore = likertScores.length > 0 ? totalRawScore / likertScores.length : 0;

      const q4 = Number(row[55]) || 0;
      const q5 = Number(row[56]) || 0;
      const q6 = Number(row[57]) || 0;
      const q7 = Number(row[58]) || 0;
      const q8 = row[59]?.trim() || '';

      const workId = row[60]?.trim() || null;
      const workName = row[61]?.trim() || null;
      const workPublishedAt = parseDate(row[62]);
      const themeId = row[71]?.trim() || null;
      const themeName = row[70]?.trim() || null;
      const themeDirectory = row[69]?.trim() || null;
      const textbookName = row[68]?.trim() || null;
      const likeCount = parseInt(row[72]) || 0;
      const commentCount = parseInt(row[73]) || 0;
      const teacherName = row[74]?.trim() || null;
      const teacherScore = row[75]?.trim() ? parseFloat(row[75]) : null;
      const teacherComment = row[76]?.trim() || null;
      const likeDetails = row[77]?.trim() || null;
      const commentDetails = row[81]?.trim() || null;
      const activityLogCount = parseInt(row[83]) || 0;
      const activityLogMeta = row[84]?.trim() || null;

      const existingNode = await prisma.graphNode.findFirst({
        where: {
          nodeType: 'Student',
          displayName: name,
          scenarioId: scenario.id,
          schoolId: school.id,
        },
      });

      let studentNode;
      if (existingNode) {
        console.log(`学生 ${name} 已存在，更新数据...`);
        studentNode = existingNode;
        
        await prisma.studentProfile.upsert({
          where: { nodeId: studentNode.id },
          update: {
            externalUserId: externalUserId || null,
            learningStylePreference: learningStyle || null,
            personality: personality || null,
            groupBehavior: groupBehavior || null,
          },
          create: {
            nodeId: studentNode.id,
            externalUserId: externalUserId || null,
            learningStylePreference: learningStyle || null,
            personality: personality || null,
            groupBehavior: groupBehavior || null,
          },
        });
      } else {
        studentNode = await prisma.graphNode.create({
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
        console.log(`创建学生: ${name}`);
      }
      
      studentNodeIds.push(studentNode.id);
      importedStudents.push({ name, nodeId: studentNode.id });

      const existingSurvey = await prisma.studentSurveyResponse.findFirst({
        where: { studentNodeId: studentNode.id, scenarioId: scenario.id },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });

      if (existingSurvey) {
        await prisma.studentSurveyResponse.update({
          where: { id: existingSurvey.id },
          data: {
            submittedAt: row[53] ? new Date(row[53]) : null,
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
            helpSource: q8 || null,
          },
        });
      } else {
        await prisma.studentSurveyResponse.create({
          data: {
            studentNodeId: studentNode.id,
            scenarioId: scenario.id,
            submittedAt: row[53] ? new Date(row[53]) : null,
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
            helpSource: q8 || null,
          },
        });
      }

      const cognitiveProfile = await prisma.studentCognitiveProfile.create({
        data: {
          studentNodeId: studentNode.id,
          profileVersion: 'v1.0-xuejun-import',
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

      if (workId || workName) {
        const existingWork = await prisma.studentWork.findUnique({
          where: { externalWorkId: workId || `${studentNode.id}-work` },
        });

        if (existingWork) {
          await prisma.studentWork.update({
            where: { id: existingWork.id },
            data: {
              workName: workName || '未命名作品',
              publishedAt: workPublishedAt,
              themeId,
              themeName,
              themeDirectory,
              textbookName,
              likeCount,
              commentCount,
              teacherName,
              teacherScore: teacherScore ? teacherScore : null,
              teacherComment,
              likeDetails,
              commentDetails,
              activityLogCount,
              activityLogMeta,
            },
          });
        } else {
          await prisma.studentWork.create({
            data: {
              studentNodeId: studentNode.id,
              sessionId: session.id,
              externalWorkId: workId || `${studentNode.id}-work`,
              workName: workName || '未命名作品',
              publishedAt: workPublishedAt,
              themeId,
              themeName,
              themeDirectory,
              textbookName,
              likeCount,
              commentCount,
              teacherName,
              teacherScore: teacherScore ? teacherScore : null,
              teacherComment,
              likeDetails,
              commentDetails,
              activityLogCount,
              activityLogMeta,
            },
          });
        }
      }

      console.log(`导入学生: ${name} (平均分: ${avgScore.toFixed(2)}, 作品: ${workName || '无'})`);
    } catch (error) {
      console.error(`✗ 导入失败 ${row[0]}:`, error);
    }
  }

  console.log(`\n成功导入 ${importedStudents.length} 名学生`);

  // Create interactions with knowledge nodes
  if (knowledgeNodes.length > 0) {
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

  console.log('\n=== 导入完成 ===');
  
  const summary = await prisma.$transaction([
    prisma.school.count(),
    prisma.grade.count(),
    prisma.schoolClass.count(),
    prisma.graphNode.count({ where: { nodeType: 'Student' } }),
    prisma.studentProfile.count(),
    prisma.studentSurveyResponse.count(),
    prisma.studentCognitiveProfile.count(),
    prisma.studentWork.count(),
    prisma.interactionSession.count(),
    prisma.interaction.count(),
  ]);

  console.log('\n=== 数据库统计 ===');
  console.log(`学校数量: ${summary[0]}`);
  console.log(`年级数量: ${summary[1]}`);
  console.log(`班级数量: ${summary[2]}`);
  console.log(`学生节点: ${summary[3]}`);
  console.log(`学生档案: ${summary[4]}`);
  console.log(`问卷响应: ${summary[5]}`);
  console.log(`认知画像: ${summary[6]}`);
  console.log(`学生作品: ${summary[7]}`);
  console.log(`交互会话: ${summary[8]}`);
  console.log(`交互关系: ${summary[9]}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
