import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

(async () => {
  const scenario = await prisma.learningScenario.findUnique({ where: { code: "ONLINE_COURSE" } });
  const nodes = await prisma.graphNode.findMany({
    where: { scenarioId: scenario.id, nodeType: "Knowledge" },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
  console.log("DB Knowledge count:", nodes.length);
  for (const n of nodes) {
    console.log(`  ${n.displayName} -> ${n.id}`);
  }
  await prisma.$disconnect();
})();