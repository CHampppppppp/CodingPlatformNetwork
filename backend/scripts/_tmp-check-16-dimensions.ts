/**
 * 只读查询：统计学生 16 维基础维度得分的覆盖情况。不修改任何数据。
 */
import "dotenv/config";
import { PrismaService } from "../src/shared/utils/prisma.service";

const BASE_16 = [
  "COG_READING",
  "COG_LANGUAGE",
  "COG_SCIENCE_KNOWLEDGE",
  "COG_SCIENCE_INQUIRY",
  "COG_COMPUTATIONAL",
  "COG_TECH_LITERACY",
  "PSY_ANXIETY",
  "PSY_DEPRESSION",
  "PSY_RESILIENCE",
  "PSY_INTEREST_STABILITY",
  "PSY_PRESSURE",
  "PSY_LIFE_SATISFACTION",
  "PRAC_INNOVATION",
  "PRAC_PROBLEM_SOLVING",
  "PRAC_PRACTICE",
  "PRAC_COLLABORATION",
];

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    // 1. 学生节点总数（按场景）
    const byScenario = await prisma.$queryRaw<
      Array<{ scenarioId: string; studentCount: bigint }>
    >`SELECT scenarioId, COUNT(*) AS studentCount FROM graph_nodes WHERE type='STUDENT' GROUP BY scenarioId`;
    const totalStudents = byScenario.reduce(
      (s, r) => s + Number(r.studentCount),
      0,
    );
    console.log("\n[1] 学生节点总数:", totalStudents, "（按场景：）");
    for (const r of byScenario) {
      console.log(`    ${r.scenarioId}: ${Number(r.studentCount)}`);
    }

    // 2. 维度定义是否存在
    const defs = await prisma.$queryRaw<
      Array<{ dimensionCode: string; dimensionNameZh: string; isActive: number }>
    >`SELECT dimensionCode, dimensionNameZh, isActive FROM cognitive_dimension_defs_test`;
    console.log("\n[2] 认知维度定义总数:", defs.length);
    const defCodes = new Set(defs.map((d) => d.dimensionCode));
    const missingDefs = BASE_16.filter((c) => !defCodes.has(c));
    console.log("    16 基础维度中缺失定义:", missingDefs.length ? missingDefs : "无");

    // 3. 有画像的学生数 / 画像总数
    const profileStat = await prisma.$queryRaw<
      Array<{ totalProfiles: bigint; distinctStudents: bigint }>
    >`SELECT COUNT(*) AS totalProfiles, COUNT(DISTINCT studentNodeId) AS distinctStudents FROM student_cognitive_profiles_test`;
    console.log("\n[3] 画像总数:", Number(profileStat[0].totalProfiles),
      " 有画像学生数:", Number(profileStat[0].distinctStudents),
      " / 学生总数:", totalStudents);

    // 4. 每个学生【最新画像】的维度得分条数分布
    // 用 ROW_NUMBER 取每个学生最新一条 profile
    const latestDims = await prisma.$queryRaw<
      Array<{ studentNodeId: string; dimCount: bigint }>
    >`SELECT studentNodeId, COUNT(s.id) AS dimCount
      FROM (
        SELECT id, studentNodeId,
               ROW_NUMBER() OVER (PARTITION BY studentNodeId ORDER BY generatedAt DESC, createdAt DESC) AS rn
        FROM student_cognitive_profiles_test
      ) p
      LEFT JOIN student_cognitive_dimension_scores_test s ON s.profileId = p.id
      WHERE p.rn = 1
      GROUP BY studentNodeId`;
    console.log("\n[4] 学生最新画像的维度得分条数分布:");
    const dist = new Map<number, number>();
    for (const r of latestDims) {
      const c = Number(r.dimCount);
      dist.set(c, (dist.get(c) ?? 0) + 1);
    }
    for (const [dimCount, cnt] of [...dist.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`    ${dimCount} 维: ${cnt} 人`);
    }
    const withAll16 = [...dist.entries()].filter(([d]) => d === 16).reduce((s, [, c]) => s + c, 0);
    console.log(`    → 最新画像恰好 16 维的学生: ${withAll16} / ${totalStudents}`);

    // 5. 每个维度有多少条得分记录（全部画像，非仅最新）
    const perDim = await prisma.$queryRaw<
      Array<{ dimensionCode: string; cnt: bigint; zeroCnt: bigint }>
    >`SELECT dimensionCode, COUNT(*) AS cnt, SUM(CASE WHEN scoreValue = 0 THEN 1 ELSE 0 END) AS zeroCnt
       FROM student_cognitive_dimension_scores_test GROUP BY dimensionCode ORDER BY dimensionCode`;
    console.log("\n[5] 每个维度得分记录数（全部画像合计）:");
    for (const r of perDim) {
      console.log(`    ${r.dimensionCode}: ${Number(r.cnt)} 条 (其中 0 分 ${Number(r.zeroCnt)} 条)`);
    }

    // 6. 最新画像里得分 > 0 的"有效"维度数（CLAUDE.md 规则：>0 才算有效）
    const latestValid = await prisma.$queryRaw<
      Array<{ studentNodeId: string; validCount: bigint }>
    >`SELECT studentNodeId, COUNT(s.id) AS validCount
      FROM (
        SELECT id, studentNodeId,
               ROW_NUMBER() OVER (PARTITION BY studentNodeId ORDER BY generatedAt DESC, createdAt DESC) AS rn
        FROM student_cognitive_profiles_test
      ) p
      JOIN student_cognitive_dimension_scores_test s ON s.profileId = p.id AND s.scoreValue > 0
      WHERE p.rn = 1
      GROUP BY studentNodeId`;
    const validDist = new Map<number, number>();
    for (const r of latestValid) {
      const c = Number(r.validCount);
      validDist.set(c, (validDist.get(c) ?? 0) + 1);
    }
    console.log("\n[6] 最新画像【有效(>0)维度数】分布:");
    for (const [dimCount, cnt] of [...validDist.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`    ${dimCount} 维有效: ${cnt} 人`);
    }
    const fullValid = [...validDist.entries()].filter(([d]) => d === 16).reduce((s, [, c]) => s + c, 0);
    console.log(`    → 最新画像 16 维全部有效(>0)的学生: ${fullValid} / ${totalStudents}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
