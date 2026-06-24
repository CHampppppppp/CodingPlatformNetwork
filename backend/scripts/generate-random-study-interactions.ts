/**
 * 为指定场景下的每个班级随机生成学生-知识点 STUDY 交互。
 *
 * 规则：
 * - 每个班级从场景知识点中随机选 4-6 个。
 * - 约 60% 的学生会与至少一个知识点建立 STUDY 关系。
 * - 每个学生可关联 1-3 个知识点，也可没有任何关系。
 * - 每个被选中的知识点必须至少对应 1 名学生。
 *
 * 用法：
 *   npx ts-node scripts/generate-random-study-interactions.ts [SCENARIO_CODE] [--execute] [--seed=xxx]
 *
 * 默认 dry-run（只打印计划不写入），必须加 --execute 才会真正写入数据库。
 */

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";
import { Prisma } from "@prisma/client";

const DEFAULT_SCENARIO_CODE = "ONLINE_COURSE";
const KNOWLEDGE_COUNT_MIN = 4;
const KNOWLEDGE_COUNT_MAX = 6;
const STUDENT_LINK_RATE = 0.6;

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

function shuffle<T>(array: readonly T[], random: () => number): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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

    const knowledges = await prisma.graphNode.findMany({
      where: { scenarioId: scenario.id, nodeType: "Knowledge" },
      select: { id: true, displayName: true },
    });

    console.log(`场景下共有 ${knowledges.length} 个知识点。`);

    if (knowledges.length < KNOWLEDGE_COUNT_MIN) {
      console.error(
        `知识点数量不足（需要至少 ${KNOWLEDGE_COUNT_MIN} 个），无法为班级选择 ${KNOWLEDGE_COUNT_MIN}-${KNOWLEDGE_COUNT_MAX} 个知识点。`,
      );
      console.error(`请先导入更多知识点后再运行此脚本。`);
      await app.close();
      return;
    }

    const classes = await prisma.class.findMany({
      where: {
        grade: {
          school: { scenarioId: scenario.id },
        },
      },
      include: {
        grade: {
          select: {
            id: true,
            gradeName: true,
            schoolId: true,
            school: { select: { id: true, name: true } },
          },
        },
      },
    });

    console.log(`\n共 ${classes.length} 个班级。\n`);

    let totalCreatedRelations = 0;
    let totalCreatedInteractions = 0;
    let totalCoveredStudents = 0;

    for (const cls of classes) {
      const students = await prisma.graphNode.findMany({
        where: { nodeType: "Student", classId: cls.id },
        select: { id: true, displayName: true },
      });

      if (students.length === 0) {
        console.log(
          `班级 ${cls.grade.school.name} ${cls.grade.gradeName}年级${cls.className}：无学生，跳过。`,
        );
        continue;
      }

      const kCount =
        KNOWLEDGE_COUNT_MIN +
        Math.floor(random() * (KNOWLEDGE_COUNT_MAX - KNOWLEDGE_COUNT_MIN + 1));
      const selectedKnowledges = shuffle(knowledges, random).slice(0, kCount);

      const shuffledStudents = shuffle(students, random);
      const targetLinkedCount = Math.max(1, Math.round(students.length * STUDENT_LINK_RATE));
      const linkedStudents = shuffledStudents.slice(0, targetLinkedCount);

      const relations = new Map<string, Set<string>>();

      for (const student of linkedStudents) {
        const kCountForStudent = 1 + Math.floor(random() * 3);
        const studentKnowledges = shuffle(selectedKnowledges, random).slice(
          0,
          Math.min(kCountForStudent, selectedKnowledges.length),
        );
        for (const k of studentKnowledges) {
          if (!relations.has(student.id)) {
            relations.set(student.id, new Set());
          }
          relations.get(student.id)!.add(k.id);
        }
      }

      const coveredKnowledgeIds = new Set<string>();
      for (const ks of relations.values()) {
        for (const kId of ks) coveredKnowledgeIds.add(kId);
      }

      for (const k of selectedKnowledges) {
        if (!coveredKnowledgeIds.has(k.id)) {
          const student =
            linkedStudents[Math.floor(random() * linkedStudents.length)] ??
            shuffledStudents[Math.floor(random() * shuffledStudents.length)];
          if (!relations.has(student.id)) {
            relations.set(student.id, new Set());
          }
          relations.get(student.id)!.add(k.id);
        }
      }

      let sessionId: string | undefined;
      if (execute) {
        const existingSession = await prisma.interactionSession.findFirst({
          where: { scenarioId: scenario.id, classId: cls.id },
        });
        sessionId = existingSession?.id;
        if (!sessionId) {
          const newSession = await prisma.interactionSession.create({
            data: {
              scenarioId: scenario.id,
              schoolId: cls.grade.schoolId,
              gradeId: cls.grade.id,
              classId: cls.id,
              sessionName: `${cls.grade.school.name} ${cls.grade.gradeName}年级${cls.className}班 随机知识点学习`,
              occurredAt: new Date(),
            },
          });
          sessionId = newSession.id;
        }
      }

      let classRelationCount = 0;
      let classInteractionCount = 0;

      for (const [studentId, knowledgeIds] of relations) {
        for (const knowledgeId of knowledgeIds) {
          if (execute) {
            try {
              await prisma.studentKnowledgeRelation.create({
                data: { studentNodeId: studentId, knowledgeNodeId: knowledgeId },
              });
              classRelationCount += 1;
            } catch (error) {
              if (isUniqueConstraintError(error)) {
                // 已存在则跳过
              } else {
                throw error;
              }
            }

            try {
              await prisma.interaction.create({
                data: {
                  interactionType: "PLATFORM",
                  actionType: "STUDY",
                  strength: new Prisma.Decimal(1),
                  sessionId: sessionId!,
                  sourceNodeId: studentId,
                  targetNodeId: knowledgeId,
                },
              });
              classInteractionCount += 1;
            } catch (error) {
              if (isUniqueConstraintError(error)) {
                // 已存在则跳过
              } else {
                throw error;
              }
            }
          } else {
            classRelationCount += 1;
            classInteractionCount += 1;
          }
        }
      }

      totalCreatedRelations += classRelationCount;
      totalCreatedInteractions += classInteractionCount;
      totalCoveredStudents += relations.size;

      console.log(
        `班级 ${cls.grade.school.name} ${cls.grade.gradeName}年级${cls.className}：` +
          ` 学生 ${students.length} 人` +
          ` | 选中知识点 ${selectedKnowledges.length} 个` +
          ` | 覆盖学生 ${relations.size} 人 (${((relations.size / students.length) * 100).toFixed(0)}%)` +
          ` | 关系 ${classRelationCount} 条`,
      );
    }

    console.log(`\n汇总：`);
    console.log(`  覆盖学生总数: ${totalCoveredStudents}`);
    console.log(`  StudentKnowledgeRelation: ${totalCreatedRelations}`);
    console.log(`  Interaction (STUDY): ${totalCreatedInteractions}`);

    if (!execute) {
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
