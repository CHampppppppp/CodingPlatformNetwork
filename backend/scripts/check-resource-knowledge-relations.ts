import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";

const SCENARIO_CODE = process.argv[2] || "ONLINE_COURSE";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);

  const scenario = await prisma.learningScenario.findFirst({
    where: { code: SCENARIO_CODE },
  });
  if (!scenario) {
    console.log(`场景 ${SCENARIO_CODE} 不存在`);
    await app.close();
    return;
  }

  const knowledges = await prisma.graphNode.findMany({
    where: { scenarioId: scenario.id, nodeType: "Knowledge" },
    select: { id: true, displayName: true },
  });
  const knowledgeIdSet = new Set(knowledges.map((k) => k.id));

  const related = await prisma.resourceKnowledgeRelation.findMany({
    where: { knowledgeNodeId: { in: Array.from(knowledgeIdSet) } },
    include: { resource: { select: { id: true, title: true } } },
  });

  const relatedKnowledgeIds = new Set(related.map((r) => r.knowledgeNodeId));

  console.log(`场景: ${scenario.nameZh} (${scenario.code})`);
  console.log(`知识点总数: ${knowledges.length}`);
  console.log(`有关联资源的知识点: ${relatedKnowledgeIds.size}`);
  console.log(`无关联资源的知识点: ${knowledges.length - relatedKnowledgeIds.size}`);

  const withRelations = knowledges.filter((k) => relatedKnowledgeIds.has(k.id));
  console.log("\n有关联资源的知识点示例:");
  for (const k of withRelations.slice(0, 10)) {
    const rs = related
      .filter((r) => r.knowledgeNodeId === k.id)
      .map((r) => r.resource.title);
    console.log(`  ${k.displayName} -> ${rs.join(", ")}`);
  }

  const withoutRelations = knowledges.filter((k) => !relatedKnowledgeIds.has(k.id));
  console.log("\n无关联资源的知识点示例:");
  for (const k of withoutRelations.slice(0, 10)) {
    console.log(`  ${k.displayName}`);
  }

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
