import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);

  try {
    const totalRates = await prisma.studentResourceRate.count();
    const invalidRatesResult = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM student_resource_rates_test srr
      LEFT JOIN resources_test r ON srr.resourceId = r.id
      WHERE r.id IS NULL
    `;
    const invalidRates = Number(invalidRatesResult[0].count);

    const scenarios = await prisma.learningScenario.findMany({
      select: { code: true, nameZh: true },
    });

    console.log(`student_resource_rates 总记录数: ${totalRates}`);
    console.log(`指向不存在资源的无效评分记录数: ${invalidRates}`);
    console.log("\n场景列表:");
    for (const s of scenarios) {
      console.log(`  - ${s.code} (${s.nameZh})`);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
