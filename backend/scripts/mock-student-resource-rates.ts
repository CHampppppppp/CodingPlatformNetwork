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
  execute: boolean;
  seed?: string;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const scenarioCode = positional[0] || DEFAULT_SCENARIO_CODE;
  const execute = args.includes("--execute");
  const seedArg = args.find((a) => a.startsWith("--seed="));
  const seed = seedArg ? seedArg.split("=")[1] : undefined;
  return { scenarioCode, execute, seed };
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

async function main() {
  const { scenarioCode, execute, seed } = parseArgs();
  const random = createRandom(seed);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);

  try {
    const scenario = await prisma.learningScenario.findFirst({
      where: { code: scenarioCode },
    });
    if (!scenario) {
      console.error(`场景 "${scenarioCode}" 不存在。`);
      await app.close();
      return;
    }

    console.log(`场景: ${scenario.nameZh} (${scenario.code})`);
    console.log(`模式: ${execute ? "执行写入" : "演练模式（不会写入，请加 --execute 执行）"}`);
    if (seed) console.log(`随机种子: ${seed}`);

    // 获取该场景下所有学生-知识点关系
    const studentKnowledgeRelations = await prisma.studentKnowledgeRelation.findMany({
      where: {
        studentNode: { scenarioId: scenario.id },
        knowledgeNode: { scenarioId: scenario.id },
      },
      select: {
        studentNodeId: true,
        knowledgeNodeId: true,
      },
    });

    if (studentKnowledgeRelations.length === 0) {
      console.log("该场景下没有学生-知识点关系，无需生成评分。");
      await app.close();
      return;
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

    console.log(`\n汇总：`);
    console.log(`  涉及学生数: ${resourcesByStudent.size}`);
    console.log(`  涉及知识点数: ${knowledgeIds.length}`);
    console.log(`  涉及资源数: ${resourceRelations.map((r) => r.resourceId).filter((v, i, a) => a.indexOf(v) === i).length}`);
    console.log(`  预计评分记录: ${totalCount}`);
    if (execute) {
      console.log(`  成功写入: ${successCount}`);
      if (duplicateCount > 0) console.log(`  重复跳过: ${duplicateCount}`);
    } else {
      console.log(`\n这是演练模式，未写入数据库。如需执行，请加上 --execute。`);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
