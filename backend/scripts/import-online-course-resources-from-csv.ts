/**
 * 从 ONLINE_COURSE_resources.csv 导入资源及其关联知识点。
 *
 * 用法（默认 dry-run）：
 *   npx ts-node scripts/import-online-course-resources-from-csv.ts
 *
 * 真正写入数据库：
 *   npx ts-node scripts/import-online-course-resources-from-csv.ts --execute
 */

import * as fs from "fs";
import * as path from "path";
import { parse as csvParse } from "csv-parse/sync";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";

const DEFAULT_CSV_PATH = path.resolve(
  __dirname,
  "..",
  "datas",
  "ONLINE_COURSE_resources.csv",
);
const SCENARIO_CODE = "ONLINE_COURSE";

interface CsvRow {
  id?: string;
  title?: string;
  description?: string;
  url?: string;
  knowledgeNames?: string[];
}

function parseArgs(): { execute: boolean; csvPath: string } {
  const args = process.argv.slice(2);
  const params: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--") && i + 1 < args.length) {
      params[arg.slice(2)] = args[i + 1];
      i++;
    } else if (arg === "--execute") {
      params.execute = "true";
    }
  }

  return {
    execute: params.execute === "true",
    csvPath: params.csv ?? DEFAULT_CSV_PATH,
  };
}

function normalizeRow(raw: Record<string, string>): CsvRow | null {
  const title = (raw["主要的知识点"] || "").trim();
  const url = (raw["视频链接"] || "").trim();
  const description = (raw["知识点"] || "").trim();

  if (!title || !url) {
    return null;
  }

  const knowledgeNames = [
    raw["试题-知识点1"],
    raw["试题-知识点2"],
    raw["试题-知识点3"],
  ]
    .map((v) => (v || "").trim())
    .filter((v) => v.length > 0);

  return {
    id: (raw.id || "").trim() || undefined,
    title,
    description: description || undefined,
    url,
    knowledgeNames,
  };
}

async function main() {
  const { execute, csvPath } = parseArgs();

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const rawRows = csvParse(csvContent, { columns: true, bom: true }) as Record<
    string,
    string
  >[];
  const rows = rawRows.map(normalizeRow).filter((r): r is CsvRow => r !== null);

  console.log(`读取 CSV: ${csvPath}`);
  console.log(`有效资源行数: ${rows.length}`);
  console.log(`模式: ${execute ? "执行写入" : "演练模式（不写入数据库）"}\n`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);

  try {
    const scenario = await prisma.learningScenario.findFirst({
      where: { code: SCENARIO_CODE },
    });
    if (!scenario) {
      console.error(`场景 ${SCENARIO_CODE} 不存在`);
      process.exit(1);
    }

    const resourcesToUpsert: CsvRow[] = [];
    const knowledgeDisplayNames = new Set<string>();

    for (const row of rows) {
      resourcesToUpsert.push(row);
      for (const name of row.knowledgeNames ?? []) {
        knowledgeDisplayNames.add(name);
      }
    }

    console.log(`待导入资源数: ${resourcesToUpsert.length}`);
    console.log(`待导入知识点数: ${knowledgeDisplayNames.size}`);

    const knowledgeIdByName = new Map<string, string>();

    if (execute) {
      for (const displayName of knowledgeDisplayNames) {
        const existing = await prisma.graphNode.findFirst({
          where: {
            nodeType: "Knowledge",
            displayName,
            scenarioId: scenario.id,
          },
          select: { id: true },
        });

        if (existing) {
          knowledgeIdByName.set(displayName, existing.id);
        } else {
          const node = await prisma.graphNode.create({
            data: {
              nodeType: "Knowledge",
              displayName,
              scenarioId: scenario.id,
              knowledgeProfile: {
                create: {
                  content: null,
                  scenario: { connect: { id: scenario.id } },
                },
              },
            },
          });
          knowledgeIdByName.set(displayName, node.id);
        }
      }

      let resourceCount = 0;
      let relationCount = 0;

      for (const row of resourcesToUpsert) {
        let resource = await prisma.resource.findFirst({
          where: { url: row.url },
        });

        if (resource) {
          resource = await prisma.resource.update({
            where: { id: resource.id },
            data: {
              title: row.title,
              description: row.description ?? null,
              resourceType: "VIDEO",
            },
          });
        } else {
          resource = await prisma.resource.create({
            data: {
              title: row.title,
              description: row.description ?? null,
              url: row.url,
              resourceType: "VIDEO",
              acceptanceRate: null,
            },
          });
        }
        resourceCount += 1;

        for (const knowledgeName of row.knowledgeNames ?? []) {
          const knowledgeNodeId = knowledgeIdByName.get(knowledgeName);
          if (!knowledgeNodeId) continue;

          await prisma.resourceKnowledgeRelation.upsert({
            where: {
              resourceId_knowledgeNodeId: {
                resourceId: resource.id,
                knowledgeNodeId,
              },
            },
            update: {},
            create: {
              resourceId: resource.id,
              knowledgeNodeId,
            },
          });
          relationCount += 1;
        }
      }

      console.log(`\n已导入/更新 ${resourceCount} 个资源`);
      console.log(`已建立 ${relationCount} 条资源-知识点关系`);
      console.log(`已导入/复用 ${knowledgeIdByName.size} 个知识点`);
    } else {
      console.log("\n演练模式，未写入数据库。预览如下：");
      console.log("\n前 5 个资源及其关联知识点:");
      for (const row of resourcesToUpsert.slice(0, 5)) {
        console.log(`  ${row.title}`);
        console.log(`    URL: ${row.url}`);
        console.log(`    知识点: ${row.knowledgeNames?.join(", ") || "无"}`);
      }
      console.log("\n如需写入，请加 --execute。");
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
