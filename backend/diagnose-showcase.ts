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
  const sc = await prisma.learningScenario.findUnique({
    where: { code: "SHOW_CASE" },
  });
  if (!sc) throw new Error("SHOW_CASE not found");
  const sid = sc.id;
  console.log(`SHOW_CASE id: ${sid}\n`);

  // 1. 统计各实体
  const counts = {
    schools: await prisma.school.count({ where: { scenarioId: sid } }),
    grades: await prisma.grade.count({ where: { school: { scenarioId: sid } } }),
    classes: await prisma.class.count({ where: { grade: { school: { scenarioId: sid } } } }),
    students: await prisma.graphNode.count({ where: { nodeType: "Student", scenarioId: sid } }),
    teachers: await prisma.graphNode.count({ where: { nodeType: "Teacher", scenarioId: sid } }),
    knowledge: await prisma.graphNode.count({ where: { nodeType: "Knowledge", scenarioId: sid } }),
    resources: await prisma.resource.count(),
    sessions: await prisma.interactionSession.count({ where: { scenarioId: sid } }),
    interactions: await prisma.interaction.count({ where: { session: { scenarioId: sid } } }),
    studentKnowledge: await prisma.studentKnowledgeRelation.count({
      where: { studentNode: { scenarioId: sid } },
    }),
    resourceKnowledge: await prisma.resourceKnowledgeRelation.count({ where: { resource: {} } }),
  };

  console.log("===== SHOW_CASE 现状 =====");
  console.log(`schools:                ${counts.schools}`);
  console.log(`grades:                 ${counts.grades}`);
  console.log(`classes:                ${counts.classes}`);
  console.log(`students (GraphNode):   ${counts.students}`);
  console.log(`teachers (GraphNode):   ${counts.teachers}`);
  console.log(`knowledge (GraphNode):  ${counts.knowledge}`);
  console.log(`resources (全局):       ${counts.resources}`);
  console.log(`sessions:               ${counts.sessions}`);
  console.log(`interactions:           ${counts.interactions}`);
  console.log(`studentKnowledgeRelations: ${counts.studentKnowledge}`);
  console.log(`resourceKnowledgeRelations: ${counts.resourceKnowledge}`);

  // 2. 找 32 学生的 801班
  console.log("\n===== 竺可桢学校 / 801班 / cls_444ed4824245 =====");
  const target = await prisma.class.findUnique({
    where: { id: "cls_444ed4824245" },
    include: {
      grade: { include: { school: true } },
      teacherNode: { include: { teacherProfile: true } },
    },
  });
  console.log(`class found: ${!!target}`);
  if (target) {
    console.log(`  className=${target.className}`);
    console.log(`  grade=${target.grade.gradeName} school=${target.grade.school.name} scenario=${target.grade.school.scenarioId === sid ? "SHOW_CASE ✓" : "OTHER ✗"}`);
    console.log(`  teacherNode=${target.teacherNode?.displayName ?? "(none)"}`);
  }

  // 3. sessions 列表
  console.log("\n===== SHOW_CASE 全部 sessions =====");
  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: sid },
    select: { id: true, sessionName: true, occurredAt: true, schoolId: true, classId: true, _count: { select: { interactions: true } } },
  });
  console.log(`sessions 总数: ${sessions.length}`);
  for (const s of sessions.slice(0, 10)) {
    console.log(`  ${s.id.slice(0, 12)}... name=${s.sessionName ?? "(unnamed)"} interactions=${s._count.interactions}`);
  }
  if (sessions.length > 10) console.log(`  ... 共 ${sessions.length} 个`);

  // 4. 知识点的引用情况
  console.log("\n===== SHOW_CASE 知识点的引用情况 =====");
  const knowledgeNodes = await prisma.graphNode.findMany({
    where: { nodeType: "Knowledge", scenarioId: sid },
    select: { id: true, displayName: true },
  });
  console.log(`knowledge 节点总数: ${knowledgeNodes.length}`);

  const knowledgeIds = knowledgeNodes.map((k) => k.id);
  const usedInInteractions = new Set(
    (
      await prisma.interaction.findMany({
        where: {
          OR: [{ sourceNodeId: { in: knowledgeIds } }, { targetNodeId: { in: knowledgeIds } }],
        },
        select: { sourceNodeId: true, targetNodeId: true },
      })
    ).flatMap((i) => [i.sourceNodeId, i.targetNodeId])
  );
  const usedInStudentRel = new Set(
    (
      await prisma.studentKnowledgeRelation.findMany({
        where: { knowledgeNodeId: { in: knowledgeIds } },
        select: { knowledgeNodeId: true },
      })
    ).map((r) => r.knowledgeNodeId)
  );
  const usedInResourceRel = new Set(
    (
      await prisma.resourceKnowledgeRelation.findMany({
        where: { knowledgeNodeId: { in: knowledgeIds } },
        select: { knowledgeNodeId: true },
      })
    ).map((r) => r.knowledgeNodeId)
  );
  const allUsed = new Set([...usedInInteractions, ...usedInStudentRel, ...usedInResourceRel]);
  const unused = knowledgeNodes.filter((k) => !allUsed.has(k.id));
  console.log(`被 interactions 引用:  ${usedInInteractions.size}`);
  console.log(`被 student_knowledge 引用: ${usedInStudentRel.size}`);
  console.log(`被 resource_knowledge 引用: ${usedInResourceRel.size}`);
  console.log(`从未被引用（待删）:  ${unused.length}`);
  if (unused.length > 0) {
    console.log("前 5 个未使用的 knowledge:");
    for (const k of unused.slice(0, 5)) console.log(`  - ${k.displayName}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
