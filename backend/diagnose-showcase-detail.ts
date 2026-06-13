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
  console.log("===== Session 与 801班的关系 =====");
  const sessions = await prisma.interactionSession.findMany({
    where: { sessionName: { contains: "801" } },
    include: {
      interactions: { take: 0 },
    },
  });
  for (const s of sessions) {
    console.log(`session.id=${s.id.slice(0, 16)}...`);
    console.log(`  name=${s.sessionName}`);
    console.log(`  schoolId=${s.schoolId}`);
    console.log(`  classId=${s.classId ?? "(null)"}`);
    console.log(`  interactions=${s.interactions.length}`);
    console.log(`  is_target=${s.classId === TARGET_CLASS_ID ? "✓ 801班" : "✗"}`);
  }

  console.log("\n===== 150 个 knowledge 中：被 801班 classId 的 session 引用的 =====");
  const knowledgeIds = (
    await prisma.graphNode.findMany({
      where: { nodeType: "Knowledge", scenarioId: { not: undefined } },
      select: { id: true, displayName: true, scenarioId: true },
    })
  );
  const sid = knowledgeIds.find((k) => k.scenarioId)?.scenarioId!;

  // 查找 801班 session 的 interactions 涉及的 knowledge
  const targetSession = sessions.find((s) => s.classId === TARGET_CLASS_ID);
  if (!targetSession) {
    console.log("没有 classId = cls_444ed4824245 的 session");
  } else {
    console.log(`target session: ${targetSession.id} (${targetSession.sessionName})`);

    // 通过 interaction 涉及的 knowledge
    const interactions = await prisma.interaction.findMany({
      where: { sessionId: targetSession.id },
      select: { sourceNodeId: true, targetNodeId: true, sourceNode: { select: { nodeType: true } }, targetNode: { select: { nodeType: true } } },
    });
    const usedKnowledgeIds = new Set<string>();
    for (const i of interactions) {
      if (i.sourceNode.nodeType === "Knowledge") usedKnowledgeIds.add(i.sourceNodeId);
      if (i.targetNode.nodeType === "Knowledge") usedKnowledgeIds.add(i.targetNodeId);
    }
    console.log(`session 涉及的 knowledge id 数: ${usedKnowledgeIds.size}`);

    // student_knowledge_relations 在 801班 32 学生范围内的
    const studentsInClass = await prisma.graphNode.findMany({
      where: { nodeType: "Student", classId: TARGET_CLASS_ID },
      select: { id: true },
    });
    const studentIds = new Set(studentsInClass.map((s) => s.id));
    const studentRel = await prisma.studentKnowledgeRelation.findMany({
      where: { studentNodeId: { in: [...studentIds] } },
      select: { knowledgeNodeId: true },
    });
    for (const r of studentRel) usedKnowledgeIds.add(r.knowledgeNodeId);
    console.log(`加上 32 学生 student_knowledge_relations 后: ${usedKnowledgeIds.size}`);

    // 整体: SHOW_CASE 场景下 knowledge 被 801班范围使用的
    const showCaseKnowledge = knowledgeIds.filter((k) => k.scenarioId === sid);
    const showCaseUsed = showCaseKnowledge.filter((k) => usedKnowledgeIds.has(k.id));
    const showCaseUnused = showCaseKnowledge.filter((k) => !usedKnowledgeIds.has(k.id));

    console.log(`\nSHOW_CASE 的 ${showCaseKnowledge.length} 个 knowledge:`);
    console.log(`  被 801班 范围使用: ${showCaseUsed.length}`);
    console.log(`  未被使用:         ${showCaseUnused.length}`);

    if (showCaseUnused.length > 0 && showCaseUnused.length <= 20) {
      console.log("未使用的 knowledge 名字:");
      for (const k of showCaseUnused) console.log(`  - ${k.displayName}`);
    } else if (showCaseUnused.length > 20) {
      console.log(`前 10 个未使用的:`);
      for (const k of showCaseUnused.slice(0, 10)) console.log(`  - ${k.displayName}`);
    }
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
