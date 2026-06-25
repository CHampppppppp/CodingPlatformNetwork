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
    return { totalCount: 0, successCount: 0, duplicateCount: 0, studentCount: 0, knowledgeCount: 0, resourceCount: 0 };
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

  let totalCount = 0;
  let successCount = 0;
  let duplicateCount = 0;

  for (const [studentNodeId, resourceIds] of resourcesByStudent) {
    for (const resourceId of resourceIds) {
      const rate = round2(RATE_MIN + random() * (RATE_MAX - RATE_MIN));
      totalCount += 1;

      if (execute) {
        try {
          await prisma.studentResourceRate.create({
            data: {
              studentId: studentNodeId,
              resourceId,
              rate: new Prisma.Decimal(rate.toFixed(2)),
            },
          });
          successCount += 1;
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            duplicateCount += 1;
          } else {
            throw error;
          }
        }
      }
    }
  }

  console.log(`  涉及学生数: ${resourcesByStudent.size}`);
  console.log(`  涉及知识点数: ${knowledgeIds.length}`);
  console.log(`  涉及资源数: ${resourceRelations.map((r) => r.resourceId).filter((v, i, a) => a.indexOf(v) === i).length}`);
  console.log(`  预计评分记录: ${totalCount}`);
  if (execute) {
    console.log(`  成功写入: ${successCount}`);
    if (duplicateCount > 0) console.log(`  重复跳过: ${duplicateCount}`);
  }

  return {
    totalCount,
    successCount,
    duplicateCount,
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
      }

      console.log(`\n全部场景汇总：`);
      console.log(`  预计评分记录总计: ${grandTotal}`);
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
