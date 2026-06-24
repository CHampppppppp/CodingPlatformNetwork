/**
 * 为 SHOW_CASE 场景下的所有学生认知画像，基于 16 个基础维度重新计算 10 维个人维度得分。
 *
 * 用法：
 *   npx ts-node scripts/recompute-showcase-dimensions.ts [--execute]
 *
 * 默认 dry-run（只打印对比，不写入），加 --execute 才会真正更新数据库。
 */

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";
import { Prisma } from "@prisma/client";
import {
  AGGREGATE_DIMENSION_KEYS,
  AggregateDimensionKey,
  computeAggregateDimensionScores,
  scoreLevel,
} from "../src/shared/utils/cognitive-dimensions";

interface ParsedArgs {
  execute: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  return { execute: args.includes("--execute") };
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

    const defs = await prisma.cognitiveDimensionDef.findMany();
    const defMap = new Map(defs.map((d) => [d.dimensionCode, d]));

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
      for (const score of profile.dimensionScores) {
        baseScoreMap.set(score.dimensionCode, Number(score.scoreValue));
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
      console.log(`\n更新完成:`);
      console.log(`  处理画像总数: ${updatedProfiles}`);
      console.log(`  新增维度得分: ${createdScores}`);
      console.log(`  更新维度得分: ${updatedScores}`);
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
