#!/usr/bin/env ts-node
import * as fs from "fs";
import * as path from "path";
import { parse as csvParse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DATAS_DIR = path.resolve(__dirname, "../datas");
const ONLINE_COURSE_DIR = path.join(DATAS_DIR, "ONLINE_COURSE");
const KNOWLEDGES_CSV = "ONLINE_COURSE_knowledges.csv";
const MAP_OUTPUT = path.join(ONLINE_COURSE_DIR, "knowledges_id_map.json");

const SCENARIO_CODE = "ONLINE_COURSE";
const SCENARIO_NAME = "学科课程在线学习";

interface KnowledgeRow {
  id: string;
  内容: string;
  知识点: string;
  grade: string;
  main: string;
  courses_id?: string;
}

function deriveDisplayName(row: KnowledgeRow): string | null {
  const main = (row.main || "").trim();
  if (main) return main;
  // Fallback: first tag in 知识点 field
  const tags = (row.知识点 || "")
    .split(/[、,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (tags.length > 0 && tags[0] !== "暂无") return tags[0];
  if (tags.length > 0) {
    // "暂无" as fallback: use id-based name
    return `知识点#${row.id}`;
  }
  return null;
}

async function main() {
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });

  console.log("=== ONLINE_COURSE Knowledge 入库 ===\n");

  // 1. Ensure scenario exists
  const scenario = await prisma.learningScenario.upsert({
    where: { code: SCENARIO_CODE },
    update: {},
    create: {
      code: SCENARIO_CODE,
      nameZh: SCENARIO_NAME,
      sortOrder: 1,
      isActive: true,
    },
  });
  console.log(`Scenario: ${scenario.code} (${scenario.id})`);

  // 2. Read knowledges.csv
  const filepath = path.join(ONLINE_COURSE_DIR, KNOWLEDGES_CSV);
  if (!fs.existsSync(filepath)) {
    console.error(`Not found: ${filepath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(filepath, "utf-8");
  const rows = csvParse<KnowledgeRow>(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });
  console.log(`Read ${rows.length} knowledges from CSV`);

  // 3. Load existing Knowledge nodes for this scenario (for dedup)
  const existing = await prisma.graphNode.findMany({
    where: { scenarioId: scenario.id, nodeType: "Knowledge" },
    select: { id: true, displayName: true },
  });
  const existingByName = new Map<string, string>(
    existing.map((n) => [n.displayName, n.id]),
  );
  console.log(`Existing Knowledge nodes in DB: ${existing.length}`);

  // 4. For each row: dedupe by displayName, then upsert
  const idMap: Record<string, string> = {};
  let created = 0;
  let reused = 0;
  let failed = 0;

  for (const row of rows) {
    const kid = (row.id || "").trim();
    if (!kid) {
      failed++;
      continue;
    }
    const displayName = deriveDisplayName(row);
    if (!displayName) {
      console.warn(`  Skip id=${kid}: cannot derive displayName`);
      failed++;
      continue;
    }

    let nodeId = existingByName.get(displayName);
    if (nodeId) {
      reused++;
      console.log(`  Reused: id=${kid} "${displayName}" → ${nodeId}`);
    } else {
      try {
        const node = await prisma.graphNode.create({
          data: {
            nodeType: "Knowledge",
            displayName,
            scenarioId: scenario.id,
            knowledgeProfile: {
              create: {
                content: row.内容 || null,
                category: row.知识点 || null,
                scenarioId: scenario.id,
              },
            },
          },
        });
        nodeId = node.id;
        existingByName.set(displayName, nodeId);
        created++;
        console.log(`  Created: id=${kid} "${displayName}" → ${nodeId}`);
      } catch (e) {
        console.error(`  Failed: id=${kid} "${displayName}":`, e);
        failed++;
        continue;
      }
    }

    idMap[kid] = nodeId;
  }

  // 5. Write map (cuid → displayName for downstream consumers)
  const displayNameByCuid: Record<string, string> = {};
  for (const [kid, cuid] of Object.entries(idMap)) {
    const row = rows.find((r) => r.id === kid);
    if (row) {
      const name = deriveDisplayName(row);
      if (name) displayNameByCuid[cuid] = name;
    }
  }
  const mapWithNames = {
    kidToCuid: idMap,
    cuidToName: displayNameByCuid,
  };
  fs.writeFileSync(MAP_OUTPUT, JSON.stringify(mapWithNames, null, 2), "utf-8");

  console.log("\n=== Summary ===");
  console.log(`  Total in CSV: ${rows.length}`);
  console.log(`  Created: ${created}`);
  console.log(`  Reused: ${reused}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Map: ${MAP_OUTPUT} (${Object.keys(idMap).length} kid→cuid, ${Object.keys(displayNameByCuid).length} cuid→name)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});