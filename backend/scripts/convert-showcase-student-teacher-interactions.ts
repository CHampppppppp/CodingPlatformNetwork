/**
 * 将 SHOW_CASE 场景下两条学生-教师之间的 PLATFORM 交互改为 PHYSICAL。
 *
 * 用法：
 *   npx ts-node scripts/convert-showcase-student-teacher-interactions.ts [--execute]
 *
 * 默认 dry-run（只打印，不写入），加 --execute 才会真正更新数据库。
 */

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";

interface ParsedArgs {
  execute: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  return { execute: args.includes("--execute") };
}

async function main() {
  const { execute } = parseArgs();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);

  try {
    const scenario = await prisma.learningScenario.findUnique({
      where: { code: "SHOW_CASE" },
    });
    if (!scenario) {
      console.error("SHOW_CASE 场景不存在");
      await app.close();
      return;
    }
    console.log(`场景: ${scenario.nameZh} (${scenario.code})`);
    console.log(
      `模式: ${execute ? "执行写入" : "演练模式（不会写入，请加 --execute 执行）"}\n`,
    );

    const candidates = await prisma.interaction.findMany({
      where: {
        interactionType: "PLATFORM",
        session: { scenarioId: scenario.id },
        OR: [
          {
            sourceNode: { nodeType: "Student" },
            targetNode: { nodeType: "Teacher" },
          },
          {
            sourceNode: { nodeType: "Teacher" },
            targetNode: { nodeType: "Student" },
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 2,
      include: {
        sourceNode: { select: { id: true, displayName: true, nodeType: true } },
        targetNode: { select: { id: true, displayName: true, nodeType: true } },
        session: { select: { id: true, scenarioId: true } },
      },
    });

    if (candidates.length < 2) {
      console.error(
        `SHOW_CASE 下符合条件的学生-教师 PLATFORM 交互只有 ${candidates.length} 条，不足以替换 2 条。`,
      );
      await app.close();
      return;
    }

    console.log(`将替换以下 ${candidates.length} 条交互的 interactionType：`);
    for (const interaction of candidates) {
      console.log(
        `  ${interaction.id}: ${interaction.sourceNode.displayName} (${interaction.sourceNode.nodeType}) -> ${interaction.targetNode.displayName} (${interaction.targetNode.nodeType})`,
      );
    }

    if (execute) {
      const result = await prisma.interaction.updateMany({
        where: { id: { in: candidates.map((i) => i.id) } },
        data: { interactionType: "PHYSICAL" },
      });
      console.log(`\n实际更新记录数: ${result.count}`);
    } else {
      console.log("\n这是演练模式，未写入数据库。如需执行，请加上 --execute。");
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
