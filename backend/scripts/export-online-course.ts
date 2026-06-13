#!/usr/bin/env ts-node
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const OUTPUT_DIR = path.resolve(__dirname, "../datas/ONLINE_COURSE");
const SCENARIO_CODE = "ONLINE_COURSE";
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: SCENARIO_CODE },
  });
  if (!scenario) {
    console.error(`Scenario ${SCENARIO_CODE} not found`);
    process.exit(1);
  }

  console.log(`=== Exporting ${SCENARIO_CODE} scenario ===`);
  console.log(`Scenario ID: ${scenario.id}`);

  // 1. Schools
  const schools = await prisma.school.findMany({
    where: { scenarioId: scenario.id },
  });
  console.log(`Schools: ${schools.length}`);

  // 2. Grades
  const gradeIds = (await prisma.grade.findMany({
    where: { schoolId: { in: schools.map((s) => s.id) } },
    select: { id: true },
  })).map((g) => g.id);
  const grades = await prisma.grade.findMany({
    where: { id: { in: gradeIds } },
  });
  console.log(`Grades: ${grades.length}`);

  // 3. Classes
  const classes = await prisma.class.findMany({
    where: { gradeId: { in: gradeIds } },
  });
  console.log(`Classes: ${classes.length}`);

  // 4. Sessions
  const sessions = await prisma.interactionSession.findMany({
    where: { scenarioId: scenario.id },
  });
  console.log(`Sessions: ${sessions.length}`);

  // 5. GraphNodes (split by nodeType for clarity)
  const allNodes = await prisma.graphNode.findMany({
    where: { scenarioId: scenario.id },
  });
  const students = allNodes.filter((n) => n.nodeType === "Student");
  const teachers = allNodes.filter((n) => n.nodeType === "Teacher");
  const knowledges = allNodes.filter((n) => n.nodeType === "Knowledge");
  console.log(`GraphNodes: ${allNodes.length} (Students=${students.length}, Teachers=${teachers.length}, Knowledge=${knowledges.length})`);

  // 6. Profiles
  const studentProfiles = await prisma.studentProfile.findMany({
    where: { nodeId: { in: students.map((s) => s.id) } },
  });
  const knowledgeProfiles = await prisma.knowledgeProfile.findMany({
    where: { nodeId: { in: knowledges.map((n) => n.id) } },
  });
  console.log(`Profiles: StudentProfile=${studentProfiles.length}, KnowledgeProfile=${knowledgeProfiles.length}`);

  // 7. StudentKnowledgeRelations
  const relations = await prisma.studentKnowledgeRelation.findMany({
    where: { studentNodeId: { in: students.map((s) => s.id) } },
  });
  console.log(`Student-Knowledge relations: ${relations.length}`);

  // 8. Interactions
  const interactions = await prisma.interaction.findMany({
    where: { sessionId: { in: sessions.map((s) => s.id) } },
  });
  console.log(`Interactions: ${interactions.length}`);

  // 9. SessionClassroomAnalysis + StudentWork (if any)
  const analyses = await prisma.sessionClassroomAnalysis.findMany({
    where: { sessionId: { in: sessions.map((s) => s.id) } },
  });
  const works = await prisma.studentWork.findMany({
    where: { sessionId: { in: sessions.map((s) => s.id) } },
  });
  console.log(`SessionClassroomAnalysis: ${analyses.length}, StudentWork: ${works.length}`);

  // Build full export payload
  const payload = {
    exportedAt: new Date().toISOString(),
    scenario,
    schools,
    grades,
    classes,
    sessions,
    graphNodes: {
      all: allNodes,
      students,
      teachers,
      knowledges,
    },
    profiles: {
      student: studentProfiles,
      knowledge: knowledgeProfiles,
    },
    studentKnowledgeRelations: relations,
    interactions,
    sessionClassroomAnalyses: analyses,
    studentWorks: works,
  };

  const filename = `online_course_export_${TIMESTAMP}.json`;
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(payload, null, 2), "utf-8");

  console.log(`\n=== Export complete ===`);
  console.log(`File: ${filepath}`);
  console.log(`Size: ${(fs.statSync(filepath).size / 1024 / 1024).toFixed(2)} MB`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});