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

async function snapshot(sid: string) {
  return {
    schools: await prisma.school.count({ where: { scenarioId: sid } }),
    grades: await prisma.grade.count({ where: { school: { scenarioId: sid } } }),
    classes: await prisma.class.count({ where: { grade: { school: { scenarioId: sid } } } }),
    teachers: await prisma.graphNode.count({ where: { nodeType: "Teacher", scenarioId: sid } }),
    students: await prisma.graphNode.count({ where: { nodeType: "Student", scenarioId: sid } }),
    sessions: await prisma.interactionSession.count({ where: { scenarioId: sid } }),
    teacherProfiles: await prisma.teacherProfile.count(),
  };
}

function diff(before: any, after: any) {
  for (const k of Object.keys(before)) {
    const delta = after[k] - before[k];
    if (delta === 0) console.log(`  ${k}: ${before[k]} (unchanged)`);
    else console.log(`  ${k}: ${before[k]} → ${after[k]} (${delta >= 0 ? "+" : ""}${delta})`);
  }
}

async function main() {
  const sc = await prisma.learningScenario.findUnique({ where: { code: "SHOW_CASE" } });
  if (!sc) throw new Error("SHOW_CASE not found");
  const sid = sc.id;
  console.log(`SHOW_CASE scenario id: ${sid}\n`);

  // Stage 4
  console.log("===== Stage 4: 删除 13392 个非\"801班老师\" 的 teacher GraphNode =====");
  let before = await snapshot(sid);
  const s4 = await prisma.graphNode.deleteMany({
    where: {
      nodeType: "Teacher",
      scenarioId: sid,
      id: { not: TARGET_TEACHER_ID },
    },
  });
  console.log(`  删除 teacher GraphNodes: ${s4.count}`);
  let after = await snapshot(sid);
  diff(before, after);

  // Stage 5
  console.log("\n===== Stage 5: 删除 1919 个非 8 年级 的 grades =====");
  before = await snapshot(sid);
  const s5 = await prisma.grade.deleteMany({
    where: {
      school: { scenarioId: sid },
      id: { not: TARGET_GRADE_ID },
    },
  });
  console.log(`  删除 grades: ${s5.count}`);
  after = await snapshot(sid);
  diff(before, after);

  // Stage 6
  console.log("\n===== Stage 6: 删除 372 个非竺可桢学校 的 schools =====");
  before = await snapshot(sid);
  const s6 = await prisma.school.deleteMany({
    where: {
      scenarioId: sid,
      id: { not: TARGET_SCHOOL_ID },
    },
  });
  console.log(`  删除 schools: ${s6.count}`);
  after = await snapshot(sid);
  diff(before, after);

  console.log("\n===== 清理完成，最终 SHOW_CASE 状态 =====");
  const final = await snapshot(sid);
  console.log(JSON.stringify(final, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});