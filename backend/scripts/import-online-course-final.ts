#!/usr/bin/env ts-node
import * as fs from "fs";
import * as path from "path";
import { parse as csvParse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DATAS_DIR = path.resolve(__dirname, "../datas/ONLINE_COURSE");
const CSV_FILE = process.env.LONG_FORMAT_CSV ?? "ONLINE_COURSE_long_format_v2.csv";
const DEFAULT_OCCURRED_AT = new Date("2026-01-13T00:00:00Z");
const DEFAULT_CLASS_FALLBACK = "默认班级";
const SCENARIO_CODE = "ONLINE_COURSE";
const SCENARIO_NAME = "学科课程在线学习";

type CsvRow = Record<string, string>;

async function main() {
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });

  console.log("=== ONLINE_COURSE v4 入库（Knowledge 跳过，用 cuid 关联） ===\n");

  // 1. Read v4 CSV
  const filepath = path.join(DATAS_DIR, CSV_FILE);
  const content = fs.readFileSync(filepath, "utf-8");
  const rows: CsvRow[] = csvParse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });
  console.log(`Read ${rows.length} rows from ${CSV_FILE}`);

  // 2. Ensure scenario
  const scenario = await prisma.learningScenario.upsert({
    where: { code: SCENARIO_CODE },
    update: {},
    create: { code: SCENARIO_CODE, nameZh: SCENARIO_NAME, sortOrder: 1, isActive: true },
  });
  console.log(`Scenario: ${scenario.code} (${scenario.id})`);

  // 3. Load existing Knowledge GraphNodes (cuid === GraphNode.id)
  const knowledgeNodes = await prisma.graphNode.findMany({
    where: { scenarioId: scenario.id, nodeType: "Knowledge" },
    select: { id: true, displayName: true },
  });
  const cuidSet = new Set(knowledgeNodes.map((n) => n.id));
  console.log(`Existing Knowledge nodes: ${knowledgeNodes.length}`);

  if (knowledgeNodes.length === 0) {
    console.error(
      "ERROR: No Knowledge nodes in DB. Run scripts/ingest-online-course-knowledges.ts first.",
    );
    process.exit(1);
  }

  // 4. Build org hierarchy (schools/grades/classes) — dedup in-memory
  const schoolIdByName = new Map<string, string>();
  const gradeIdByKey = new Map<string, string>();
  const classIdByKey = new Map<string, string>();

  for (const row of rows) {
    const schoolName = (row["school_id"] || "").trim();
    if (!schoolName) continue;
    if (!schoolIdByName.has(schoolName)) {
      const s = await prisma.school.upsert({
        where: { scenarioId_name: { scenarioId: scenario.id, name: schoolName } },
        update: {},
        create: { scenarioId: scenario.id, name: schoolName },
      });
      schoolIdByName.set(schoolName, s.id);
    }
  }
  console.log(`Schools: ${schoolIdByName.size}`);

  for (const row of rows) {
    const schoolName = (row["school_id"] || "").trim();
    const gradeName = parseInt(row["年级"] || "", 10);
    if (!schoolName || Number.isNaN(gradeName)) continue;
    const schoolId = schoolIdByName.get(schoolName)!;
    const key = `${schoolId}|${gradeName}`;
    if (!gradeIdByKey.has(key)) {
      const g = await prisma.grade.upsert({
        where: { schoolId_gradeName: { schoolId, gradeName } },
        update: {},
        create: { schoolId, gradeName },
      });
      gradeIdByKey.set(key, g.id);
    }
  }
  console.log(`Grades: ${gradeIdByKey.size}`);

  for (const row of rows) {
    const schoolName = (row["school_id"] || "").trim();
    const gradeName = parseInt(row["年级"] || "", 10);
    const rawClass = (row["班级"] || "").trim();
    if (!schoolName || Number.isNaN(gradeName)) continue;
    const schoolId = schoolIdByName.get(schoolName)!;
    const gradeId = gradeIdByKey.get(`${schoolId}|${gradeName}`)!;
    const className = rawClass || DEFAULT_CLASS_FALLBACK;
    const key = `${gradeId}|${className}`;
    if (!classIdByKey.has(key)) {
      const c = await prisma.class.upsert({
        where: { gradeId_className: { gradeId, className } },
        update: {},
        create: { gradeId, className },
      });
      classIdByKey.set(key, c.id);
    }
  }
  console.log(`Classes: ${classIdByKey.size}`);

  // 5. Sessions
  const sessionIdByExternalId = new Map<string, string>();
  const sessionNameByKey = new Map<string, string>();
  for (const row of rows) {
    const schoolName = (row["school_id"] || "").trim();
    const gradeName = parseInt(row["年级"] || "", 10);
    const rawClass = (row["班级"] || "").trim();
    if (!schoolName || Number.isNaN(gradeName)) continue;
    const schoolId = schoolIdByName.get(schoolName)!;
    const gradeId = gradeIdByKey.get(`${schoolId}|${gradeName}`)!;
    const className = rawClass || DEFAULT_CLASS_FALLBACK;
    const classId = classIdByKey.get(`${gradeId}|${className}`)!;
    const externalId = `${schoolName}:${gradeName}:${className}`;
    if (sessionIdByExternalId.has(externalId)) continue;
    const existing = await prisma.interactionSession.findFirst({
      where: { scenarioId: scenario.id, schoolId, gradeId, classId, occurredAt: DEFAULT_OCCURRED_AT },
    });
    if (existing) {
      sessionIdByExternalId.set(externalId, existing.id);
      continue;
    }
    const sessionName = `${schoolName} ${gradeName}年级 ${className} 班`;
    const s = await prisma.interactionSession.create({
      data: {
        scenarioId: scenario.id,
        schoolId,
        gradeId,
        classId,
        sessionName,
        occurredAt: DEFAULT_OCCURRED_AT,
      },
    });
    sessionIdByExternalId.set(externalId, s.id);
    sessionNameByKey.set(externalId, sessionName);
  }
  console.log(`Sessions: ${sessionIdByExternalId.size}`);

  // 6. Students
  const studentIdByExternalId = new Map<string, string>();
  for (const row of rows) {
    const externalId = (row["user_id"] || "").trim();
    if (!externalId || studentIdByExternalId.has(externalId)) continue;
    const displayName = (row["姓名"] || "").trim();
    const schoolName = (row["school_id"] || "").trim();
    const gradeName = parseInt(row["年级"] || "", 10);
    const rawClass = (row["班级"] || "").trim();
    if (!schoolName || Number.isNaN(gradeName)) continue;
    const schoolId = schoolIdByName.get(schoolName)!;
    const gradeId = gradeIdByKey.get(`${schoolId}|${gradeName}`)!;
    const className = rawClass || DEFAULT_CLASS_FALLBACK;
    const classId = classIdByKey.get(`${gradeId}|${className}`);
    const existing = await prisma.graphNode.findFirst({
      where: { scenarioId: scenario.id, nodeType: "Student", displayName: externalId },
    });
    if (existing) {
      studentIdByExternalId.set(externalId, existing.id);
      continue;
    }
    const node = await prisma.graphNode.create({
      data: {
        nodeType: "Student",
        displayName: displayName || externalId,
        scenarioId: scenario.id,
        schoolId,
        gradeId,
        classId,
        studentProfile: {
          create: { externalUserId: displayName || null },
        },
      },
    });
    studentIdByExternalId.set(externalId, node.id);
  }
  console.log(`Students: ${studentIdByExternalId.size}`);

  // 7. Student-Knowledge relations (using cuid → existing Knowledge nodeId)
  let relCount = 0;
  let relSkippedMissingCuid = 0;
  for (const row of rows) {
    const studentExternalId = (row["user_id"] || "").trim();
    if (!studentExternalId) continue;
    const studentNodeId = studentIdByExternalId.get(studentExternalId);
    if (!studentNodeId) continue;
    const rawKg = (row["关联知识"] || "").trim();
    if (!rawKg || rawKg === "[]") continue;
    let cuids: string[];
    try {
      const parsed = JSON.parse(rawKg);
      if (!Array.isArray(parsed)) continue;
      cuids = parsed.map((x: unknown) => String(x).trim()).filter(Boolean);
    } catch {
      continue;
    }
    for (const cuid of cuids) {
      if (!cuidSet.has(cuid)) {
        relSkippedMissingCuid++;
        continue;
      }
      const knowledgeNodeId = cuid;  // cuid IS the GraphNode.id
      try {
        await prisma.studentKnowledgeRelation.create({
          data: { studentNodeId, knowledgeNodeId },
        });
        relCount++;
      } catch (e) {
        // Unique constraint violation = duplicate (skip)
        const msg = (e as Error).message;
        if (!msg.includes("Unique") && !msg.includes("P2002")) {
          console.error(`  rel error: ${msg}`);
        }
      }
    }
  }
  console.log(`Student-Knowledge relations: ${relCount} (skipped ${relSkippedMissingCuid} unmapped cuid)`);

  // 8. Interactions (LIKE, COMMENT)
  let likeCount = 0;
  let cmtCount = 0;
  let interactionErrors = 0;
  for (const row of rows) {
    const targetExternalId = (row["user_id"] || "").trim();
    if (!targetExternalId) continue;
    const targetNodeId = studentIdByExternalId.get(targetExternalId);
    if (!targetNodeId) continue;
    const schoolName = (row["school_id"] || "").trim();
    const gradeName = parseInt(row["年级"] || "", 10);
    const rawClass = (row["班级"] || "").trim();
    if (!schoolName || Number.isNaN(gradeName)) continue;
    const className = rawClass || DEFAULT_CLASS_FALLBACK;
    const sessionExternalId = `${schoolName}:${gradeName}:${className}`;
    const sessionId = sessionIdByExternalId.get(sessionExternalId);
    if (!sessionId) continue;

    // LIKE from 点赞学生ID列表
    const likersRaw = (row["点赞学生ID列表"] || "").trim();
    if (likersRaw && likersRaw !== "[]") {
      try {
        const likers = JSON.parse(likersRaw);
        if (Array.isArray(likers)) {
          for (const liker of likers) {
            const sourceExternalId = String(liker).trim();
            if (!sourceExternalId) continue;
            const sourceNodeId = studentIdByExternalId.get(sourceExternalId);
            if (!sourceNodeId) continue;
            await prisma.interaction.create({
              data: {
                interactionType: "PLATFORM",
                actionType: "LIKE",
                strength: 1,
                sessionId,
                sourceNodeId,
                targetNodeId,
              },
            });
            likeCount++;
          }
        }
      } catch {
        // ignore parse error
      }
    }

    // COMMENT from 评论内容列表
    const cmtRaw = (row["评论内容列表"] || "").trim();
    if (cmtRaw && cmtRaw !== "[]") {
      try {
        const comments = JSON.parse(cmtRaw);
        if (Array.isArray(comments)) {
          for (const c of comments) {
            const sourceExternalId = String(c.commenter_id || "").trim();
            if (!sourceExternalId) continue;
            const sourceNodeId = studentIdByExternalId.get(sourceExternalId);
            if (!sourceNodeId) continue;
            await prisma.interaction.create({
              data: {
                interactionType: "PLATFORM",
                actionType: "COMMENT",
                strength: 1,
                sessionId,
                sourceNodeId,
                targetNodeId,
              },
            });
            cmtCount++;
          }
        }
      } catch {
        // ignore
      }
    }
  }
  console.log(`Interactions: LIKE=${likeCount}, COMMENT=${cmtCount}, errors=${interactionErrors}`);

  await prisma.$disconnect();
  console.log("\n=== Done ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});