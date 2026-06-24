/**
 * 清理 ONLINE_COURSE 场景下的知识点、资源关系以及 STUDY 交互。
 * 在重构 adapter 后重新导入前执行。
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

  const knowledgeNodes = await prisma.graphNode.findMany({
    where: { scenarioId: sid, nodeType: "Knowledge" },
    select: { id: true },
  });
  const knowledgeNodeIds = knowledgeNodes.map((n) => n.id);
  console.log(`Knowledge nodes to clean: ${knowledgeNodeIds.length}`);

  if (knowledgeNodeIds.length === 0) {
    console.log("没有需要清理的知识点。");
    await app.close();
    return;
  }

  // 1. 删除由 STUDY 关系衍生的 Interaction
  {
    const relations = await prisma.studentKnowledgeRelation.findMany({
      where: {
        OR: [
          { studentNodeId: { in: knowledgeNodeIds } },
          { knowledgeNodeId: { in: knowledgeNodeIds } },
        ],
      },
      select: { id: true },
    });
    const relationIds = relations.map((r) => r.id);
    if (relationIds.length > 0) {
      const { count } = await prisma.interaction.deleteMany({
        where: {
          actionType: "STUDY",
          relationSourceId: { in: relationIds },
        },
      });
      console.log(`  ✓ Interaction (STUDY derived): ${count}`);
    }
  }

  // 2. 删除目标为 Knowledge 的 Interaction
  {
    const { count } = await prisma.interaction.deleteMany({
      where: { targetNodeId: { in: knowledgeNodeIds } },
    });
    console.log(`  ✓ Interaction (target Knowledge): ${count}`);
  }

  // 3. 删除资源-知识点关系
  {
    const { count } = await prisma.resourceKnowledgeRelation.deleteMany({
      where: { knowledgeNodeId: { in: knowledgeNodeIds } },
    });
    console.log(`  ✓ ResourceKnowledgeRelation: ${count}`);
  }

  // 4. 删除学生-知识点关系
  {
    const { count } = await prisma.studentKnowledgeRelation.deleteMany({
      where: {
        OR: [
          { studentNodeId: { in: knowledgeNodeIds } },
          { knowledgeNodeId: { in: knowledgeNodeIds } },
        ],
      },
    });
    console.log(`  ✓ StudentKnowledgeRelation: ${count}`);
  }

  // 5. 删除 KnowledgeProfile
  {
    const { count } = await prisma.knowledgeProfile.deleteMany({
      where: { scenarioId: sid },
    });
    console.log(`  ✓ KnowledgeProfile: ${count}`);
  }

  // 6. 删除 Knowledge GraphNode
  {
    const { count } = await prisma.graphNode.deleteMany({
      where: { scenarioId: sid, nodeType: "Knowledge" },
    });
    console.log(`  ✓ GraphNode (Knowledge): ${count}`);
  }

  console.log("\n清理完成！");
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
