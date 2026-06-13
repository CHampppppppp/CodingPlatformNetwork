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
  // 1. Total knowledge rows (含重名, all rows in graph_nodes_test where nodeType='Knowledge')
  const totalRows = await prisma.graphNode.count({
    where: { nodeType: "Knowledge" },
  });

  // 2. Unique knowledge names (去重)
  const allKnowledge = await prisma.graphNode.findMany({
    where: { nodeType: "Knowledge" },
    select: { displayName: true, scenarioId: true },
  });
  const uniqueNamesSet = new Set(allKnowledge.map((k) => k.displayName));
  const uniqueNames = uniqueNamesSet.size;

  // 3. Unique knowledge (scenarioId, name) pairs (跨场景去重)
  const uniquePairs = new Set(
    allKnowledge.map((k) => `${k.scenarioId}::${k.displayName}`)
  );

  // 4. Knowledge profiles count
  const totalProfiles = await prisma.knowledgeProfile.count();

  // 5. Profiles with matching graph_node vs orphan profiles
  const profilesWithNode = await prisma.knowledgeProfile.count({
    where: { node: { nodeType: "Knowledge" } },
  });
  const profilesOrphan = await prisma.knowledgeProfile.count({
    where: { node: { is: { nodeType: { not: "Knowledge" } } } },
  });

  // 6. Distribution by scenario
  const byScenario = await prisma.graphNode.groupBy({
    by: ["scenarioId"],
    where: { nodeType: "Knowledge" },
    _count: { _all: true },
  });

  // 7. Knowledge rows without profiles (in same scenario)
  const knowledgeNoProfile = await prisma.graphNode.count({
    where: {
      nodeType: "Knowledge",
      knowledgeProfile: { is: null },
    },
  });

  console.log("===== Knowledge 数据盘点 =====");
  console.log(`knowledge 行总数 (含重名):      ${totalRows}`);
  console.log(`unique name 全局去重数:          ${uniqueNames}`);
  console.log(`unique (scenario, name) 去重数:  ${uniquePairs.size}`);
  console.log(`knowledge_profiles 总数:         ${totalProfiles}`);
  console.log(`profile 关联到 Knowledge 节点:   ${profilesWithNode}`);
  console.log(`profile 是孤儿(关联非Knowledge): ${profilesOrphan}`);
  console.log(`Knowledge 行无 profile:          ${knowledgeNoProfile}`);

  console.log("\n===== 按场景分布 =====");
  const scenarios = await prisma.learningScenario.findMany({
    select: { id: true, code: true },
  });
  const codeMap = new Map(scenarios.map((s) => [s.id, s.code]));
  for (const row of byScenario) {
    console.log(
      `${codeMap.get(row.scenarioId) || row.scenarioId}: ${row._count._all}`
    );
  }

  console.log("\n===== Resources 盘点 (参考) =====");
  const totalResources = await prisma.resource.count();
  const uniqueResourceTitles = await prisma.resource
    .findMany({ select: { title: true } })
    .then((rows) => new Set(rows.map((r) => r.title)).size);
  console.log(`resources 行总数: ${totalResources}`);
  console.log(`resources unique title: ${uniqueResourceTitles}`);

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});