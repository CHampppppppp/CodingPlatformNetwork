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
  // 现有 172 个 profile 关联的 graph_node 信息
  const profiles = await prisma.knowledgeProfile.findMany({
    select: {
      nodeId: true,
      content: true,
      knowledgeType: true,
      category: true,
      node: {
        select: { displayName: true, scenarioId: true },
      },
    },
  });

  // 按 displayName 分组
  const byName = new Map<string, typeof profiles>();
  for (const p of profiles) {
    const name = p.node.displayName;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push(p);
  }

  const dupes = [...byName.entries()].filter(([_, arr]) => arr.length > 1);
  console.log(`profile 总数: ${profiles.length}`);
  console.log(`profile 关联的 unique displayName: ${byName.size}`);
  console.log(`同名 profile 重复组数: ${dupes.length}`);
  if (dupes.length > 0) {
    console.log("\n--- 重复组样本（前 3 组）---");
    for (const [name, arr] of dupes.slice(0, 3)) {
      console.log(`\n[${name}] 出现 ${arr.length} 次:`);
      for (const p of arr) {
        console.log(`  scenario=${p.node.scenarioId.slice(0, 8)}... type=${p.knowledgeType} category=${p.category}`);
        console.log(`    content=${p.content?.slice(0, 60) ?? "(null)"}`);
      }
    }
  }

  // 缺 profile 的 60 个 knowledge 节点
  const knowledgeAll = await prisma.graphNode.findMany({
    where: { nodeType: "Knowledge" },
    select: { displayName: true, scenarioId: true },
  });
  const profileNames = new Set(profiles.map((p) => p.node.displayName));
  const allNames = new Set(knowledgeAll.map((k) => k.displayName));
  const missing = [...allNames].filter((n) => !profileNames.has(n));
  console.log(`\n缺 profile 的 unique knowledge: ${missing.length}`);
  console.log("前 10 个:");
  for (const n of missing.slice(0, 10)) console.log(`  - ${n}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
