import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";

/**
 * 使用原生 SQL 批量重算学生节点的入度/出度/总度数。
 * 直接通过 INSERT ... ON DUPLICATE KEY UPDATE 更新 student_profiles_test。
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  // 1. 重置
  await prisma.$executeRaw`
    UPDATE student_profiles_test
    SET inDegree = 0, outDegree = 0, totalDegree = 0
  `;
  console.log("Reset all student degrees to 0.");

  // 2. 先确保所有 Student 节点在 student_profiles_test 中都有记录
  await prisma.$executeRaw`
    INSERT INTO student_profiles_test (nodeId, inDegree, outDegree, totalDegree)
    SELECT id, 0, 0, 0
    FROM graph_nodes_test
    WHERE nodeType = 'Student'
      AND id NOT IN (SELECT nodeId FROM student_profiles_test)
  `;
  console.log("Ensured all student nodes have profile records.");

  // 3. 更新 outDegree（source 是学生）
  await prisma.$executeRaw`
    UPDATE student_profiles_test sp
    INNER JOIN (
      SELECT i.sourceNodeId AS nodeId, COUNT(*) AS cnt
      FROM interactions_test i
      INNER JOIN graph_nodes_test n ON n.id = i.sourceNodeId
      WHERE n.nodeType = 'Student'
      GROUP BY i.sourceNodeId
    ) src ON src.nodeId = sp.nodeId
    SET sp.outDegree = src.cnt
  `;
  console.log("Updated outDegrees.");

  // 4. 更新 inDegree（target 是学生）
  await prisma.$executeRaw`
    UPDATE student_profiles_test sp
    INNER JOIN (
      SELECT i.targetNodeId AS nodeId, COUNT(*) AS cnt
      FROM interactions_test i
      INNER JOIN graph_nodes_test n ON n.id = i.targetNodeId
      WHERE n.nodeType = 'Student'
      GROUP BY i.targetNodeId
    ) src ON src.nodeId = sp.nodeId
    SET sp.inDegree = src.cnt
  `;
  console.log("Updated inDegrees.");

  // 5. 计算 totalDegree
  await prisma.$executeRaw`
    UPDATE student_profiles_test
    SET totalDegree = inDegree + outDegree
  `;
  console.log("Updated totalDegrees.");

  // 6. 统计
  const stats = await prisma.$queryRaw`
    SELECT
      COUNT(*) AS totalStudents,
      AVG(totalDegree) AS avgDegree,
      MAX(totalDegree) AS maxDegree,
      MIN(totalDegree) AS minDegree
    FROM student_profiles_test
  `;
  console.log("Stats:", stats);

  await app.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
