import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";
import * as fs from "fs";
import * as path from "path";

function parseArgs() {
  const args = process.argv.slice(2);
  const params: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--") && i + 1 < args.length) {
      params[arg.slice(2)] = args[i + 1];
      i++;
    }
  }
  return params;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const value = row[h];
          if (value == null) return "";
          const text = String(value);
          if (text.includes(",") || text.includes('"') || text.includes("\n")) {
            return `"${text.replace(/"/g, '""')}"`;
          }
          return text;
        })
        .join(","),
    ),
  ];
  return lines.join("\n");
}

async function main() {
  const params = parseArgs();
  const scenarioCode = params.scenarioCode;
  const output = params.output;

  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  try {
    const where: any = { nodeType: "Knowledge" };
    if (scenarioCode) {
      const scenario = await prisma.learningScenario.findUnique({
        where: { code: scenarioCode },
        select: { id: true },
      });
      if (!scenario) {
        console.error(`场景不存在: ${scenarioCode}`);
        process.exit(1);
      }
      where.scenarioId = scenario.id;
    }

    const knowledgeNodes = await prisma.graphNode.findMany({
      where,
      include: {
        knowledgeProfile: true,
        scenario: { select: { code: true, nameZh: true } },
      },
      orderBy: { displayName: "asc" },
    });

    const rows = knowledgeNodes.map((node) => ({
      nodeId: node.id,
      name: node.displayName,
      scenarioCode: node.scenario?.code ?? null,
      scenarioNameZh: node.scenario?.nameZh ?? null,
      content: node.knowledgeProfile?.content?.replace(/\r?\n/g, " ") ?? null,
      knowledgeType: node.knowledgeProfile?.knowledgeType ?? null,
      category: node.knowledgeProfile?.category ?? null,
      difficulty: node.knowledgeProfile?.difficulty ?? null,
    }));

    const defaultOutputPath = path.resolve(
      __dirname,
      "..",
      "..",
      "knowledges.csv",
    );
    const outputPath = output ? path.resolve(output) : defaultOutputPath;
    const outputContent = toCsv(rows);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, outputContent, "utf-8");
    console.log(`已写入: ${outputPath}`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
