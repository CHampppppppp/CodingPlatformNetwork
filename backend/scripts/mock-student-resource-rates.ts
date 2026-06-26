/**
 * 根据学生与知识点的 STUDY 关系，mock 学生对相关资源的评分。
 *
 * 规则：
 * - 只对学生学过的知识点（StudentKnowledgeRelation）所关联的资源评分。
 * - 评分范围 1.00 - 5.00，保留两位小数。
 * - 一个学生可对多个资源评分，一个资源可被多个学生评分。
 * - 默认 dry-run，加 --execute 才写入。
 *
 * 用法：
 *   npx ts-node scripts/mock-student-resource-rates.ts [SCENARIO_CODE] [--execute] [--seed=xxx]
 *   npx ts-node scripts/mock-student-resource-rates.ts --all [--execute] [--seed=xxx]
 */

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";
import { Prisma } from "@prisma/client";

const DEFAULT_SCENARIO_CODE = "ONLINE_COURSE";
const RATE_MIN = 1;
const RATE_MAX = 5;
const TARGET_ACCEPTANCE_RATE = 0.85; // 目标资源总接受度 85%

interface ParsedArgs {
  scenarioCode: string;
  all: boolean;
  execute: boolean;
  seed?: string;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const all = args.includes("--all");
  const scenarioCode = positional[0] || DEFAULT_SCENARIO_CODE;
  const execute = args.includes("--execute");
  const seedArg = args.find((a) => a.startsWith("--seed="));
  const seed = seedArg ? seedArg.split("=")[1] : undefined;
  return { scenarioCode, all, execute, seed };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function createRandom(seed?: string): () => number {
  let state = seed ? hashString(seed) : Date.now();
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function generateRate(random: () => number): number {
  // 接受度 = (rate / RATE_MAX) * 100，目标 85% 即平均分 4.25。
  // 使用 Beta(α, 1) 分布并线性映射到 [RATE_MIN, RATE_MAX]。
  // Beta(α, 1) 期望为 α/(α+1)，令 RATE_MIN + (RATE_MAX-RATE_MIN)*α/(α+1) = TARGET_ACCEPTANCE_RATE*RATE_MAX
  const targetMean = TARGET_ACCEPTANCE_RATE * RATE_MAX;
  const alpha = (targetMean - RATE_MIN) / (RATE_MAX - targetMean);
  const betaSample = random() ** (1 / alpha);
  return round2(RATE_MIN + (RATE_MAX - RATE_MIN) * betaSample);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

async function mockRatesForScenario(
  prisma: PrismaService,
  scenarioId: string,
  scenarioLabel: string,
  execute: boolean,
  random: () => number,
) {
  console.log(`\n场景: ${scenarioLabel}`);

  // 获取该场景下所有学生-知识点关系
  // 知识点可跨场景共享，因此只按学生所在场景过滤。
  const studentKnowledgeRelations = await prisma.studentKnowledgeRelation.findMany({
    where: {
      studentNode: { scenarioId },
    },
    select: {
      studentNodeId: true,
      knowledgeNodeId: true,
    },
  });

  if (studentKnowledgeRelations.length === 0) {
    console.log("  该场景下没有学生-知识点关系，无需生成评分。");
    return { totalCount: 0, successCount: 0, duplicateCount: 0, rateSum: 0, studentCount: 0, knowledgeCount: 0, resourceCount: 0 };
  }

  // 获取这些知识点关联的资源
  const knowledgeIds = Array.from(
    new Set(studentKnowledgeRelations.map((r) => r.knowledgeNodeId)),
  );
  const resourceRelations = await prisma.resourceKnowledgeRelation.findMany({
    where: { knowledgeNodeId: { in: knowledgeIds } },
    select: { resourceId: true, knowledgeNodeId: true },
  });

  const resourcesByKnowledge = new Map<string, string[]>();
  for (const rel of resourceRelations) {
    const list = resourcesByKnowledge.get(rel.knowledgeNodeId) || [];
    list.push(rel.resourceId);
    resourcesByKnowledge.set(rel.knowledgeNodeId, list);
  }

  // 汇总每个学生对应的资源（去重）
  const resourcesByStudent = new Map<string, Set<string>>();
  for (const skr of studentKnowledgeRelations) {
    const resourceIds = resourcesByKnowledge.get(skr.knowledgeNodeId);
    if (!resourceIds || resourceIds.length === 0) continue;

    if (!resourcesByStudent.has(skr.studentNodeId)) {
      resourcesByStudent.set(skr.studentNodeId, new Set());
    }
    for (const resourceId of resourceIds) {
      resourcesByStudent.get(skr.studentNodeId)!.add(resourceId);
    }
  }

  const rateRows: Array<{ studentId: string; resourceId: string; rate: number }> = [];
  let totalCount = 0;
  let successCount = 0;
  let duplicateCount = 0;
  let rateSum = 0;

  for (const [studentNodeId, resourceIds] of resourcesByStudent) {
    for (const resourceId of resourceIds) {
      const rate = generateRate(random);
      rateSum += rate;
      totalCount += 1;

      if (execute) {
        rateRows.push({
          studentId: studentNodeId,
          resourceId,
          rate: Number(rate.toFixed(2)),
        });
      }
    }
  }

  if (execute && rateRows.length > 0) {
    const batchSize = 1000;
    for (let i = 0; i < rateRows.length; i += batchSize) {
      const batch = rateRows.slice(i, i + batchSize);
      try {
        const { count } = await prisma.studentResourceRate.createMany({
          data: batch.map((r) => ({
            studentId: r.studentId,
            resourceId: r.resourceId,
            rate: new Prisma.Decimal(r.rate),
          })),
          skipDuplicates: true,
        });
        successCount += count;
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          duplicateCount += batch.length;
        } else {
          throw error;
        }
      }
    }
  }

  const avgRate = totalCount > 0 ? round2(rateSum / totalCount) : null;
  const acceptanceRate = avgRate != null ? round2((avgRate / RATE_MAX) * 100) : null;

  console.log(`  涉及学生数: ${resourcesByStudent.size}`);
  console.log(`  涉及知识点数: ${knowledgeIds.length}`);
  console.log(`  涉及资源数: ${resourceRelations.map((r) => r.resourceId).filter((v, i, a) => a.indexOf(v) === i).length}`);
  console.log(`  预计评分记录: ${totalCount}`);
  if (avgRate != null) {
    console.log(`  预计平均评分: ${avgRate} / ${RATE_MAX}`);
    console.log(`  预计接受度: ${acceptanceRate}%`);
  }
  if (execute) {
    console.log(`  成功写入: ${successCount}`);
    if (duplicateCount > 0) console.log(`  重复跳过: ${duplicateCount}`);
  }

  return {
    totalCount,
    successCount,
    duplicateCount,
    rateSum,
    studentCount: resourcesByStudent.size,
    knowledgeCount: knowledgeIds.length,
    resourceCount: resourceRelations.map((r) => r.resourceId).filter((v, i, a) => a.indexOf(v) === i).length,
  };
}

async function main() {
  const { scenarioCode, all, execute, seed } = parseArgs();
  const random = createRandom(seed);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);

  try {
    console.log(`模式: ${execute ? "执行写入" : "演练模式（不会写入，请加 --execute 执行）"}`);
    if (seed) console.log(`随机种子: ${seed}`);

    if (all) {
      const scenarios = await prisma.learningScenario.findMany({
        orderBy: { code: "asc" },
      });
      if (scenarios.length === 0) {
        console.error("没有可用场景。");
        await app.close();
        return;
      }

      let grandTotal = 0;
      let grandSuccess = 0;
      let grandDuplicate = 0;
      let grandRateSum = 0;

      for (const scenario of scenarios) {
        const result = await mockRatesForScenario(
          prisma,
          scenario.id,
          `${scenario.nameZh} (${scenario.code})`,
          execute,
          random,
        );
        grandTotal += result.totalCount;
        grandSuccess += result.successCount;
        grandDuplicate += result.duplicateCount;
        grandRateSum += result.rateSum;
      }

      const grandAvgRate = grandTotal > 0 ? round2(grandRateSum / grandTotal) : null;
      const grandAcceptanceRate = grandAvgRate != null ? round2((grandAvgRate / RATE_MAX) * 100) : null;

      console.log(`\n全部场景汇总：`);
      console.log(`  预计评分记录总计: ${grandTotal}`);
      if (grandAvgRate != null) {
        console.log(`  预计平均评分: ${grandAvgRate} / ${RATE_MAX}`);
        console.log(`  预计接受度: ${grandAcceptanceRate}%`);
      }
      if (execute) {
        console.log(`  成功写入总计: ${grandSuccess}`);
        if (grandDuplicate > 0) console.log(`  重复跳过总计: ${grandDuplicate}`);
      } else {
        console.log(`\n这是演练模式，未写入数据库。如需执行，请加上 --execute。`);
      }
    } else {
      const scenario = await prisma.learningScenario.findFirst({
        where: { code: scenarioCode },
      });
      if (!scenario) {
        console.error(`场景 "${scenarioCode}" 不存在。`);
        await app.close();
        return;
      }

      await mockRatesForScenario(
        prisma,
        scenario.id,
        `${scenario.nameZh} (${scenario.code})`,
        execute,
        random,
      );

      if (!execute) {
        console.log(`\n这是演练模式，未写入数据库。如需执行，请加上 --execute。`);
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
