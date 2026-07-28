/**
 * 为指定场景（或全部场景）下的学生认知画像，基于 16 个基础维度计算 10 维聚合维度得分，
 * 并持久化写入 student_cognitive_dimension_scores 表。
 *
 * 用法：
 *   npx ts-node scripts/recompute-aggregate-dimensions.ts [--execute] [--scenario=CODE]
 *
 * --scenario=CODE  只处理指定场景（如 --scenario=ONLINE_COURSE），默认处理所有场景
 * --execute         执行写入，不加则为 dry-run
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";
import { Prisma } from "@prisma/client";
import {
  AGGREGATE_DIMENSION_KEYS,
  AggregateDimensionKey,
  BASE_DIMENSION_CODES,
  computeAggregateDimensionScores,
  scoreLevel,
} from "../src/shared/utils/cognitive-dimensions";

interface ParsedArgs {
  execute: boolean;
  scenarioCode: string | null;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const scenarioCode =
    args
      .find((a) => a.startsWith("--scenario="))
      ?.split("=")[1]
      ?.trim() ?? null;
  return { execute: args.includes("--execute"), scenarioCode };
}

function formatScore(value: number): string {
  return value.toFixed(2);
}

const CONCURRENCY = 8;

async function parallelLimit<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  limit: number,
): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      await fn(items[currentIndex], currentIndex);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
}

async function main() {
  const { execute, scenarioCode } = parseArgs();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);

  try {
    const scenarios = scenarioCode
      ? [
          await prisma.learningScenario.findUnique({
            where: { code: scenarioCode },
          }),
        ].filter(Boolean)
      : await prisma.learningScenario.findMany();

    if (scenarios.length === 0) {
      console.error(
        scenarioCode
          ? `场景 ${scenarioCode} 不存在`
          : "数据库中没有场景",
      );
      await app.close();
      return;
    }

    const mode = execute ? "执行写入" : "演练模式（不会写入）";
    console.log(`模式: ${mode}， 场景数: ${scenarios.length}\n`);

    const defs = await prisma.cognitiveDimensionDef.findMany();
    const defMap = new Map(defs.map((d) => [d.dimensionCode, d]));

    let totalUpdatedProfiles = 0;
    let totalCreatedScores = 0;
    let totalUpdatedScores = 0;

    for (const scenario of scenarios) {
      console.log(`\n===== ${scenario.nameZh} (${scenario.code}) =====`);

      const students = await prisma.graphNode.findMany({
        where: { scenarioId: scenario.id, nodeType: "Student" },
        select: { id: true, displayName: true },
      });
      const studentMap = new Map(students.map((s) => [s.id, s]));

      const profiles = await prisma.studentCognitiveProfile.findMany({
      where: { studentNodeId: { in: students.map((s) => s.id) } },
      orderBy: { generatedAt: "desc" },
      include: { dimensionScores: true },
    });

    const tasks: Array<{
      profile: (typeof profiles)[number];
      studentName: string;
      computed: Record<AggregateDimensionKey, number>;
      existingCodes: Set<AggregateDimensionKey>;
      changes: string[];
      totalAggregateScore: number;
    }> = [];

    for (const profile of profiles) {
      const student = studentMap.get(profile.studentNodeId);
      if (!student) continue;

      const baseScoreMap = new Map<string, number>();
      let hasBaseDimensions = false;
      for (const score of profile.dimensionScores) {
        baseScoreMap.set(score.dimensionCode, Number(score.scoreValue));
        if ((BASE_DIMENSION_CODES as readonly string[]).includes(score.dimensionCode)) {
          hasBaseDimensions = true;
        }
      }

      if (!hasBaseDimensions) {
        console.log(
          `${student.displayName}(${profile.studentNodeId}) profile=${profile.id} SKIPPED (no base dimensions)`,
        );
        continue;
      }

      const computed = computeAggregateDimensionScores(baseScoreMap);
      const existingCodes = new Set<AggregateDimensionKey>();
      for (const score of profile.dimensionScores) {
        const code = score.dimensionCode as AggregateDimensionKey;
        if (AGGREGATE_DIMENSION_KEYS.includes(code)) {
          existingCodes.add(code);
        }
      }

      let totalAggregateScore = 0;
      const changes: string[] = [];

      for (const key of AGGREGATE_DIMENSION_KEYS) {
        const oldValue = existingCodes.has(key)
          ? Number(
              profile.dimensionScores.find((s) => s.dimensionCode === key)
                ?.scoreValue ?? 0,
            )
          : null;
        const newValue = Number(computed[key].toFixed(2));
        totalAggregateScore += newValue;

        const def = defMap.get(key);
        const level = def
          ? scoreLevel(newValue, Number(def.minScore), Number(def.maxScore))
          : "低";

        if (oldValue === null) {
          changes.push(`${key}: 新增 ${formatScore(newValue)}(${level})`);
        } else if (Math.abs(oldValue - newValue) > 0.001) {
          changes.push(
            `${key}: ${formatScore(oldValue)} → ${formatScore(newValue)}(${level})`,
          );
        } else {
          changes.push(`${key}: 保持 ${formatScore(newValue)}(${level})`);
        }

        computed[key] = newValue;
      }

      tasks.push({
        profile,
        studentName: student.displayName,
        computed,
        existingCodes,
        changes,
        totalAggregateScore,
      });
    }

      let updatedProfiles = 0;
      let createdScores = 0;
      let updatedScores = 0;

    await parallelLimit(
      tasks,
      async ({
        profile,
        studentName,
        computed,
        existingCodes,
        changes,
        totalAggregateScore,
      }) => {
        if (execute) {
          await prisma.$transaction(async (tx) => {
            for (const key of AGGREGATE_DIMENSION_KEYS) {
              const def = defMap.get(key)!;
              const newValue = computed[key];
              const level = scoreLevel(
                newValue,
                Number(def.minScore),
                Number(def.maxScore),
              );

              if (existingCodes.has(key)) {
                await tx.studentCognitiveDimensionScore.update({
                  where: {
                    profileId_dimensionCode: {
                      profileId: profile.id,
                      dimensionCode: key,
                    },
                  },
                  data: {
                    scoreValue: new Prisma.Decimal(newValue),
                    scoreLevel: level,
                  },
                });
              } else {
                await tx.studentCognitiveDimensionScore.create({
                  data: {
                    profileId: profile.id,
                    dimensionCode: key,
                    scoreValue: new Prisma.Decimal(newValue),
                    scoreLevel: level,
                  },
                });
              }
            }

            await tx.studentCognitiveProfile.update({
              where: { id: profile.id },
              data: {
                totalScore: new Prisma.Decimal(
                  Number(totalAggregateScore.toFixed(2)),
                ),
              },
            });
          });

          updatedProfiles += 1;
          for (const key of AGGREGATE_DIMENSION_KEYS) {
            if (existingCodes.has(key)) {
              updatedScores += 1;
            } else {
              createdScores += 1;
            }
          }
        }

        console.log(`${studentName}(${profile.studentNodeId}) profile=${profile.id}`);
        console.log(
          `  画像 totalScore: ${Number(profile.totalScore).toFixed(2)} → ${totalAggregateScore.toFixed(2)}`,
        );
        console.log(`  ${changes.join(" | ")}`);
      },
      CONCURRENCY,
    );

      if (execute) {
        console.log(`\n  ${scenario.nameZh} 更新完成:`);
        console.log(`    处理画像总数: ${updatedProfiles}`);
        console.log(`    新增维度得分: ${createdScores}`);
        console.log(`    更新维度得分: ${updatedScores}`);
      } else {
        console.log(`\n  ${scenario.nameZh} 演练完成。`);
      }

      totalUpdatedProfiles += updatedProfiles;
      totalCreatedScores += createdScores;
      totalUpdatedScores += updatedScores;
    }

    if (execute) {
      console.log(`\n========== 全部完成 ==========`);
      console.log(`  处理场景总数: ${scenarios.length}`);
      console.log(`  处理画像总数: ${totalUpdatedProfiles}`);
      console.log(`  新增维度得分: ${totalCreatedScores}`);
      console.log(`  更新维度得分: ${totalUpdatedScores}`);
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
