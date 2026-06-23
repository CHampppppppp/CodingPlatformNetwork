/**
 * 清理 ONLINE_COURSE 场景数据（保留知识点、资源和场景记录）
 *
 * 删除顺序（按外键依赖从叶子到根）：
 *  1. StudentCognitiveDimensionScore  (-> StudentCognitiveProfile -> GraphNode)
 *  2. StudentCognitiveProfile         (-> GraphNode)
 *  3. StudentResourceRate             (-> GraphNode studentId)
 *  4. Interaction                     (-> InteractionSession, GraphNode)
 *  5. StudentWork                     (-> GraphNode, InteractionSession)
 *  6. StudentKnowledgeRelation        (-> GraphNode)
 *  7. SessionClassroomAnalysis        (-> InteractionSession)
 *  8. InteractionSession              (-> scenario)
 *  9. StudentProfile                  (-> GraphNode)
 * 10. TeacherProfile                  (-> GraphNode, School, Grade, Class)
 * 11. Class                           (-> Grade, TeacherProfile)
 * 12. Grade                           (-> School)
 * 13. School                          (-> scenario)
 * 14. GraphNode (Student + Teacher)   (-> scenario)  — 保留 Knowledge 类型节点
 */

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";

const SCENARIO_CODE = "ONLINE_COURSE";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  const scenario = await prisma.learningScenario.findFirst({
    where: { code: SCENARIO_CODE },
  });
  if (!scenario) {
    console.error(`Scenario "${SCENARIO_CODE}" not found.`);
    await app.close();
    return;
  }

  const sid = scenario.id;
  console.log(`Scenario: ${scenario.nameZh} (${scenario.code}), id=${sid}`);

  // 先统计各表数据量
  const studentNodeIds = await prisma.graphNode.findMany({
    where: { scenarioId: sid, nodeType: "Student" },
    select: { id: true },
  });
  const teacherNodeIds = await prisma.graphNode.findMany({
    where: { scenarioId: sid, nodeType: "Teacher" },
    select: { id: true },
  });
  const personNodeIds = [...studentNodeIds, ...teacherNodeIds].map((n) => n.id);
  const knowledgeNodeIds = await prisma.graphNode.findMany({
    where: { scenarioId: sid, nodeType: "Knowledge" },
    select: { id: true },
  });

  console.log(`\n当前数据量:`);
  console.log(`  GraphNode (Student): ${studentNodeIds.length}`);
  console.log(`  GraphNode (Teacher): ${teacherNodeIds.length}`);
  console.log(`  GraphNode (Knowledge): ${knowledgeNodeIds.length} [保留]`);

  const sessionIds = await prisma.interactionSession.findMany({
    where: { scenarioId: sid },
    select: { id: true },
  });
  console.log(`  InteractionSession: ${sessionIds.length}`);

  if (personNodeIds.length === 0 && sessionIds.length === 0) {
    console.log("\n没有需要清理的数据。");
    await app.close();
    return;
  }

  console.log("\n开始清理...");

  // 1. StudentCognitiveDimensionScore
  const cogProfileIds = await prisma.studentCognitiveProfile.findMany({
    where: { studentNodeId: { in: personNodeIds } },
    select: { id: true },
  });
  if (cogProfileIds.length > 0) {
    const { count } = await prisma.studentCognitiveDimensionScore.deleteMany({
      where: { profileId: { in: cogProfileIds.map((p) => p.id) } },
    });
    console.log(`  ✓ StudentCognitiveDimensionScore: ${count}`);
  } else {
    console.log(`  ✓ StudentCognitiveDimensionScore: 0`);
  }

  // 2. StudentCognitiveProfile
  {
    const { count } = await prisma.studentCognitiveProfile.deleteMany({
      where: { studentNodeId: { in: personNodeIds } },
    });
    console.log(`  ✓ StudentCognitiveProfile: ${count}`);
  }

  // 3. StudentResourceRate
  {
    const { count } = await prisma.studentResourceRate.deleteMany({
      where: { studentId: { in: personNodeIds } },
    });
    console.log(`  ✓ StudentResourceRate: ${count}`);
  }

  // 3.5. StudentWork
  {
    const { count } = await prisma.studentWork.deleteMany({
      where: { studentNodeId: { in: personNodeIds } },
    });
    console.log(`  ✓ StudentWork: ${count}`);
  }

  // 4. Interaction (通过 sessionId 或 sourceNodeId/targetNodeId)
  {
    const { count } = await prisma.interaction.deleteMany({
      where: {
        OR: [
          { sessionId: { in: sessionIds.map((s) => s.id) } },
          { sourceNodeId: { in: personNodeIds } },
          { targetNodeId: { in: personNodeIds } },
        ],
      },
    });
    console.log(`  ✓ Interaction: ${count}`);
  }

  // 5. StudentKnowledgeRelation
  {
    const { count } = await prisma.studentKnowledgeRelation.deleteMany({
      where: {
        OR: [
          { studentNodeId: { in: personNodeIds } },
          { knowledgeNodeId: { in: personNodeIds } },
        ],
      },
    });
    console.log(`  ✓ StudentKnowledgeRelation: ${count}`);
  }

  // 7. SessionClassroomAnalysis
  {
    const { count } = await prisma.sessionClassroomAnalysis.deleteMany({
      where: { sessionId: { in: sessionIds.map((s) => s.id) } },
    });
    console.log(`  ✓ SessionClassroomAnalysis: ${count}`);
  }

  // 8. InteractionSession
  {
    const { count } = await prisma.interactionSession.deleteMany({
      where: { scenarioId: sid },
    });
    console.log(`  ✓ InteractionSession: ${count}`);
  }

  // 9. StudentProfile
  {
    const { count } = await prisma.studentProfile.deleteMany({
      where: { nodeId: { in: studentNodeIds.map((n) => n.id) } },
    });
    console.log(`  ✓ StudentProfile: ${count}`);
  }

  // 10. TeacherProfile (need to null out Class.teacherId first)
  {
    // Clear Class.teacherId references to teacher nodes
    const teacherProfileIds = await prisma.teacherProfile.findMany({
      where: { nodeId: { in: teacherNodeIds.map((n) => n.id) } },
      select: { nodeId: true, classId: true },
    });
    for (const tp of teacherProfileIds) {
      if (tp.classId) {
        await prisma.class.update({
          where: { id: tp.classId },
          data: { teacherId: null },
        });
      }
    }

    const { count } = await prisma.teacherProfile.deleteMany({
      where: { nodeId: { in: teacherNodeIds.map((n) => n.id) } },
    });
    console.log(`  ✓ TeacherProfile: ${count}`);
  }

  // 11. Class
  {
    const schoolIds = await prisma.school.findMany({
      where: { scenarioId: sid },
      select: { id: true },
    });
    const gradeIds = await prisma.grade.findMany({
      where: { schoolId: { in: schoolIds.map((s) => s.id) } },
      select: { id: true },
    });
    const { count } = await prisma.class.deleteMany({
      where: { gradeId: { in: gradeIds.map((g) => g.id) } },
    });
    console.log(`  ✓ Class: ${count}`);
  }

  // 12. Grade
  {
    const schoolIds = await prisma.school.findMany({
      where: { scenarioId: sid },
      select: { id: true },
    });
    const { count } = await prisma.grade.deleteMany({
      where: { schoolId: { in: schoolIds.map((s) => s.id) } },
    });
    console.log(`  ✓ Grade: ${count}`);
  }

  // 13. School
  {
    const { count } = await prisma.school.deleteMany({
      where: { scenarioId: sid },
    });
    console.log(`  ✓ School: ${count}`);
  }

  // 14. GraphNode (Student + Teacher only, keep Knowledge)
  {
    const { count } = await prisma.graphNode.deleteMany({
      where: {
        scenarioId: sid,
        nodeType: { in: ["Student", "Teacher"] },
      },
    });
    console.log(`  ✓ GraphNode (Student+Teacher): ${count}`);
  }

  // 验证
  console.log("\n验证保留数据:");
  const remainingKnowledge = await prisma.graphNode.count({
    where: { scenarioId: sid, nodeType: "Knowledge" },
  });
  const remainingProfiles = await prisma.knowledgeProfile.count({
    where: { scenarioId: sid },
  });
  const remainingResources = await prisma.resource.count();
  console.log(`  Knowledge nodes: ${remainingKnowledge}`);
  console.log(`  Knowledge profiles: ${remainingProfiles}`);
  console.log(`  Resources (global): ${remainingResources}`);
  console.log(`  Scenario record: preserved`);

  console.log("\n清理完成！");
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
