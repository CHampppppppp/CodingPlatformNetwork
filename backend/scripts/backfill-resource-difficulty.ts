import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";

type Difficulty = "LOW" | "MEDIUM" | "HIGH";

const LOW_KEYWORDS = /入门|基础|简单|初识|导读/;
const HIGH_KEYWORDS = /进阶|提高|挑战|困难|深入|高级/;

function inferDifficulty(title: string, resourceType: string): Difficulty {
  if (LOW_KEYWORDS.test(title)) return "LOW";
  if (HIGH_KEYWORDS.test(title)) return "HIGH";

  switch (resourceType) {
    case "VIDEO":
    case "ARTICLE":
      return "LOW";
    case "PRACTICE":
      return "MEDIUM";
    case "GAME":
      return "HIGH";
    default:
      return "MEDIUM";
  }
}

async function main() {
  const execute = process.argv.includes("--execute");

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);

  try {
    const resources = await prisma.resource.findMany({
      where: { difficulty: null },
      select: { id: true, title: true, resourceType: true },
    });

    console.log(`待回填资源数: ${resources.length}`);

    const updates = resources.map((r) => ({
      id: r.id,
      difficulty: inferDifficulty(r.title, r.resourceType),
    }));

    const stats = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    for (const u of updates) {
      stats[u.difficulty]++;
    }

    console.log("预计分布:", stats);

    if (execute) {
      let count = 0;
      for (const u of updates) {
        await prisma.resource.update({
          where: { id: u.id },
          data: { difficulty: u.difficulty },
        });
        count++;
      }
      console.log(`已更新: ${count}`);
    } else {
      console.log("这是演练模式，未写入。加 --execute 执行。");
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
