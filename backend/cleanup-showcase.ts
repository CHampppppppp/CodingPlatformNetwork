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

const SID = ""; // SHOW_CASE scenario id, filled at runtime
const TARGET_SCHOOL_ID = "sch_2ea7099c4245"; // 竺可桢学校
const TARGET_GRADE_ID = "grd_3ca9606c4245"; // 竺可桢学校 8 年级
const TARGET_CLASS_ID = "cls_444ed4824245"; // 801班
const TARGET_TEACHER_ID = "cmouyme0s0001n8l3swek1q2j"; // 801班老师
const TARGET_SESSION_ID = "cmoh0jbd40003jx8ocwkn3nc7"; // 801班 GAI后测 session

async function snapshot() {
  return {
    schools: await prisma.school.count({ where: { scenarioId: SID } }),
    grades: await prisma.grade.count({ where: { school: { scenarioId: SID } } }),
    classes: await prisma.class.count({ where: { grade: { school: { scenarioId: SID } } } }),
    teachers: await prisma.graphNode.count({ where: { nodeType: "Teacher", scenarioId: SID } }),
    students: await prisma.graphNode.count({ where: { nodeType: "Student", scenarioId: SID } }),
    sessions: await prisma.interactionSession.count({ where: { scenarioId: SID } }),
    teacherProfiles: await prisma.teacherProfile.count(),
  };
}

function diff(before: any, after: any) {
  for (const k of Object.keys(before)) {
    if (before[k] !== after[k]) {
      console.log(`  ${k}: ${before[k]} → ${after[k]} (${after[k] - before[k] >= 0 ? "+" : ""}${after[k] - before[k]})`);
    } else {
      console.log(`  ${k}: ${before[k]} (unchanged)`);
    }
  }
}

async function main() {
  const sc = await prisma.learningScenario.findUnique({ where: { code: "SHOW_CASE" } });
  if (!sc) throw new Error("SHOW_CASE not found");
  (global as any).SID = sc.id;
  Object.assign(global, { SID: sc.id });

  console.log(`SHOW_CASE scenario id: ${sc.id}\n`);

  // Stage 1: delete mock sessions
  console.log("===== Stage 1: 删除 3 个 mock sessions =====");
  let before = await snapshot();
  const s1 = await prisma.interactionSession.deleteMany({
    where: {
      scenarioId: sc.id,
      id: { not: TARGET_SESSION_ID },
    },
  });
  console.log(`  删除 sessions: ${s1.count}`);
  let after = await snapshot();
  diff(before, after);

  // Stage 2: delete teacher_profiles (non-target teacher + non-SHOW_CASE class refs)
  console.log("\n===== Stage 2: 删除 13392 个非\"801班老师\"的 teacher_profile =====");
  before = await snapshot();
  const s2 = await prisma.teacherProfile.deleteMany({
    where: {
      OR: [
        // 指向非 SHOW_CASE 班级的
        {
          class: { grade: { school: { scenarioId: { not: sc.id } } } },
        },
        // SHOW_CASE 内但非"801班老师"的
        {
          nodeId: { not: TARGET_TEACHER_ID },
          class: { grade: { school: { scenarioId: sc.id } } },
        },
      ],
    },
  });
  console.log(`  删除 teacher_profiles: ${s2.count}`);
  after = await snapshot();
  diff(before, after);
  // 验证剩余
  const tpRemaining = await prisma.teacherProfile.count();
  const tpTarget = await prisma.teacherProfile.count({ where: { nodeId: TARGET_TEACHER_ID } });
  console.log(`  剩余 teacher_profile: ${tpRemaining} (应保留 1, 目标教师 = ${tpTarget})`);

  // Stage 3: delete classes (non-target)
  console.log("\n===== Stage 3: 删除 15325 个非 801班 的 classes =====");
  before = await snapshot();
  const s3 = await prisma.class.deleteMany({
    where: {
      grade: { school: { scenarioId: sc.id } },
      id: { not: TARGET_CLASS_ID },
    },
  });
  console.log(`  删除 classes: ${s3.count}`);
  after = await snapshot();
  diff(before, after);
  const clsRemaining = await prisma.class.count({ where: { scenarioId: sc.id } });
  console.log(`  剩余 SHOW_CASE class: ${clsRemaining} (应保留 1)`);

  // Stage 4: delete teacher GraphNodes (non-target)
  console.log("\n===== Stage 4: 删除 13392 个非\"801班老师\" 的 teacher GraphNode =====");
  before = await snapshot();
  const s4 = await prisma.graphNode.deleteMany({
    where: {
      nodeType: "Teacher",
      scenarioId: sc.id,
      id: { not: TARGET_TEACHER_ID },
    },
  });
  console.log(`  删除 teacher GraphNodes: ${s4.count}`);
  after = await snapshot();
  diff(before, after);
  const tnRemaining = await prisma.graphNode.count({
    where: { nodeType: "Teacher", scenarioId: sc.id },
  });
  console.log(`  剩余 SHOW_CASE Teacher GraphNode: ${tnRemaining} (应保留 1)`);

  // Stage 5: delete grades (non-target)
  console.log("\n===== Stage 5: 删除 1919 个非 8 年级 的 grades =====");
  before = await snapshot();
  const s5 = await prisma.grade.deleteMany({
    where: {
      school: { scenarioId: sc.id },
      id: { not: TARGET_GRADE_ID },
    },
  });
  console.log(`  删除 grades: ${s5.count}`);
  after = await snapshot();
  diff(before, after);
  const gRemaining = await prisma.grade.count({ where: { school: { scenarioId: sc.id } } });
  console.log(`  剩余 SHOW_CASE grade: ${gRemaining} (应保留 1)`);

  // Stage 6: delete schools (non-target)
  console.log("\n===== Stage 6: 删除 372 个非竺可桢学校 的 schools =====");
  before = await snapshot();
  const s6 = await prisma.school.deleteMany({
    where: {
      scenarioId: sc.id,
      id: { not: TARGET_SCHOOL_ID },
    },
  });
  console.log(`  删除 schools: ${s6.count}`);
  after = await snapshot();
  diff(before, after);
  const sRemaining = await prisma.school.count({ where: { scenarioId: sc.id } });
  console.log(`  剩余 SHOW_CASE school: ${sRemaining} (应保留 1)`);

  console.log("\n===== 清理完成 =====");
  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  });