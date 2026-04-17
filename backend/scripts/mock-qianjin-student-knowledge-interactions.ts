import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const adapter = new PrismaMssql(databaseUrl);
const prisma = new PrismaClient({ adapter });

const CSV_PATH = path.resolve(__dirname, '../datas/script_filterd/前进小学学生-知识点交互表.csv');

interface StudentKnowledgeInteraction {
  studentName: string;
  studentId: string;
  knowledgeName: string;
  knowledgeId: string;
  interactionType: string;
  actionType: string;
  strength: number;
  durationSec: number;
  timestamp: string;
}

const INTERACTION_TYPES = ['PLATFORM', 'PHYSICAL'];
const ACTION_TYPES = ['BROWSE', 'STUDY', 'PRACTICE', 'FAVORITE', 'SHARE', 'COMMENT'];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateTimestamp(): string {
  const start = new Date('2026-01-14T08:00:00');
  const end = new Date('2026-01-14T17:00:00');
  const randomTime = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return randomTime.toISOString();
}

const TARGET_KNOWLEDGE_NAMES = [
  '插入图片（方法、位置调整）',
  '设置页面颜色 (背景)',
  '文本加粗、倾斜、下划线',
  '插入艺术字',
  '人工智能辅助创作',
  '编辑美化作品',
];

async function generateMockData(): Promise<StudentKnowledgeInteraction[]> {
  const school = await prisma.school.findUnique({
    where: { name: '杭州市钱塘区前进小学' },
  });
  
  if (!school) {
    throw new Error('前进小学不存在');
  }
  
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'COLLABORATIVE_LEARNING' },
  });
  
  if (!scenario) {
    throw new Error('场景不存在');
  }
  
  const students = await prisma.graphNode.findMany({
    where: { nodeType: 'Student', schoolId: school.id },
    select: { id: true, displayName: true },
  });
  
  const knowledges = await prisma.graphNode.findMany({
    where: {
      nodeType: 'Knowledge',
      scenarioId: scenario.id,
      displayName: { in: TARGET_KNOWLEDGE_NAMES },
    },
    select: { id: true, displayName: true },
  });
  
  console.log(`找到 ${students.length} 名学生, ${knowledges.length} 个知识点`);
  
  const interactions: StudentKnowledgeInteraction[] = [];
  const usedKeys = new Set<string>();
  const MAX_INTERACTIONS = 60;

  function tryAddInteraction(student: typeof students[0], knowledge: typeof knowledges[0]): boolean {
    const interactionType = randomChoice(INTERACTION_TYPES);
    const actionType = randomChoice(ACTION_TYPES);
    const key = `${student.id}_${knowledge.id}_${interactionType}_${actionType}`;

    if (usedKeys.has(key)) {
      return false;
    }

    usedKeys.add(key);
    interactions.push({
      studentName: student.displayName,
      studentId: student.id,
      knowledgeName: knowledge.displayName,
      knowledgeId: knowledge.id,
      interactionType,
      actionType,
      strength: parseFloat((Math.random() * 4 + 1).toFixed(2)),
      durationSec: randomInt(30, 600),
      timestamp: generateTimestamp(),
    });
    return true;
  }

  const shuffledStudents = [...students].sort(() => 0.5 - Math.random());

  for (const student of shuffledStudents) {
    if (interactions.length >= MAX_INTERACTIONS) break;
    const knowledge = randomChoice(knowledges);
    tryAddInteraction(student, knowledge);
  }

  let round = 0;
  while (interactions.length < MAX_INTERACTIONS && round < 5) {
    round++;
    const pool = [...students].sort(() => 0.5 - Math.random());
    const count = Math.min(
      pool.length,
      MAX_INTERACTIONS - interactions.length,
      Math.floor(students.length * (0.5 - round * 0.08)),
    );
    for (let i = 0; i < count; i++) {
      const student = pool[i];
      const available = knowledges.filter((k) => !usedKeys.has(`${student.id}_${k.id}_PLATFORM_STUDY`));
      const candidates = available.length > 0 ? available : knowledges;
      const knowledge = randomChoice(candidates);
      tryAddInteraction(student, knowledge);
    }
  }

  return interactions;
}

function saveToCSV(interactions: StudentKnowledgeInteraction[]) {
  const headers = [
    '学生姓名',
    '学生ID',
    '知识点名称',
    '知识点ID',
    '交互类型',
    '操作类型',
    '交互强度',
    '时长(秒)',
    '时间戳',
  ];
  
  const rows = interactions.map((item) => [
    item.studentName,
    item.studentId,
    item.knowledgeName,
    item.knowledgeId,
    item.interactionType,
    item.actionType,
    item.strength,
    item.durationSec,
    item.timestamp,
  ]);
  
  const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  fs.writeFileSync(CSV_PATH, '\uFEFF' + csvContent, { encoding: 'utf-8' });
  console.log(`CSV 文件已保存: ${CSV_PATH}`);
  console.log(`共 ${interactions.length} 条交互记录`);
}

async function saveToDatabase(interactions: StudentKnowledgeInteraction[]) {
  const school = await prisma.school.findUnique({
    where: { name: '杭州市钱塘区前进小学' },
  });
  
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'COLLABORATIVE_LEARNING' },
  });
  
  const session = await prisma.interactionSession.findFirst({
    where: {
      scenarioId: scenario!.id,
      schoolId: school!.id,
    },
  });
  
  if (!session) {
    throw new Error('未找到交互会话');
  }
  
  const existingCount = await prisma.interaction.count({
    where: {
      sessionId: session.id,
      sourceNode: { nodeType: 'Student' },
      targetNode: { nodeType: 'Knowledge' },
    },
  });
  
  if (existingCount > 0) {
    console.log(`数据库中已存在 ${existingCount} 条学生-知识点交互记录，跳过插入`);
    return;
  }
  
  const batchSize = 50;
  for (let i = 0; i < interactions.length; i += batchSize) {
    const batch = interactions.slice(i, i + batchSize);
    await prisma.interaction.createMany({
      data: batch.map((item) => ({
        sessionId: session.id,
        sourceNodeId: item.studentId,
        targetNodeId: item.knowledgeId,
        interactionType: item.interactionType,
        actionType: item.actionType,
        strength: item.strength,
        durationSec: item.durationSec,
      })),
    });
  }
  
  console.log(`数据库插入完成: ${interactions.length} 条交互记录`);
}

async function main() {
  console.log('=== 开始生成前进小学学生-知识点交互数据 ===');
  
  const interactions = await generateMockData();
  saveToCSV(interactions);
  await saveToDatabase(interactions);
  
  console.log('=== 完成 ===');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
