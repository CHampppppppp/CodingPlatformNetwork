import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";

/**
 * 仅重算 SHOW_CASE 场景下学生节点的度数，速度较快。
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  const scenario = await prisma.learningScenario.findUnique({
    where: { code: "SHOW_CASE" },
  });
  if (!scenario) {
    console.log("SHOW_CASE not found");
    return;
  }

  const scenarioId = scenario.id;

  await prisma.$executeRaw`
    UPDATE student_profiles_test sp
    INNER JOIN graph_nodes_test n ON n.id = sp.nodeId
    SET sp.inDegree = 0, sp.outDegree = 0, sp.totalDegree = 0
    WHERE n.scenarioId = ${scenarioId} AND n.nodeType = 'Student'
  `;

  await prisma.$executeRaw`
    UPDATE student_profiles_test sp
    INNER JOIN (
      SELECT i.sourceNodeId AS nodeId, COUNT(*) AS cnt
      FROM interactions_test i
      INNER JOIN graph_nodes_test n ON n.id = i.sourceNodeId
      WHERE n.scenarioId = ${scenarioId} AND n.nodeType = 'Student'
      GROUP BY i.sourceNodeId
    ) src ON src.nodeId = sp.nodeId
    SET sp.outDegree = src.cnt
  `;

  await prisma.$executeRaw`
    UPDATE student_profiles_test sp
    INNER JOIN (
      SELECT i.targetNodeId AS nodeId, COUNT(*) AS cnt
      FROM interactions_test i
      INNER JOIN graph_nodes_test n ON n.id = i.targetNodeId
      WHERE n.scenarioId = ${scenarioId} AND n.nodeType = 'Student'
      GROUP BY i.targetNodeId
    ) src ON src.nodeId = sp.nodeId
    SET sp.inDegree = src.cnt
  `;

  await prisma.$executeRaw`
    UPDATE student_profiles_test sp
    INNER JOIN graph_nodes_test n ON n.id = sp.nodeId
    SET sp.totalDegree = sp.inDegree + sp.outDegree
    WHERE n.scenarioId = ${scenarioId} AND n.nodeType = 'Student'
  `;

  const students = await prisma.studentProfile.findMany({
    where: { node: { scenarioId, nodeType: "Student" } },
    select: { totalDegree: true },
  });
  const high = students.filter((s) => Math.min(5, s.totalDegree / 10) >= 4)
    .length;
  const mid = students.filter(
    (s) =>
      Math.min(5, s.totalDegree / 10) > 2 &&
      Math.min(5, s.totalDegree / 10) < 4,
  ).length;
  const low = students.filter((s) => Math.min(5, s.totalDegree / 10) <= 2)
    .length;
  console.log("SHOW_CASE distribution:", { high, mid, low });

  await app.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
