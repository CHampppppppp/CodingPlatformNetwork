#!/usr/bin/env ts-node
import * as dotenv from "dotenv";
import * as path from "path";
import { OnlineCourseAdapter } from "../src/modules/ingestion/adapters/online-course.adapter";
import { IngestionService } from "../src/modules/ingestion/services/ingestion.service";
import { PrismaService } from "../src/shared/utils/prisma.service";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DATAS_DIR = path.resolve(__dirname, "../datas");
const CONCURRENCY = 5;

async function main() {
  console.log("=== ONLINE_COURSE 数据导入 ===\n");

  const prisma = new PrismaService();
  await prisma.$connect();

  try {
    const adapter = new OnlineCourseAdapter(DATAS_DIR);
    const normalizedData = await adapter.parse();

    console.log("原始数据：", normalizedData.sourceStats);
    console.log(
      `标准化：schools=${normalizedData.schools.length} classes=${normalizedData.classes.length} users=${normalizedData.users.length} knowledges=${normalizedData.knowledges.length} sessions=${normalizedData.sessions.length} relations=${normalizedData.studentKnowledgeRelations.length} interactions=${normalizedData.interactions.length}\n`,
    );

    const ingestionService = new IngestionService(prisma);
    const result = await ingestionService.importPlatformData(normalizedData, {
      concurrency: CONCURRENCY,
      skipWhenScenarioHasNodes: true,
    });

    if (result.skipped) {
      console.log(
        `已有 ${result.scenarioCode} 节点数据，跳过导入。需要重导时先按项目规则确认清理策略。`,
      );
      return;
    }

    console.log("=== 完成 ===");
    console.log(
      `学校=${result.schoolCount} 年级=${result.gradeCount} 班级=${result.classCount}`,
    );
    console.log(
      `学生=${result.studentCount} 教师=${result.teacherCount} 知识点=${result.knowledgeCount}`,
    );
    console.log(
      `会话=${result.sessionCount} 关联=${result.relationCount} STUDY=${result.studyInteractionCount} 平台交互=${result.platformInteractionCount} 重复=${result.duplicateCount}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("导入失败:", error);
  process.exit(1);
});
