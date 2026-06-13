import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: "ONLINE_COURSE" },
  });
  if (!scenario) {
    console.log("Scenario not found");
    return;
  }
  const kCount = await prisma.graphNode.count({
    where: { scenarioId: scenario.id, nodeType: "Knowledge" },
  });
  const sCount = await prisma.graphNode.count({
    where: { scenarioId: scenario.id, nodeType: "Student" },
  });
  const tCount = await prisma.graphNode.count({
    where: { scenarioId: scenario.id, nodeType: "Teacher" },
  });
  const sampleKnowledge = await prisma.graphNode.findMany({
    where: { scenarioId: scenario.id, nodeType: "Knowledge" },
    take: 10,
    select: { id: true, displayName: true },
  });
  console.log(`Scenario: ${scenario.code}`);
  console.log(`Knowledge: ${kCount}`);
  console.log(`Student: ${sCount}`);
  console.log(`Teacher: ${tCount}`);
  console.log("Sample knowledge nodes:");
  for (const k of sampleKnowledge) {
    console.log(`  ${k.displayName} → ${k.id}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});