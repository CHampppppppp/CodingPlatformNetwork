import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);

  const scenario = await prisma.learningScenario.findFirst({
    where: { code: "ONLINE_COURSE" },
  });
  if (!scenario) {
    console.log("scenario not found");
    await app.close();
    return;
  }

  const sid = scenario.id;
  const students = await prisma.graphNode.count({
    where: { scenarioId: sid, nodeType: "Student" },
  });
  const teachers = await prisma.graphNode.count({
    where: { scenarioId: sid, nodeType: "Teacher" },
  });
  const knowledges = await prisma.graphNode.count({
    where: { scenarioId: sid, nodeType: "Knowledge" },
  });
  const interactions = await prisma.interaction.count({
    where: { session: { scenarioId: sid } },
  });
  const studyInteractions = await prisma.interaction.count({
    where: { session: { scenarioId: sid }, actionType: "STUDY" },
  });
  const studentKnowledgeRelations = await prisma.studentKnowledgeRelation.count({
    where: { studentNode: { scenarioId: sid } },
  });
  const resources = await prisma.resource.count();
  const resourceKnowledgeRelations = await prisma.resourceKnowledgeRelation.count();

  console.log("=== ONLINE_COURSE 验证 ===");
  console.log(`学生节点: ${students}`);
  console.log(`教师节点: ${teachers}`);
  console.log(`知识点节点: ${knowledges}`);
  console.log(`交互总数: ${interactions}`);
  console.log(`STUDY 交互: ${studyInteractions}`);
  console.log(`学生-知识点关系: ${studentKnowledgeRelations}`);
  console.log(`资源总数: ${resources}`);
  console.log(`资源-知识点关系: ${resourceKnowledgeRelations}`);

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
