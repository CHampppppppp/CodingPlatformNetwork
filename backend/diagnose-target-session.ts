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

const TARGET_CLASS_ID = "cls_444ed4824245";

async function main() {
  const sc = await prisma.learningScenario.findUnique({ where: { code: "SHOW_CASE" } });
  const sid = sc!.id;

  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: sid },
    include: { interactions: { take: 0 } },
  });
  console.log(`SHOW_CASE sessions: ${sessions.length}`);
  for (const s of sessions) {
    console.log(`  id=${s.id} classId=${s.classId ?? "(null)"} interactions=${s.interactions.length}`);
    console.log(`    name=${s.sessionName}`);
  }

  const targetSession = sessions.find((s) => s.classId === TARGET_CLASS_ID);
  console.log(`\ntarget session (classId=${TARGET_CLASS_ID}): ${targetSession ? "FOUND " + targetSession.id : "NOT FOUND"}`);

  const knowledgeNodes = await prisma.graphNode.findMany({
    where: { nodeType: "Knowledge", scenarioId: sid },
    select: { id: true, displayName: true },
  });
  console.log(`\nSHOW_CASE knowledge 节点: ${knowledgeNodes.length}`);

  const studentsInClass = await prisma.graphNode.findMany({
    where: { nodeType: "Student", classId: TARGET_CLASS_ID },
    select: { id: true },
  });
  const studentIds = new Set(studentsInClass.map((s) => s.id));
  console.log(`801班学生 GraphNode: ${studentsInClass.length}`);

  let usedInTargetSession = new Set<string>();
  if (targetSession) {
    const ints = await prisma.interaction.findMany({
      where: { sessionId: targetSession.id },
      select: { sourceNodeId: true, targetNodeId: true, sourceNode: { select: { nodeType: true } }, targetNode: { select: { nodeType: true } } },
    });
    console.log(`\ntarget session interactions: ${ints.length}`);
    for (const i of ints) {
      if (i.sourceNode.nodeType === "Knowledge") usedInTargetSession.add(i.sourceNodeId);
      if (i.targetNode.nodeType === "Knowledge") usedInTargetSession.add(i.targetNodeId);
    }
    console.log(`target session 用到的 knowledge: ${usedInTargetSession.size}`);
  }

  const studentRel = await prisma.studentKnowledgeRelation.findMany({
    where: { studentNodeId: { in: [...studentIds] } },
    select: { knowledgeNodeId: true },
  });
  const usedInStudentRel = new Set(studentRel.map((r) => r.knowledgeNodeId));
  console.log(`801班 32 学生的 student_knowledge_relations: ${studentRel.length} 条，关联的 knowledge: ${usedInStudentRel.size}`);

  const allUsed = new Set([...usedInTargetSession, ...usedInStudentRel]);
  console.log(`\n总被使用（target session + 801班 32 学生范围）: ${allUsed.size}`);

  const showCaseUnused = knowledgeNodes.filter((k) => !allUsed.has(k.id));
  console.log(`SHOW_CASE 未被使用（待删）: ${showCaseUnused.length}`);
  if (showCaseUnused.length > 0) {
    console.log("前 15 个:");
    for (const k of showCaseUnused.slice(0, 15)) console.log(`  - ${k.displayName}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });