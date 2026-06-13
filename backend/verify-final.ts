import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const url = new URL(process.env.DATABASE_URL!);
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("===== 通过 Prisma client 验证 =====");
  const total = await prisma.knowledgeProfile.count();
  console.log(`profile 总数: ${total}`);

  // 按场景分组
  const byScenario = await prisma.knowledgeProfile.groupBy({
    by: ["scenarioId"],
    _count: { _all: true },
  });
  const scenarios = await prisma.learningScenario.findMany({
    select: { id: true, code: true },
  });
  const codeMap = new Map(scenarios.map((s) => [s.id, s.code]));
  console.log("\n按场景:");
  for (const row of byScenario) {
    console.log(`  ${codeMap.get(row.scenarioId)}: ${row._count._all}`);
  }

  // 验证关联查询能工作
  const profileWithScenario = await prisma.knowledgeProfile.findFirst({
    include: { scenario: true },
  });
  console.log(`\n关联查询 sample: profile[${profileWithScenario?.nodeId.slice(0, 12)}...] -> scenario.code=${profileWithScenario?.scenario.code}`);

  // 验证反向关系
  const showCaseScenario = await prisma.learningScenario.findFirst({
    where: { code: "SHOW_CASE" },
    include: { _count: { select: { profiles: true } } },
  });
  console.log(`LearningScenario.profiles 反向: SHOW_CASE 有 ${showCaseScenario?._count.profiles} 个 profile`);

  // 所有 232 个 unique knowledge 是否都有 profile
  const knowledgeAll = await prisma.graphNode.count({
    where: { nodeType: "Knowledge" },
  });
  const knowledgeWithProfile = await prisma.graphNode.count({
    where: { nodeType: "Knowledge", knowledgeProfile: { isNot: null } },
  });
  console.log(`\nKnowledge 总数: ${knowledgeAll}, 有 profile 的: ${knowledgeWithProfile}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
