#!/usr/bin/env ts-node
import * as dotenv from "dotenv";
import * as path from "path";
import { OnlineCourseLongFormatAdapter } from "../src/modules/ingestion/adapters/online-course-long-format.adapter";
import { IngestionService } from "../src/modules/ingestion/services/ingestion.service";
import { PrismaService } from "../src/shared/utils/prisma.service";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DATAS_DIR = path.resolve(__dirname, "../datas");
const LONG_FORMAT_FILENAME = process.env.LONG_FORMAT_CSV ?? "ONLINE_COURSE_long_format_v2.csv";
const CONCURRENCY = 5;

async function main() {
  console.log("=== ONLINE_COURSE Long-Format 数据导入 ===\n");

  const prisma = new PrismaService();
  await prisma.$connect();

  try {
    const adapter = new OnlineCourseLongFormatAdapter(DATAS_DIR, LONG_FORMAT_FILENAME);
    const data = await adapter.parse();

    console.log("源数据:", data.sourceStats);
    console.log(
      `标准化：schools=${data.schools.length} classes=${data.classes.length} users=${data.users.length} knowledges=${data.knowledges.length} sessions=${data.sessions.length} relations=${data.studentKnowledgeRelations.length} interactions=${data.interactions.length}\n`,
    );

    const ingestionService = new IngestionService(prisma);
    const result = await ingestionService.importPlatformData(data, {
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