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
  const knowledgeAll = await prisma.graphNode.findMany({
    where: { nodeType: "Knowledge" },
    select: { id: true, displayName: true, scenarioId: true },
  });
  const profileNodeIds = new Set(
    (await prisma.knowledgeProfile.findMany({ select: { nodeId: true } })).map(
      (p) => p.nodeId
    )
  );
  const missing = knowledgeAll.filter((k) => !profileNodeIds.has(k.id));

  console.log(`缺 profile 的 knowledge 节点数: ${missing.length}`);

  // 按 scenario 统计
  const byScenario = new Map<string, number>();
  for (const m of missing) {
    byScenario.set(m.scenarioId, (byScenario.get(m.scenarioId) ?? 0) + 1);
  }
  const scenarios = await prisma.learningScenario.findMany({
    select: { id: true, code: true },
  });
  const codeMap = new Map(scenarios.map((s) => [s.id, s.code]));
  console.log("\n按场景分布:");
  for (const [sid, cnt] of byScenario) {
    console.log(`  ${codeMap.get(sid) || sid}: ${cnt}`);
  }

  // 抽样前 5 个，看是否 nodeId 唯一（理论上 graphNode.id 是 PK，肯定唯一）
  console.log("\n前 5 个缺 profile 的节点:");
  for (const m of missing.slice(0, 5)) {
    console.log(`  nodeId=${m.id.slice(0, 12)}... scenario=${codeMap.get(m.scenarioId)} name=${m.displayName}`);
  }

  // 验证：现有 172 profile 关联的 GraphNode 都存在
  const profiles = await prisma.knowledgeProfile.findMany({
    select: { nodeId: true },
  });
  const graphNodeIds = new Set(knowledgeAll.map((k) => k.id));
  const orphanProfiles = profiles.filter((p) => !graphNodeIds.has(p.nodeId));
  console.log(`\nprofile 引用了不存在的 GraphNode: ${orphanProfiles.length}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
