#!/usr/bin/env ts-node
import * as fs from "fs";
import * as path from "path";
import { parse as csvParse } from "csv-parse/sync";

const DATAS_DIR = path.resolve(__dirname, "../datas");
const LONG_FORMAT_FILENAME = process.env.LONG_FORMAT_CSV ?? "ONLINE_COURSE_long_format_v2.csv";
const PENDING_FILENAME = process.env.PENDING_CSV ?? "long_format_pending_v2.csv";
const OUTPUT_REPORT = path.join(DATAS_DIR, "ONLINE_COURSE", "distribution_report.txt");

type CsvRow = Record<string, string>;

interface Distribution {
  totalRows: number;
  uniqueSchools: number;
  uniqueCombos: number;
  uniqueGrades: number;
  schoolsByCount: Map<string, number>;
  combosByCount: Map<string, number>;
  gradesByCount: Map<string, number>;
  relationStats: {
    kgFilled: number;
    likesFilled: number;
    likesDistribution: Map<number, number>;
    commentsFilled: number;
    workFilled: number;
  };
}

function readCsv(filename: string): CsvRow[] {
  const filepath = path.join(DATAS_DIR, "ONLINE_COURSE", filename);
  if (!fs.existsSync(filepath)) {
    console.warn(`File not found: ${filepath}`);
    return [];
  }
  const content = fs.readFileSync(filepath, "utf-8");
  return csvParse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });
}

function analyze(rows: CsvRow[]): Distribution {
  const schoolsByCount = new Map<string, number>();
  const combosByCount = new Map<string, number>();
  const gradesByCount = new Map<string, number>();
  let kgFilled = 0;
  let likesFilled = 0;
  const likesDistribution = new Map<number, number>();
  let commentsFilled = 0;
  let workFilled = 0;

  for (const row of rows) {
    const school = (row["school_id"] || "").trim() || "(空)";
    const grade = (row["年级"] || "").trim() || "(空)";
    const cls = (row["班级"] || "").trim() || "(空)";

    schoolsByCount.set(school, (schoolsByCount.get(school) ?? 0) + 1);
    const comboKey = `${school}|${grade}|${cls}`;
    combosByCount.set(comboKey, (combosByCount.get(comboKey) ?? 0) + 1);
    gradesByCount.set(grade, (gradesByCount.get(grade) ?? 0) + 1);

    const kgRaw = (row["关联知识"] || "").trim();
    if (kgRaw && kgRaw !== "[]") kgFilled += 1;

    const likesRaw = (row["点赞学生ID列表"] || "").trim();
    if (likesRaw && likesRaw !== "[]") {
      likesFilled += 1;
      try {
        const arr = JSON.parse(likesRaw);
        if (Array.isArray(arr)) {
          likesDistribution.set(arr.length, (likesDistribution.get(arr.length) ?? 0) + 1);
        }
      } catch {
        // ignore
      }
    }

    const cmtRaw = (row["评论内容列表"] || "").trim();
    if (cmtRaw && cmtRaw !== "[]") commentsFilled += 1;

    if ((row["作品_作品ID"] || "").trim()) workFilled += 1;
  }

  return {
    totalRows: rows.length,
    uniqueSchools: schoolsByCount.size,
    uniqueCombos: combosByCount.size,
    uniqueGrades: gradesByCount.size,
    schoolsByCount,
    combosByCount,
    gradesByCount,
    relationStats: {
      kgFilled,
      likesFilled,
      likesDistribution,
      commentsFilled,
      workFilled,
    },
  };
}

