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

  console.log("===== resource_knowledge_relations 跨场景分析 =====");
  const rkr = await prisma.resourceKnowledgeRelation.findMany({
    include: {
      resource: { select: { id: true, title: true } },
      knowledgeNode: { select: { id: true, displayName: true, scenarioId: true } },
    },
  });
  console.log(`resource_knowledge_relations 总数: ${rkr.length}`);

  const sameSc = rkr.filter((r) => r.knowledgeNode.scenarioId === sid);
  const crossSc = rkr.filter((r) => r.knowledgeNode.scenarioId !== sid);
  console.log(`resource 与 SHOW_CASE knowledge 配对: ${sameSc.length}`);
  console.log(`resource 与跨场景 knowledge 配对:   ${crossSc.length}`);

  console.log("\n===== SHOW_CASE knowledge 中被 resource 关联的 =====");
  const scKnowledgeIds = new Set(
    (await prisma.graphNode.findMany({ where: { nodeType: "Knowledge", scenarioId: sid }, select: { id: true } })).map((k) => k.id)
  );
  const linkedByResource = new Set(sameSc.map((r) => r.knowledgeNodeId));
  const linkedByResourceCross = new Set(crossSc.map((r) => r.knowledgeNodeId));
  console.log(`被 resource 关联的 SHOW_CASE knowledge: ${linkedByResource.size}`);
  console.log(`被 resource 跨场景关联的 SHOW_CASE knowledge: ${linkedByResourceCross.size}`);

  console.log("\n===== 跨场景污染汇总 =====");
  // 其他场景的 interactions 引用 SHOW_CASE knowledge 的数量
  const showCaseKnowledgeIds = [...scKnowledgeIds];
  const crossInteractions = await prisma.interaction.count({
    where: {
      OR: [
        { sourceNodeId: { in: showCaseKnowledgeIds }, session: { scenarioId: { not: sid } } },
        { targetNodeId: { in: showCaseKnowledgeIds }, session: { scenarioId: { not: sid } } },
      ],
    },
  });
  console.log(`其他场景 interactions 引用 SHOW_CASE knowledge: ${crossInteractions}`);

  const crossStudentRel = await prisma.studentKnowledgeRelation.count({
    where: {
      knowledgeNodeId: { in: showCaseKnowledgeIds },
      studentNode: { scenarioId: { not: sid } },
    },
  });
  console.log(`其他场景 student_knowledge 引用 SHOW_CASE knowledge: ${crossStudentRel}`);

  console.log("\n===== 32 个学生是否有跨场景 student_knowledge =====");
  const studentsInClass = await prisma.graphNode.findMany({
    where: { nodeType: "Student", classId: TARGET_CLASS_ID },
    select: { id: true },
  });
  const studentIds = studentsInClass.map((s) => s.id);
  const crossStudentRelForTarget = await prisma.studentKnowledgeRelation.findMany({
    where: { studentNodeId: { in: studentIds } },
    include: { knowledgeNode: { select: { displayName: true, scenarioId: true } } },
  });
  console.log(`801班 32 学生的 student_knowledge_relations 总数: ${crossStudentRelForTarget.length}`);
  console.log("每条关联的 knowledge scenario:");
  for (const r of crossStudentRelForTarget) {
    const same = r.knowledgeNode.scenarioId === sid;
    console.log(`  ${same ? "✓" : "✗跨场景"} ${r.knowledgeNode.displayName}`);
  }

  console.log("\n===== 教师节点 =====");
  const teachers = await prisma.graphNode.findMany({
    where: { nodeType: "Teacher", scenarioId: sid },
    select: { id: true, displayName: true },
  });
  const targetTeacher = teachers.find((t) => t.displayName === "801班老师");
  console.log(`SHOW_CASE Teacher GraphNode 总数: ${teachers.length}`);
  console.log(`"801班老师" 是否存在: ${targetTeacher ? "✓ " + targetTeacher.id : "✗"}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });