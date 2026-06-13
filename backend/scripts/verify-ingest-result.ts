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
  if (!scenario) { console.log("no scenario"); return; }
  const relCount = await prisma.studentKnowledgeRelation.count({
    where: { studentNode: { scenarioId: scenario.id } },
  });
  // Filter interactions by ONLINE_COURSE scenario via session
  const onlineCourseSessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
    select: { id: true },
  });
  const sessionIds = onlineCourseSessions.map(s => s.id);
  const intCount = await prisma.interaction.count({ where: { sessionId: { in: sessionIds } } });
  const likeCount = await prisma.interaction.count({ where: { sessionId: { in: sessionIds }, actionType: "LIKE" } });
  const cmtCount = await prisma.interaction.count({ where: { sessionId: { in: sessionIds }, actionType: "COMMENT" } });
  const studyCount = await prisma.interaction.count({ where: { sessionId: { in: sessionIds }, actionType: "STUDY" } });
  const sessionCount = await prisma.interactionSession.count({ where: { scenarioId: scenario.id } });
  const schoolCount = await prisma.school.count({ where: { scenarioId: scenario.id } });
  const gradeCount = await prisma.grade.count({ where: { school: { scenarioId: scenario.id } } });
  const classCount = await prisma.class.count({ where: { grade: { school: { scenarioId: scenario.id } } } });
  // Sample some interactions to see what's actually stored
  const sampleInteractions = await prisma.interaction.findMany({
    take: 5,
    select: { id: true, actionType: true, interactionType: true, sourceNodeId: true, targetNodeId: true, strength: true, sessionId: true },
  });
  console.log("=== ONLINE_COURSE 入库结果 ===");
  console.log(`Schools: ${schoolCount}`);
  console.log(`Grades: ${gradeCount}`);
  console.log(`Classes: ${classCount}`);
  console.log(`Sessions: ${sessionCount}`);
  console.log(`Student-Knowledge relations: ${relCount}`);
  console.log(`Interactions total: ${intCount}`);
  console.log(`  LIKE: ${likeCount}`);
  console.log(`  COMMENT: ${cmtCount}`);
  console.log(`  STUDY: ${studyCount}`);
  console.log(`Sample interactions:`);
  for (const i of sampleInteractions) {
    console.log(`  ${i.actionType} ${i.interactionType} src=${i.sourceNodeId.slice(0,12)} tgt=${i.targetNodeId?.slice(0,12) || "null"} sess=${i.sessionId?.slice(0,12) || "null"}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });