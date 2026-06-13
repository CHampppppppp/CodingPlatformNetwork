import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

(async () => {
  const scenario = await prisma.learningScenario.findUnique({ where: { code: "ONLINE_COURSE" } });
  const students = await prisma.graphNode.findMany({
    where: { scenarioId: scenario.id, nodeType: "Student" },
    include: { studentProfile: true },
  });
  console.log(`Total students: ${students.length}`);
  // Group by displayName (used as our externalId)
  const displayNames = new Set<string>();
  const externalUserIds = new Set<string>();
  const externalUserIdCounts = new Map<string, number>();
  for (const s of students) {
    displayNames.add(s.displayName);
    const extId = s.studentProfile?.externalUserId;
    if (extId) {
      externalUserIds.add(extId);
      externalUserIdCounts.set(extId, (externalUserIdCounts.get(extId) ?? 0) + 1);
    }
  }
  console.log(`Unique displayName: ${displayNames.size}`);
  console.log(`Unique externalUserId: ${externalUserIds.size}`);
  // Find duplicates
  const dups = [...externalUserIdCounts.entries()].filter(([_, v]) => v > 1);
  console.log(`Duplicate externalUserIds: ${dups.length}`);
  for (const [k, v] of dups.slice(0, 5)) {
    console.log(`  ${k}: ${v} students`);
  }
  await prisma.$disconnect();
})();