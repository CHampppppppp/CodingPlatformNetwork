import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

(async () => {
  const scenario = await prisma.learningScenario.findUnique({ where: { code: "ONLINE_COURSE" } });
  const rels = await prisma.studentKnowledgeRelation.findMany({
    where: { studentNode: { scenarioId: scenario.id } },
    take: 5,
    include: {
      studentNode: { select: { id: true, displayName: true, nodeType: true, scenarioId: true } },
      knowledgeNode: { select: { id: true, displayName: true, nodeType: true, scenarioId: true } },
    },
  });
  console.log("Sample student-knowledge relations:");
  for (const r of rels) {
    console.log(`  student="${r.studentNode.displayName}" (${r.studentNode.nodeType})`);
    console.log(`    ↳ knowledge="${r.knowledgeNode.displayName}" (${r.knowledgeNode.nodeType})`);
    console.log(`    relation: studentNodeId=${r.studentNodeId}`);
    console.log(`               knowledgeNodeId=${r.knowledgeNodeId}`);
  }
  await prisma.$disconnect();
})();