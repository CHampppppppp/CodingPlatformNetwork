#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { parse as csvParse } from 'csv-parse/sync';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) { throw new Error('DATABASE_URL is not set'); }

let prisma: PrismaClient;
if (databaseUrl.startsWith('sqlserver://')) {
  prisma = new PrismaClient({ adapter: new PrismaMssql(databaseUrl) });
} else {
  prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });
}

const SCENARIO_CODE = 'ONLINE_COURSE';
const SCENARIO_NAME = '学科课程在线学习';
const DATAS_DIR = path.resolve(__dirname, '../datas');
const CONCURRENCY = 5;

// ── CSV helpers ──

function readSimpleCsv(filename: string): Record<string, string>[] {
  const content = fs.readFileSync(path.join(DATAS_DIR, filename), 'utf-8');
  return csvParse(content, { columns: true, skip_empty_lines: true, relax_column_count: true, bom: true });
}

interface KnowledgeRow {
  courses_id: string;
  content: string;
  knowledgePoints: string;
  grade: string;
  main: string;
  id: string;
}

function readKnowledgesCsv(): KnowledgeRow[] {
  const content = fs.readFileSync(path.join(DATAS_DIR, 'ONLINE_COURSE_knowledges.csv'), 'utf-8');
  const lines = content.split('\n');
  const results: KnowledgeRow[] = [];
  let current = '';

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() && !current) continue;
    current = current ? current + '\n' + line : line;

    // Record ends with: ,"[grade]","main_text","id_number"
    const endMatch = current.match(/,"(\[\d+(?:,\d+)*\])","([^"]*)","(\d+)"\s*$/);
    if (endMatch) {
      const grade = endMatch[1];
      const main = endMatch[2];
      const id = endMatch[3];
      const coursesMatch = current.match(/^"(\d+)"/);
      const coursesId = coursesMatch ? coursesMatch[1] : '';
      const kpMatch = current.match(/","([^"]+)","(\[\d)/);
      const kp = kpMatch ? kpMatch[1] : '';

      results.push({
        courses_id: coursesId,
        content: '',
        knowledgePoints: kp,
        grade,
        main,
        id,
      });
      current = '';
    }
  }
  return results;
}

function parseGrade(gradeStr: string): number[] {
  try {
    const parsed = JSON.parse(gradeStr);
    if (Array.isArray(parsed)) return parsed.map(Number).filter((n) => !isNaN(n));
  } catch {}
  return [];
}

function isSingleValueGrade(gradeStr: string): boolean {
  return parseGrade(gradeStr).length === 1;
}

// ── Concurrency helper ──

async function parallelLimit<T>(items: T[], fn: (item: T) => Promise<void>, limit: number): Promise<void> {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i]);
      if (i % 500 === 0) process.stdout.write(`  ${i + 1}/${items.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  process.stdout.write(`  ${items.length}/${items.length}\n`);
}

// ── Main ──

async function main() {
  console.log('=== ONLINE_COURSE 数据导入 ===\n');

  const existing = await prisma.learningScenario.findUnique({
    where: { code: SCENARIO_CODE },
    include: { _count: { select: { nodes: true } } },
  });
  if (existing && existing._count.nodes > 0) {
    console.log(`已有 ${existing._count.nodes} 个节点，跳过。运行 cleanup-online-course.ts 清除后重试。`);
    await prisma.$disconnect();
    return;
  }

  const scenario = await prisma.learningScenario.upsert({
    where: { code: SCENARIO_CODE },
    update: {},
    create: { code: SCENARIO_CODE, nameZh: SCENARIO_NAME, sortOrder: 1, isActive: true },
  });

  const users = readSimpleCsv('ONLINE_COURSE_users.csv');
  const classes = readSimpleCsv('ONLINE_COURSE_classes.csv');
  const knowledges = readKnowledgesCsv();
  const comments = readSimpleCsv('ONLINE_COURSE_comments.csv');
  const likes = readSimpleCsv('ONLINE_COURSE_likes.csv');
  console.log(`CSV: users=${users.length} classes=${classes.length} knowledges=${knowledges.length} comments=${comments.length} likes=${likes.length}\n`);

  const userIdMap = new Map<string, string>();
  const knowledgeIdMap = new Map<string, string>();
  const schoolIdMap = new Map<string, string>();
  const gradeIdMap = new Map<string, string>();
  const classIdMap = new Map<string, string>();

  // ── 组织层级 ──
  console.log('--- 组织层级 ---');
  const allSchoolCodes = new Set<string>();
  const orgSet = new Map<string, { school: string; gradeName: number; className: string }>();

  for (const u of users) {
    const sc = u['school']?.trim();
    if (sc) allSchoolCodes.add(sc);
    if (u['role']?.trim() === '1' && isSingleValueGrade(u['grade'])) {
      const school = sc || 'unknown';
      const gn = parseGrade(u['grade'])[0];
      const cn = u['classes']?.trim() || '0';
      const key = `${school}:${gn}:${cn}`;
      if (!orgSet.has(key)) orgSet.set(key, { school, gradeName: gn, className: cn });
    }
  }

  for (const code of [...allSchoolCodes, 'unknown']) {
    const name = code === 'unknown' ? '未知学校' : code;
    const s = await prisma.school.upsert({ where: { name }, update: {}, create: { name } });
    schoolIdMap.set(code, s.id);
  }

  const seenGrades = new Set<string>();
  for (const [, org] of orgSet) {
    const gk = `${org.school}:${org.gradeName}`;
    if (seenGrades.has(gk)) continue;
    seenGrades.add(gk);
    const sid = schoolIdMap.get(org.school);
    if (!sid) continue;
    const g = await prisma.grade.upsert({
      where: { schoolId_gradeName: { schoolId: sid, gradeName: org.gradeName } },
      update: {},
      create: { schoolId: sid, gradeName: org.gradeName },
    });
    gradeIdMap.set(gk, g.id);
  }

  for (const [, org] of orgSet) {
    const gk = `${org.school}:${org.gradeName}`;
    const gid = gradeIdMap.get(gk);
    if (!gid) continue;
    const ck = `${org.school}:${org.gradeName}:${org.className}`;
    const c = await prisma.schoolClass.upsert({
      where: { gradeId_className: { gradeId: gid, className: org.className } },
      update: {},
      create: { gradeId: gid, className: org.className },
    });
    classIdMap.set(ck, c.id);
  }
  console.log(`学校=${schoolIdMap.size} 年级=${gradeIdMap.size} 班级=${classIdMap.size}\n`);

  // ── 教师 ──
  console.log('--- 教师 ---');
  const teachers = users.filter((u) => u['role']?.trim() === '2');
  let teacherCount = 0;

  await parallelLimit(teachers, async (user) => {
    const csvId = user['id']?.trim();
    const userId = user['user_id']?.trim();
    const schoolCode = user['school']?.trim();
    const grades = parseGrade(user['grade']);
    const mainGrade = grades[0] || 0;
    const schoolId = schoolCode ? schoolIdMap.get(schoolCode) : undefined;
    const gk = schoolCode ? `${schoolCode}:${mainGrade}` : null;
    const gradeId = gk ? gradeIdMap.get(gk) : undefined;

    let classId: string | undefined;
    if (schoolId && gradeId) {
      for (const [ck, cid] of classIdMap.entries()) {
        if (ck.startsWith(`${schoolCode}:${mainGrade}:`)) { classId = cid; break; }
      }
    }

    const node = await prisma.graphNode.create({
      data: {
        nodeType: 'Teacher', displayName: userId || `teacher_${csvId}`, scenarioId: scenario.id,
        schoolId, gradeId, classId,
        teacherProfile: { create: { subject: '编程', teachingGrade: mainGrade || null, schoolId, gradeId, classId } },
      },
    });
    userIdMap.set(csvId, node.id);
    teacherCount++;
  }, CONCURRENCY);
  console.log(`教师=${teacherCount}\n`);

  // ── 学生 ──
  console.log('--- 学生 ---');
  const validStudents = users.filter((u) => u['role']?.trim() === '1' && isSingleValueGrade(u['grade']));
  let studentCount = 0;
  const studentGradeMap = new Map<string, number>(); // nodeId → grade

  await parallelLimit(validStudents, async (user) => {
    const csvId = user['id']?.trim();
    const userId = user['user_id']?.trim();
    const schoolCode = user['school']?.trim() || 'unknown';
    const gradeName = parseGrade(user['grade'])[0];
    const className = user['classes']?.trim() || '0';
    const schoolId = schoolIdMap.get(schoolCode);
    const gk = `${schoolCode}:${gradeName}`;
    const gradeId = gradeIdMap.get(gk);
    const ck = `${schoolCode}:${gradeName}:${className}`;
    const classId = classIdMap.get(ck);
    if (!schoolId || !gradeId) return;

    const node = await prisma.graphNode.create({
      data: {
        nodeType: 'Student', displayName: userId || `student_${csvId}`, scenarioId: scenario.id,
        schoolId, gradeId, classId,
        studentProfile: { create: { externalUserId: userId } },
      },
    });
    userIdMap.set(csvId, node.id);
    studentGradeMap.set(node.id, gradeName);
    studentCount++;
  }, CONCURRENCY);
  console.log(`学生=${studentCount}\n`);

  // ── 知识点 ──
  console.log('--- 知识点 ---');
  let knowledgeCount = 0;

  await parallelLimit(knowledges, async (k) => {
    const mainPoint = k.main || k.knowledgePoints.split('、')[0] || `知识_${k.id}`;
    const grades = parseGrade(k.grade);
    const mainGrade = grades[0] || 0;

    let schoolId: string | undefined, gradeId: string | undefined;
    for (const [sc, sid] of schoolIdMap.entries()) {
      const gid = gradeIdMap.get(`${sc}:${mainGrade}`);
      if (gid) { schoolId = sid; gradeId = gid; break; }
    }

    const node = await prisma.graphNode.create({
      data: {
        nodeType: 'Knowledge', displayName: mainPoint, scenarioId: scenario.id,
        schoolId, gradeId,
        knowledgeProfile: { create: { content: k.content || null, knowledgeType: k.knowledgePoints.split('、')[0] || null, category: mainPoint } },
      },
    });
    knowledgeIdMap.set(k.id, node.id);
    knowledgeCount++;
  }, CONCURRENCY);
  console.log(`知识点=${knowledgeCount}\n`);

  // ── 学生-知识点关联 + STUDY 交互 ──
  console.log('--- 学生-知识点关联 ---');
  const gradeToKnowledgeIds = new Map<number, string[]>();
  for (const k of knowledges) {
    const nodeId = knowledgeIdMap.get(k.id);
    if (!nodeId) continue;
    for (const g of parseGrade(k.grade)) {
      if (!gradeToKnowledgeIds.has(g)) gradeToKnowledgeIds.set(g, []);
      gradeToKnowledgeIds.get(g)!.push(nodeId);
    }
  }

  // Create sessions first (needed for interactions)
  console.log('--- 交互会话 ---');
  const sessionMap = new Map<string, string>();
  for (const [gk, gradeId] of gradeIdMap.entries()) {
    const [sc, gn] = gk.split(':');
    const schoolId = schoolIdMap.get(sc);
    if (!schoolId) continue;
    const sname = sc === 'unknown' ? '未知学校' : sc;
    const session = await prisma.interactionSession.create({
      data: { scenarioId: scenario.id, schoolId, gradeId, sessionName: `${sname} ${gn}年级在线学习`, occurredAt: new Date('2025-09-01T09:00:00Z') },
    });
    sessionMap.set(gk, session.id);
  }
  console.log(`会话=${sessionMap.size}\n`);

  // Student-knowledge relations + STUDY interactions (5 per student max)
  const MAX_KNOWLEDGE_PER_STUDENT = 5;
  type RelData = { studentNodeId: string; knowledgeNodeId: string; sessionId: string; gradeKey: string };
  const allRels: RelData[] = [];

  for (const [nodeId, gradeName] of studentGradeMap.entries()) {
    const kIds = (gradeToKnowledgeIds.get(gradeName) || []).slice(0, MAX_KNOWLEDGE_PER_STUDENT);
    // Find session for this student
    // Need to find the school/grade key from nodeId
    let studentGradeKey = '';
    for (const [gk, sid] of sessionMap.entries()) {
      const [, gn] = gk.split(':');
      if (parseInt(gn) === gradeName) {
        // Check if this session's school matches the student's school
        // For now, just use any session with matching grade
        studentGradeKey = gk;
        break;
      }
    }
    const sessionId = sessionMap.get(studentGradeKey) || sessionMap.values().next().value;
    if (!sessionId) continue;

    for (const kid of kIds) {
      allRels.push({ studentNodeId: nodeId, knowledgeNodeId: kid, sessionId, gradeKey: studentGradeKey });
    }
  }

  let relationCount = 0;
  let studyInteractionCount = 0;

  await parallelLimit(allRels, async (rel) => {
    try {
      await prisma.studentKnowledgeRelation.create({ data: { studentNodeId: rel.studentNodeId, knowledgeNodeId: rel.knowledgeNodeId } });
      relationCount++;
    } catch { return; }

    try {
      await prisma.interaction.create({
        data: {
          interactionType: 'PLATFORM', actionType: 'STUDY', strength: 1.0,
          sessionId: rel.sessionId, sourceNodeId: rel.studentNodeId, targetNodeId: rel.knowledgeNodeId,
        },
      });
      studyInteractionCount++;
    } catch {}
  }, CONCURRENCY);
  console.log(`关联=${relationCount} STUDY交互=${studyInteractionCount}\n`);

  // ── 评论+点赞交互 ──
  console.log('--- 社交交互 ---');
  type InterData = { sourceId: string; targetId: string; sessionId: string; actionType: string; strength: number };
  const socialInteractions: InterData[] = [];

  for (const c of comments) {
    const sourceId = userIdMap.get(c['commenter_id']?.trim());
    const targetId = userIdMap.get(c['user_id']?.trim());
    if (!sourceId || !targetId) continue;
    const school = c['school']?.trim() || 'unknown';
    const grades = parseGrade(c['grade']?.trim() || '[]');
    const gk = `${school}:${grades[0] || 0}`;
    const sessionId = sessionMap.get(gk) || sessionMap.values().next().value;
    if (!sessionId) continue;
    socialInteractions.push({ sourceId, targetId, sessionId, actionType: 'COMMENT', strength: 1.0 });
  }

  const firstSessionId = sessionMap.values().next().value;
  for (const l of likes) {
    const sourceId = userIdMap.get(l['liker_id']?.trim());
    const targetId = userIdMap.get(l['liked_user_id']?.trim());
    if (!sourceId || !targetId || !firstSessionId) continue;
    const isActive = l['is_active']?.trim() === '1';
    socialInteractions.push({ sourceId, targetId, sessionId: firstSessionId, actionType: 'LIKE', strength: isActive ? 1.0 : 0.5 });
  }

  let socialCount = 0;
  await parallelLimit(socialInteractions, async (d) => {
    await prisma.interaction.create({
      data: { interactionType: 'PLATFORM', actionType: d.actionType, strength: d.strength, sessionId: d.sessionId, sourceNodeId: d.sourceId, targetNodeId: d.targetId },
    }).then(() => { socialCount++; }).catch(() => {});
  }, CONCURRENCY);
  console.log(`社交交互=${socialCount} (评论+点赞)\n`);

  // ── 汇总 ──
  console.log('=== 完成 ===');
  console.log(`学生=${studentCount} 教师=${teacherCount} 知识点=${knowledgeCount}`);
  console.log(`会话=${sessionMap.size} 关联=${relationCount} STUDY=${studyInteractionCount} 社交=${socialCount}`);
  console.log(`总节点≈${studentCount + teacherCount + knowledgeCount} 总交互≈${studyInteractionCount + socialCount}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error('导入失败:', e); prisma.$disconnect(); process.exit(1); });