function analyzePending(rows: CsvRow[]): Record<string, unknown> {
  if (rows.length === 0) return { count: 0 };
  const reasonCounts = new Map<string, number>();
  for (const row of rows) {
    const reason = (row["_drop_reason"] || "").trim() || "(无)";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  return {
    count: rows.length,
    byReason: Object.fromEntries(reasonCounts),
    sampleFields: Object.keys(rows[0]),
  };
}

function buildReport(dist: Distribution, pending: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push("ONLINE_COURSE Long-Format 分布报告");
  lines.push("=".repeat(50));
  lines.push("");

  // Overview
  lines.push("=== 总览 ===");
  lines.push(`  总行数: ${dist.totalRows}`);
  lines.push(`  唯一学校数: ${dist.uniqueSchools}`);
  lines.push(`  唯一 (school, grade, class) 组合: ${dist.uniqueCombos}`);
  lines.push(`  唯一年级数: ${dist.uniqueGrades}`);
  lines.push("");

  // Top 20 schools
  lines.push("=== 学校 Top 20（按学生数） ===");
  const sortedSchools = [...dist.schoolsByCount.entries()].sort(
    (a, b) => b[1] - a[1],
  );
  for (const [s, c] of sortedSchools.slice(0, 20)) {
    lines.push(`  ${String(c).padStart(5)}  ${s}`);
  }
  lines.push("");

  // Bottom 20 schools
  lines.push("=== 学校 Bottom 20（按学生数） ===");
  for (const [s, c] of sortedSchools.slice(-20)) {
    lines.push(`  ${String(c).padStart(5)}  ${s}`);
  }
  lines.push("");

  // Class histogram
  lines.push("=== 班级大小直方图（按 (school, grade, class) 组合） ===");
  let g10 = 0, g5to9 = 0, g1to4 = 0;
  for (const c of dist.combosByCount.values()) {
    if (c >= 10) g10++;
    else if (c >= 5) g5to9++;
    else g1to4++;
  }
  lines.push(`  ≥10 学生: ${g10} 组合`);
  lines.push(`  5-9 学生: ${g5to9} 组合`);
  lines.push(`  1-4 学生: ${g1to4} 组合`);
  lines.push("");

  // Top 15 (school, grade, class)
  lines.push("=== (学校, 年级, 班级) Top 15 ===");
  const sortedCombos = [...dist.combosByCount.entries()].sort(
    (a, b) => b[1] - a[1],
  );
  for (const [k, c] of sortedCombos.slice(0, 15)) {
    lines.push(`  ${String(c).padStart(5)}  ${k}`);
  }
  lines.push("");

  // Grade distribution
  lines.push("=== 年级分布 ===");
  const sortedGrades = [...dist.gradesByCount.entries()].sort((a, b) => {
    const na = parseInt(a[0], 10);
    const nb = parseInt(b[0], 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a[0].localeCompare(b[0]);
  });
  for (const [g, c] of sortedGrades) {
    lines.push(`  ${String(c).padStart(5)}  ${g}`);
  }
  lines.push("");

  // Relation field coverage
  const rs = dist.relationStats;
  lines.push("=== 关系字段覆盖率 ===");
  lines.push(`  关联知识 非空: ${rs.kgFilled}/${dist.totalRows} (${((rs.kgFilled / dist.totalRows) * 100).toFixed(1)}%)`);
  lines.push(`  点赞学生ID列表 非空: ${rs.likesFilled}/${dist.totalRows}`);
  lines.push(`  评论内容列表 非空: ${rs.commentsFilled}/${dist.totalRows}`);
  lines.push(`  作品_作品ID 非空: ${rs.workFilled}/${dist.totalRows} (${((rs.workFilled / dist.totalRows) * 100).toFixed(1)}%)`);
  lines.push("");
  lines.push("=== 点赞数分布 ===");
  const sortedLikes = [...rs.likesDistribution.entries()].sort(
    (a, b) => a[0] - b[0],
  );
  for (const [count, freq] of sortedLikes) {
    lines.push(`  ${count} 个点赞者: ${freq} 个学生`);
  }
  lines.push("");

  // Pending queue
  lines.push("=== 待处理队列 ===");
  lines.push(`  总数: ${pending.count ?? 0} 行`);
  if (pending.byReason) {
    lines.push("  按原因:");
    for (const [reason, count] of Object.entries(pending.byReason)) {
      lines.push(`    ${reason}: ${count}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const longFormatRows = readCsv(LONG_FORMAT_FILENAME);
  const pendingRows = readCsv(PENDING_FILENAME);

  if (longFormatRows.length === 0) {
    console.error(`ERROR: ${LONG_FORMAT_FILENAME} is empty or missing`);
    process.exit(1);
  }

  console.log(`Read ${longFormatRows.length} rows from ${LONG_FORMAT_FILENAME}`);
  console.log(`Read ${pendingRows.length} rows from ${PENDING_FILENAME}`);

  const dist = analyze(longFormatRows);
  const pending = analyzePending(pendingRows);
  const report = buildReport(dist, pending);

  fs.writeFileSync(OUTPUT_REPORT, report, "utf-8");
  console.log(`Report written to ${OUTPUT_REPORT}`);
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});