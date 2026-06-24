/**
 * 从 resources_export.xlsx 导入资源数据，覆盖 resources_test 表。
 *
 * 用法：
 *   npx ts-node scripts/import-resources-from-xlsx.ts [path/to/resources_export.xlsx] [--execute]
 *
 * 默认 dry-run（只打印统计，不写入），加 --execute 才会真正执行覆盖导入。
 */

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";
import * as XLSX from "xlsx";
import * as path from "path";
import { createConnection } from "mysql2/promise";

const DEFAULT_FILE = path.resolve(process.cwd(), "../resources_export.xlsx");

const VALID_RESOURCE_TYPES = new Set([
  "VIDEO",
  "ARTICLE",
  "PRACTICE",
  "GAME",
  "DOCUMENT",
]);

const VALID_DIFFICULTIES = new Set(["LOW", "MEDIUM", "HIGH"]);

interface ParsedArgs {
  filePath: string;
  execute: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const positional = args.filter((a) => !a.startsWith("--"));
  return {
    filePath: positional[0] || DEFAULT_FILE,
    execute,
  };
}

interface ResourceRow {
  id: string;
  title: string;
  description?: string | null;
  url?: string | null;
  resourceType: string;
  difficulty?: string | null;
}

function normalizeRow(row: Record<string, unknown>): ResourceRow | null {
  const id = String(row.id || "").trim();
  const title = String(row.title || "").trim();
  const resourceType = String(row.resourceType || "").trim().toUpperCase();
  const description = row.description
    ? String(row.description).trim() || null
    : null;
  const url = row.url ? String(row.url).trim() || null : null;
  const difficulty = row.difficulty
    ? String(row.difficulty).trim().toUpperCase()
    : null;

  if (!id || !title || !resourceType) {
    return null;
  }
  if (!VALID_RESOURCE_TYPES.has(resourceType)) {
    console.warn(`忽略无效资源类型: ${resourceType} (${title})`);
    return null;
  }

  return {
    id,
    title,
    description,
    url,
    resourceType,
    difficulty:
      difficulty && VALID_DIFFICULTIES.has(difficulty) ? difficulty : null,
  };
}

function parseDatabaseUrl(): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
} {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const url = new URL(databaseUrl);
  return {
    host: url.hostname === "localhost" ? "127.0.0.1" : url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
  };
}

async function main() {
  const { filePath, execute } = parseArgs();

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

  const rows = rawRows
    .map(normalizeRow)
    .filter((r): r is ResourceRow => r !== null);

  console.log(`读取到 ${rows.length} 条有效资源记录`);
  console.log(`文件: ${filePath}`);
  console.log(
    `模式: ${execute ? "执行写入" : "演练模式（不会写入，请加 --execute 执行）"}\n`,
  );

  if (rows.length === 0) {
    console.error("没有可导入的资源数据");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);

  try {
    const existingCount = await prisma.resource.count();
    console.log(`当前 resources_test 表记录数: ${existingCount}`);

    if (execute) {
      const dbConfig = parseDatabaseUrl();
      const conn = await createConnection(dbConfig);
      try {
        await conn.execute("SET FOREIGN_KEY_CHECKS = 0");
        await conn.execute("TRUNCATE TABLE student_resource_rates_test");
        await conn.execute("TRUNCATE TABLE resource_knowledge_relations_test");
        await conn.execute("TRUNCATE TABLE resources_test");
        await conn.execute("SET FOREIGN_KEY_CHECKS = 1");
      } finally {
        await conn.end();
      }

      const BATCH_SIZE = 100;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        await prisma.resource.createMany({
          data: batch.map((row) => ({
            id: row.id,
            title: row.title,
            description: row.description ?? null,
            url: row.url ?? null,
            resourceType: row.resourceType,
            difficulty: row.difficulty ?? null,
            acceptanceRate: null,
          })),
          skipDuplicates: false,
        });
      }

      const newCount = await prisma.resource.count();
      console.log(`\n导入完成，当前 resources_test 表记录数: ${newCount}`);
    } else {
      console.log("\n这是演练模式，未写入数据库。如需执行，请加上 --execute。");
      console.log("前 3 条预览:");
      for (const row of rows.slice(0, 3)) {
        console.log(
          `  ${row.id} | ${row.title} | ${row.resourceType} | ${row.difficulty ?? "无难度"}`,
        );
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
