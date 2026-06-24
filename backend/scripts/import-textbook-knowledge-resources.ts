/**
 * 从 textbook_knowledge_resources.csv 导入知识点及其关联资源到 SHOW_CASE 场景。
 *
 * 用法（默认 dry-run）：
 *   npx ts-node scripts/import-textbook-knowledge-resources.ts
 *
 * 真正写入数据库：
 *   npx ts-node scripts/import-textbook-knowledge-resources.ts --execute
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
  "textbook_knowledge_resources.csv",
);
const SCENARIO_CODE = "SHOW_CASE";

interface CsvRow {
  category: string;
  knowledge: string;
  url: string;
  page: string;
  content: string;
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
  const category = (raw.category || "").trim();
  const knowledge = (raw.knowledge || "").trim();
  const url = (raw.url || "").trim();
  const page = (raw.page || "").trim();
  const content = (raw.content || "").trim();

  if (!knowledge) {
    return null;
  }

  return { category, knowledge, url, page, content };
}

async function main() {
  const { execute, csvPath } = parseArgs();

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const rawRows = csvParse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as Record<string, string>[];
  const rows = rawRows.map(normalizeRow).filter((r): r is CsvRow => r !== null);

  console.log(`读取 CSV: ${csvPath}`);
  console.log(`有效知识点行数: ${rows.length}`);
  console.log(`模式: ${execute ? "执行写入" : "演练模式（不写入数据库）"}\n`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);

  try {
    const scenario = await prisma.learningScenario.findUnique({
      where: { code: SCENARIO_CODE },
    });
    if (!scenario) {
      console.error(`场景 ${SCENARIO_CODE} 不存在`);
      process.exit(1);
    }

    // 统计
    const resourcesToUpsert = rows.filter((r) => r.url);
    const uniqueUrls = new Set(resourcesToUpsert.map((r) => r.url));

    console.log(`待导入/复用知识点数: ${rows.length}`);
    console.log(`待建立资源-知识点关系数: ${resourcesToUpsert.length}`);
    console.log(`不同 URL 资源数: ${uniqueUrls.size}\n`);

    if (!execute) {
      console.log("演练模式，未写入数据库。前 5 条预览：");
      for (const row of rows.slice(0, 5)) {
        console.log(`  [${row.category}] ${row.knowledge}`);
        console.log(`    URL: ${row.url || "无"}`);
        console.log(`    页码: ${row.page || "无"}`);
      }
      console.log("\n如需写入，请加 --execute。");
      return;
    }

    let knowledgeCreated = 0;
    let knowledgeReused = 0;
    let resourceCreated = 0;
    let resourceReused = 0;
    let relationCreated = 0;

    const knowledgeIdByName = new Map<string, string>();
    const resourceIdByUrl = new Map<string, string>();

    for (const row of rows) {
      const existingKnowledge = await prisma.graphNode.findFirst({
        where: {
          nodeType: "Knowledge",
          displayName: row.knowledge,
          scenarioId: scenario.id,
        },
        select: { id: true },
      });

      let knowledgeNodeId: string;
      if (existingKnowledge) {
        knowledgeNodeId = existingKnowledge.id;
        knowledgeReused += 1;

        // 如果已有知识点没有 profile 或内容为空，尝试补充 category/content
        const existingProfile = await prisma.knowledgeProfile.findUnique({
          where: { nodeId: knowledgeNodeId },
        });
        if (
          existingProfile &&
          (!existingProfile.category || !existingProfile.content) &&
          (row.category || row.content || row.page)
        ) {
          await prisma.knowledgeProfile.update({
            where: { nodeId: knowledgeNodeId },
            data: {
              category: existingProfile.category || row.category || null,
              content:
                existingProfile.content ||
                [row.content, row.page].filter(Boolean).join("\n") ||
                null,
            },
          });
        }
      } else {
        const content = [row.content, row.page].filter(Boolean).join("\n");
        const node = await prisma.graphNode.create({
          data: {
            nodeType: "Knowledge",
            displayName: row.knowledge,
            scenarioId: scenario.id,
            knowledgeProfile: {
              create: {
                content: content || null,
                category: row.category || null,
                scenario: { connect: { id: scenario.id } },
              },
            },
          },
        });
        knowledgeNodeId = node.id;
        knowledgeCreated += 1;
      }
      knowledgeIdByName.set(row.knowledge, knowledgeNodeId);

      if (!row.url) continue;

      let resourceId = resourceIdByUrl.get(row.url);
      if (!resourceId) {
        const existingResource = await prisma.resource.findFirst({
          where: { url: row.url },
          select: { id: true },
        });

        if (existingResource) {
          resourceId = existingResource.id;
          resourceReused += 1;
        } else {
          const created = await prisma.resource.create({
            data: {
              title: row.knowledge,
              description: row.category || null,
              url: row.url,
              resourceType: "VIDEO",
              acceptanceRate: null,
            },
          });
          resourceId = created.id;
          resourceCreated += 1;
        }
        resourceIdByUrl.set(row.url, resourceId);
      } else {
        resourceReused += 1;
      }

      await prisma.resourceKnowledgeRelation.upsert({
        where: {
          resourceId_knowledgeNodeId: {
            resourceId,
            knowledgeNodeId,
          },
        },
        update: {},
        create: {
          resourceId,
          knowledgeNodeId,
        },
      });
      relationCreated += 1;
    }

    console.log("\n导入完成：");
    console.log(`  新建知识点: ${knowledgeCreated}`);
    console.log(`  复用知识点: ${knowledgeReused}`);
    console.log(`  新建资源: ${resourceCreated}`);
    console.log(`  复用资源: ${resourceReused}`);
    console.log(`  建立/复用关系: ${relationCreated}`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
