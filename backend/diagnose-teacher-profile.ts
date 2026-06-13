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

const TARGET_SCHOOL_ID = "school_c098384a667911f1816cbcfce7cbb7c8"; // 竺可桢学校?
const TARGET_CLASS_ID = "cls_444ed4824245";

async function main() {
  const sc = await prisma.learningScenario.findUnique({ where: { code: "SHOW_CASE" } });
  const sid = sc!.id;

  // 找竺可桢学校
  const zhuSchool = await prisma.school.findFirst({
    where: { scenarioId: sid, name: { contains: "竺可桢" } },
  });
  console.log(`竺可桢学校 id: ${zhuSchool?.id ?? "(NOT FOUND)"}`);

  // 找 8 年级
  if (zhuSchool) {
    const grade8 = await prisma.grade.findFirst({
      where: { schoolId: zhuSchool.id, gradeName: 8 },
    });
    console.log(`竺可桢学校 8 年级 id: ${grade8?.id ?? "(NOT FOUND)"}`);
  }

  // 找 801班
  const cls801 = await prisma.class.findUnique({
    where: { id: TARGET_CLASS_ID },
    include: { grade: true },
  });
  console.log(`801班: ${cls801 ? `grade=${cls801.gradeId} (${cls801.grade.gradeName} 年级)` : "(NOT FOUND)"}`);

  // 找 801班老师
  const teacher801 = await prisma.graphNode.findFirst({
    where: { nodeType: "Teacher", displayName: "801班老师", scenarioId: sid },
  });
  console.log(`801班老师: ${teacher801 ? teacher801.id : "(NOT FOUND)"}`);

  // 关键：teacher_profile 表的 classId 引用情况
  console.log("\n===== teacher_profiles.classId 引用分析 =====");
  const allTp = await prisma.teacherProfile.count();
  const tpWithClass = await prisma.teacherProfile.count({ where: { classId: { not: null } } });
  const tpShowCase = await prisma.teacherProfile.count({
    where: { class: { is: { grade: { is: { school: { is: { scenarioId: sid } } } } } } },
  });
  console.log(`teacher_profile 总数: ${allTp}`);
  console.log(`有 classId 引用的:    ${tpWithClass}`);
  console.log(`指向 SHOW_CASE 班级的: ${tpShowCase}`);

  // 找非 SHOW_CASE 班级的 teacher_profile
  const tpNonShowCase = tpWithClass - tpShowCase;
  console.log(`指向非 SHOW_CASE 班级的: ${tpNonShowCase}`);

  // 32 学生是否引用了非 801班 school/grade/class？
  console.log("\n===== 32 学生 GraphNode 的 school/grade/class 引用 =====");
  const students = await prisma.graphNode.findMany({
    where: { nodeType: "Student", classId: TARGET_CLASS_ID },
    select: { id: true, schoolId: true, gradeId: true, classId: true },
  });
  const wrongRefs = students.filter(
    (s) =>
      !s.schoolId ||
      !s.gradeId ||
      !s.classId ||
      s.classId !== TARGET_CLASS_ID
  );
  console.log(`32 学生中有引用异常的: ${wrongRefs.length}`);

  // class.teacherId 引用情况
  console.log("\n===== class.teacherId 引用情况 =====");
  const classesWithTeacher = await prisma.class.count({ where: { teacherId: { not: null } } });
  const class801Teacher = await prisma.class.findUnique({
    where: { id: TARGET_CLASS_ID },
    select: { teacherId: true },
  });
  console.log(`有 teacherId 的 class: ${classesWithTeacher}`);
  console.log(`801班.teacherId: ${class801Teacher?.teacherId}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });