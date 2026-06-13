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

const TARGET_SESSION_ID = "cmoh0jbd40003jx8ocwkn3nc7";

async function main() {
  const interactions = await prisma.interaction.findMany({
    where: { sessionId: TARGET_SESSION_ID },
    select: {
      sourceNodeId: true,
      targetNodeId: true,
      sourceNode: { select: { nodeType: true, displayName: true, scenarioId: true } },
      targetNode: { select: { nodeType: true, displayName: true, scenarioId: true } },
    },
  });
  console.log(`target session interactions: ${interactions.length}`);

  const sc = await prisma.learningScenario.findUnique({ where: { code: "SHOW_CASE" } });
  const sid = sc!.id;

  const refNodeIds = new Set<string>();
  for (const i of interactions) {
    refNodeIds.add(i.sourceNodeId);
    refNodeIds.add(i.targetNodeId);
  }
  console.log(`引用到的 unique node id: ${refNodeIds.size}`);

  const refNodes = await prisma.graphNode.findMany({
    where: { id: { in: [...refNodeIds] } },
    select: { id: true, nodeType: true, displayName: true, scenarioId: true },
  });
  const byType = new Map<string, number>();
  const crossSc = refNodes.filter((n) => n.scenarioId !== sid);
  for (const n of refNodes) {
    byType.set(n.nodeType, (byType.get(n.nodeType) ?? 0) + 1);
  }
  console.log("\n按 nodeType:");
  for (const [t, c] of byType) console.log(`  ${t}: ${c}`);
  console.log(`\n跨场景的引用节点: ${crossSc.length}`);
  if (crossSc.length > 0) {
    console.log("前 5 个:");
    for (const n of crossSc.slice(0, 5)) console.log(`  - ${n.displayName} (${n.nodeType})`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });