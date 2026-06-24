import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";
import * as fs from "fs";
import * as path from "path";
import * as xlsx from "xlsx";

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

async function main() {
  const params = parseArgs();
  const output = params.output;

  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  try {
    const resources = await prisma.resource.findMany({
      include: {
        knowledgeRelations: {
          select: {
            knowledgeNode: {
              select: {
                displayName: true,
                knowledgeProfile: {
                  select: { difficulty: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = resources.map((resource) => {
      const relatedKnowledges = resource.knowledgeRelations
        .map((relation) => relation.knowledgeNode?.displayName)
        .filter((name): name is string => Boolean(name));

      const relatedDifficulties = resource.knowledgeRelations
        .map((relation) => relation.knowledgeNode?.knowledgeProfile?.difficulty)
        .filter((d): d is string => Boolean(d));

      return {
        id: resource.id,
        title: resource.title,
        description: resource.description,
        url: resource.url,
        resourceType: resource.resourceType,
        difficulty: resource.difficulty,
        acceptanceRate: resource.acceptanceRate?.toString() ?? null,
        relatedKnowledgeCount: resource.knowledgeRelations.length,
        relatedKnowledges: relatedKnowledges.join(", "),
        relatedDifficulties: relatedDifficulties.join(", "),
        createdAt: resource.createdAt.toISOString(),
        updatedAt: resource.updatedAt.toISOString(),
      };
    });

    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Resources");

    const defaultOutputPath = path.resolve(
      __dirname,
      "..",
      "..",
      "resources_export.xlsx",
    );
    const outputPath = output ? path.resolve(output) : defaultOutputPath;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    xlsx.writeFile(workbook, outputPath);
    console.log(`已写入: ${outputPath}，共 ${rows.length} 条资源`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
