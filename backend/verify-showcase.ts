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

const TARGET_SCHOOL_ID = "sch_2ea7099c4245";
const TARGET_GRADE_ID = "grd_3ca9606c4245";
const TARGET_CLASS_ID = "cls_444ed4824245";
const TARGET_TEACHER_ID = "cmouyme0s0001n8l3swek1q2j";
const TARGET_SESSION_ID = "cmoh0jbd40003jx8ocwkn3nc7";

async function main() {
  const sc = await prisma.learningScenario.findUnique({ where: { code: "SHOW_CASE" } });
  const sid = sc!.id;

  console.log("===== SHOW_CASE 最终状态验证 =====\n");

  // 1. 学校
  const school = await prisma.school.findUnique({ where: { id: TARGET_SCHOOL_ID } });
  console.log(`学校: ${school?.name ?? "MISSING"} (id=${TARGET_SCHOOL_ID})`);

  // 2. 年级
  const grade = await prisma.grade.findUnique({ where: { id: TARGET_GRADE_ID } });
  console.log(`年级: ${grade?.gradeName ?? "MISSING"} 年级 (id=${TARGET_GRADE_ID})`);

  // 3. 班级
  const cls = await prisma.class.findUnique({
    where: { id: TARGET_CLASS_ID },
    include: { grade: { include: { school: true } } },
  });
  console.log(`班级: ${cls?.className ?? "MISSING"} (grade=${cls?.grade.gradeName}, school=${cls?.grade.school.name})`);

  // 4. 教师
  const teacher = await prisma.graphNode.findUnique({
    where: { id: TARGET_TEACHER_ID },
    include: { teacherProfile: true },
  });
  console.log(`教师: ${teacher?.displayName ?? "MISSING"} (subject=${teacher?.teacherProfile?.subject})`);

  // 5. 学生
  const students = await prisma.graphNode.findMany({
    where: { nodeType: "Student", scenarioId: sid },
    select: { displayName: true },
    orderBy: { displayName: "asc" },
  });
  console.log(`\n学生 (${students.length}):`);
  for (const s of students) console.log(`  - ${s.displayName}`);

  // 6. Session
  const session = await prisma.interactionSession.findUnique({
    where: { id: TARGET_SESSION_ID },
    include: { interactions: { take: 0 } },
  });
  console.log(`\nSession: ${session?.sessionName ?? "MISSING"}`);
  console.log(`  interactions 计数: ${session?.interactions.length ?? 0}`);

  // 7. Knowledge (保留 150)
  const knowledge = await prisma.graphNode.count({
    where: { nodeType: "Knowledge", scenarioId: sid },
  });
  console.log(`\nKnowledge: ${knowledge} (保留全部 150，未清理)`);

  // 8. Knowledge profiles
  const profiles = await prisma.knowledgeProfile.count({
    where: { scenarioId: sid },
  });
  console.log(`Knowledge profiles: ${profiles}`);

  // 9. Interactions
  const interactions = await prisma.interaction.count({
    where: { sessionId: TARGET_SESSION_ID },
  });
  console.log(`Interactions in target session: ${interactions}`);

  // 10. student_knowledge_relations
  const studentRel = await prisma.studentKnowledgeRelation.count({
    where: { studentNode: { scenarioId: sid } },
  });
  console.log(`student_knowledge_relations (SHOW_CASE students): ${studentRel}`);

  // 11. resource_knowledge_relations (全局，不动)
  const resourceRel = await prisma.resourceKnowledgeRelation.count();
  console.log(`resource_knowledge_relations (全局，未动): ${resourceRel}`);

  // 12. 其他场景数据完整性
  console.log("\n===== 其他场景数据完整性 =====");
  const allScenarios = await prisma.learningScenario.findMany({
    select: { code: true },
  });
  for (const s of allScenarios) {
    const c = {
      schools: await prisma.school.count({ where: { scenario: { code: s.code } } }),
      teachers: await prisma.graphNode.count({
        where: { nodeType: "Teacher", scenario: { code: s.code } },
      }),
      sessions: await prisma.interactionSession.count({
        where: { scenario: { code: s.code } },
      }),
    };
    console.log(`  ${s.code}: schools=${c.schools}, teachers=${c.teachers}, sessions=${c.sessions}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });