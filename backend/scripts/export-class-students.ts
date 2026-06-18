import { NestFactory } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";
import * as fs from "fs";
import * as path from "path";

function parseArgs() {
  const args = process.argv.slice(2);
  const params: Record<string, string> = {
    className: "801",
    format: "json",
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--") && i + 1 < args.length) {
      params[arg.slice(2)] = args[i + 1];
      i++;
    }
  }
  return params;
}

function getPinyinInitials(name: string): string {
  const charMap: Record<string, string> = {
    杭: "H", 州: "Z", 市: "S", 秀: "X", 水: "S", 小: "X", 学: "X",
    永: "Y", 康: "K", 山: "S", 下: "X", 宁: "N", 波: "B", 镇: "Z", 海: "H",
    应: "Y", 行: "X", 久: "J", 外: "W", 语: "Y", 实: "S", 验: "Y", 长: "C",
    兴: "X", 吕: "L", 乡: "X", 中: "Z", 三: "S", 门: "M", 嘉: "J",
    南: "N", 湖: "H", 区: "Q", 余: "Y", 新: "X", 心: "X",
    慈: "C", 溪: "X", 龙: "L", 城: "C", 滨: "B", 茅: "M", 以: "Y", 升: "S",
    舟: "Z", 第: "D", 一: "Y", 北: "B", 校: "X", 义: "Y", 乌: "W", 艺: "Y",
    术: "S", 椒: "J", 江: "J", 金: "J", 华: "H", 东: "D", 苑: "Y", 善: "S",
    吴: "W", 笕: "J", 桥: "Q", 口: "K", 崇: "C", 寿: "S", 初: "C",
    黄: "H", 岩: "Y", 头: "T", 陀: "T", 集: "J", 团: "T",
  };
  return name
    .split("")
    .map((char) => charMap[char] || char)
    .filter((c) => /[a-zA-Z]/.test(c))
    .join("")
    .toLowerCase();
}

function getSchoolPrefix(schoolName: string, override?: string): string {
  if (override) return override.toLowerCase();
  return getPinyinInitials(schoolName);
}

function padIndex(index: number, length = 2): string {
  return index.toString().padStart(length, "0");
}

function extractClassCode(className: string): string {
  const match = className.match(/\d+/);
  return match ? match[0] : className;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const value = row[h];
          if (value == null) return "";
          const text = String(value);
          if (text.includes(",") || text.includes('"') || text.includes("\n")) {
            return `"${text.replace(/"/g, '""')}"`;
          }
          return text;
        })
        .join(","),
    ),
  ];
  return lines.join("\n");
}

async function main() {
  const params = parseArgs();
  const className = params.className;
  const scenarioCode = params.scenarioCode;
  const schoolName = params.school;
  const schoolPrefixOverride = params.schoolPrefix;
  const format = "csv";
  const output = params.output;

  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  try {
    let scenarioId: string | undefined;
    if (scenarioCode) {
      const scenario = await prisma.learningScenario.findUnique({
        where: { code: scenarioCode },
        select: { id: true },
      });
      if (!scenario) {
        console.error(`场景不存在: ${scenarioCode}`);
        process.exit(1);
      }
      scenarioId = scenario.id;
    }

    const classWhere: Prisma.ClassWhereInput = { className };
    const classInclude = {
      grade: {
        include: {
          school: { include: { scenario: true } },
        },
      },
    };

    const classCandidates = await prisma.class.findMany({
      where: classWhere,
      include: classInclude,
    });

    let targetClass = classCandidates.find((c) => {
      if (scenarioId && c.grade.school.scenarioId !== scenarioId) return false;
      if (schoolName && c.grade.school.name !== schoolName) return false;
      return true;
    });

    if (!targetClass && classCandidates.length === 1) {
      targetClass = classCandidates[0];
    }

    if (!targetClass) {
      console.error(`未找到班级: ${className}`);
      if (scenarioCode) console.error(`场景过滤: ${scenarioCode}`);
      if (schoolName) console.error(`学校过滤: ${schoolName}`);
      console.error(`候选班级数: ${classCandidates.length}`);
      process.exit(1);
    }

    const school = targetClass.grade.school;
    const grade = targetClass.grade;
    const schoolPrefix = getSchoolPrefix(school.name, schoolPrefixOverride);

    const students = await prisma.graphNode.findMany({
      where: {
        nodeType: "Student",
        classId: targetClass.id,
      },
      include: {
        studentProfile: true,
        sourceEdges: { select: { id: true } },
        targetEdges: { select: { id: true } },
        cognitiveProfiles: {
          orderBy: { generatedAt: "desc" },
          take: 1,
          include: {
            dimensionScores: {
              where: { dimensionCode: "knowledgeReserve" },
            },
          },
        },
      },
      orderBy: { displayName: "asc" },
    });

    const rows = students.map((student, index) => {
      const profile = student.studentProfile;
      const latestCognitive = student.cognitiveProfiles[0];
      const knowledgeScore =
        latestCognitive?.dimensionScores[0]?.scoreValue ?? null;
      const outDegree = student.sourceEdges.length;
      const inDegree = student.targetEdges.length;
      const activity = outDegree + inDegree;
      const classCode = extractClassCode(targetClass.className);
      const userId = `${schoolPrefix}${classCode}${padIndex(index + 1)}`;

      return {
        user_id: userId,
        nodeId: student.id,
        name: student.displayName,
        gender: profile?.gender ?? null,
        personality: profile?.personality ?? null,
        knowledgeReserve: knowledgeScore != null ? Number(knowledgeScore) : null,
        activity,
        inDegree,
        outDegree,
        school: school.name,
        grade: `${grade.gradeName}年级`,
        class: targetClass.className,
      };
    });

    const result = {
      meta: {
        scenarioCode: school.scenario?.code ?? null,
        scenarioNameZh: school.scenario?.nameZh ?? null,
        school: school.name,
        grade: `${grade.gradeName}年级`,
        class: targetClass.className,
        studentCount: rows.length,
        schoolPrefix,
      },
      data: rows,
      error: null,
    };

    const defaultOutputPath = path.resolve(
      __dirname,
      "..",
      "..",
      "class-students.csv",
    );
    const outputPath = output ? path.resolve(output) : defaultOutputPath;
    const outputContent = toCsv(rows);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, outputContent, "utf-8");
    console.log(`已写入: ${outputPath}`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
