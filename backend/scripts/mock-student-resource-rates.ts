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

const DIFFICULTY_RANGES: Record<string, { minAcceptance: number; maxAcceptance: number }> = {
  LOW: { minAcceptance: 90, maxAcceptance: 100 },
  MEDIUM: { minAcceptance: 70, maxAcceptance: 90 },
  HIGH: { minAcceptance: 50, maxAcceptance: 70 },
};

const TARGET_OVERALL_ACCEPTANCE = 85;
const RATING_NOISE_STD = 0.25;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function sampleNormal(random: () => number): number {
  const u1 = random();
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

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

interface TargetAcceptance {
  LOW: number;
  MEDIUM: number;
  HIGH: number;
}

function solveTargetAcceptance(counts: Record<string, number>): TargetAcceptance {
  const total = counts.LOW + counts.MEDIUM + counts.HIGH;
  if (total === 0) {
    throw new Error("没有可用资源，无法计算目标接受度。");
  }

  const pLow = counts.LOW / total;
  const pMedium = counts.MEDIUM / total;
  const pHigh = counts.HIGH / total;

  let aLow = 95;
  let aHigh = 60;
  let aMedium = (TARGET_OVERALL_ACCEPTANCE - pLow * aLow - pHigh * aHigh) / pMedium;

  if (aMedium >= 70 && aMedium <= 90) {
    return { LOW: aLow, MEDIUM: aMedium, HIGH: aHigh };
  }

  if (aMedium > 90) {
    aLow = 90;
    aHigh = 70;
    aMedium = (TARGET_OVERALL_ACCEPTANCE - pLow * aLow - pHigh * aHigh) / pMedium;
    if (aMedium >= 70 && aMedium <= 90) {
      return { LOW: aLow, MEDIUM: aMedium, HIGH: aHigh };
    }
  }

  throw new Error(
    `无法在当前资源难度分布下达到目标接受度 ${TARGET_OVERALL_ACCEPTANCE}%。` +
    `当前分布：LOW=${counts.LOW}, MEDIUM=${counts.MEDIUM}, HIGH=${counts.HIGH}。` +
    `请调整回填规则或放宽目标均值。`,
  );
}

function generateRate(random: () => number, baseAcceptance: number): number {
  const baseRate = (baseAcceptance / 100) * RATE_MAX;
  const noise = sampleNormal(random) * RATING_NOISE_STD;
  return round2(clamp(baseRate + noise, RATE_MIN, RATE_MAX));
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
    select: {
      resourceId: true,
      knowledgeNodeId: true,
      resource: { select: { difficulty: true } },
    },
  });

  const resourcesByKnowledge = new Map<string, string[]>();
  for (const rel of resourceRelations) {
    const list = resourcesByKnowledge.get(rel.knowledgeNodeId) || [];
    list.push(rel.resourceId);
    resourcesByKnowledge.set(rel.knowledgeNodeId, list);
  }

  // 统计资源难度分布并求解各难度目标接受度
  const difficultyCounts: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  const seenResourceIds = new Set<string>();
  const resourceDifficultyById = new Map<string, string | null>();
  for (const rel of resourceRelations) {
    const difficulty = rel.resource?.difficulty?.toUpperCase() || null;
    if (!seenResourceIds.has(rel.resourceId)) {
      seenResourceIds.add(rel.resourceId);
      resourceDifficultyById.set(rel.resourceId, difficulty);
      if (difficulty && difficulty in difficultyCounts) {
        difficultyCounts[difficulty] += 1;
      }
    }
  }
  const targetAcceptance = solveTargetAcceptance(difficultyCounts);

  console.log(`  资源难度分布: LOW=${difficultyCounts.LOW}, MEDIUM=${difficultyCounts.MEDIUM}, HIGH=${difficultyCounts.HIGH}`);
  console.log(`  目标接受度: LOW=${round2(targetAcceptance.LOW)}%, MEDIUM=${round2(targetAcceptance.MEDIUM)}%, HIGH=${round2(targetAcceptance.HIGH)}%`);

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
  const difficultyRateSums: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  const difficultyRateCounts: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };

  for (const [studentNodeId, resourceIds] of resourcesByStudent) {
    for (const resourceId of resourceIds) {
      const difficulty = resourceDifficultyById.get(resourceId) || "MEDIUM";
      const baseAcceptance = targetAcceptance[difficulty] ?? targetAcceptance.MEDIUM;
      const rate = generateRate(random, baseAcceptance);
      rateSum += rate;
      totalCount += 1;

      if (difficulty in difficultyRateCounts) {
        difficultyRateSums[difficulty] += rate;
        difficultyRateCounts[difficulty] += 1;
      }

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
  for (const difficulty of ["LOW", "MEDIUM", "HIGH"] as const) {
    const count = difficultyRateCounts[difficulty];
    if (count > 0) {
      const avg = round2(difficultyRateSums[difficulty] / count);
      const acceptance = round2((avg / RATE_MAX) * 100);
      console.log(`    ${difficulty} 难度平均评分: ${avg} / ${RATE_MAX} (接受度 ${acceptance}%)`);
    }
  }
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
