import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";
import { Prisma } from "@prisma/client";

function classifyInteraction(interaction: any) {
  const rawAction = (interaction.actionType || "");
  const normalized = rawAction.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  const hasToken = (keywords: string[]) => tokens.some((t) => keywords.includes(t));

  const srcStudent = interaction.sourceNode?.nodeType === "Student";
  const srcTeacher = interaction.sourceNode?.nodeType === "Teacher";
  const tgtStudent = interaction.targetNode?.nodeType === "Student";
  const tgtTeacher = interaction.targetNode?.nodeType === "Teacher";

  const isQuestion = hasToken(["question", "ask", "quiz", "probe"]);
  const isFeedback = hasToken(["feedback", "comment", "reply"]) ||
    (interaction.interactionType === "PLATFORM" && srcTeacher && tgtStudent && tokens.length === 0);
  const isCollaboration = hasToken(["collaborate", "peer", "group", "discuss"]) ||
    (interaction.interactionType === "PHYSICAL" && srcStudent && tgtStudent);
  const isTool = hasToken(["tool", "resource", "material", "device"]);
  const isConstructive = hasToken([
    "explain", "reason", "argue", "construct", "elaborate",
    "analyze", "discuss", "reflect", "justify", "evaluate",
  ]);

  let questionType: "closed" | "application" | "open" | null = null;
  if (isQuestion) {
    const yesNoPair = hasToken(["yes"]) && hasToken(["no"]);
    if (hasToken(["closed", "close"]) || yesNoPair) questionType = "closed";
    else if (hasToken(["open", "inquiry", "explore"])) questionType = "open";
    else questionType = "application";
  }

  let feedbackType: "accept" | "praise" | "extend" | "correct" | null = null;
  if (isFeedback) {
    if (hasToken(["accept", "adopt"])) feedbackType = "accept";
    else if (hasToken(["praise", "encourage"])) feedbackType = "praise";
    else if (hasToken(["extend", "expand"])) feedbackType = "extend";
    else if (hasToken(["correct", "revise"])) feedbackType = "correct";
    else feedbackType = "praise";
  }

  return { isQuestion, questionType, isFeedback, feedbackType, isCollaboration, isTool, isConstructive };
}

function level3(value: number, high: number, mid: number): string {
  if (value >= high) return "高";
  if (value >= mid) return "中";
  return "低";
}

function level4(value: number, excellent: number, good: number, medium: number): string {
  if (value >= excellent) return "优秀";
  if (value >= good) return "良好";
  if (value >= medium) return "中等";
  return "待提升";
}

function groupBy<T, K extends string | number>(items: T[], keyFn: (item: T) => K): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

function pickLatestSession(sessions: any[]): any | undefined {
  if (sessions.length === 0) return undefined;
  return sessions.reduce((latest, session) =>
    new Date(session.occurredAt).getTime() > new Date(latest.occurredAt).getTime()
      ? session
      : latest,
  );
}

async function main() {
  const execute = process.argv.slice(2).includes("--execute");

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });

  try {
    process.stdout.write(`=== Mock Classroom Analysis Generator ===\n`);
    process.stdout.write(
      `Mode: ${execute ? "EXECUTE (write to DB)" : "DRY-RUN (no DB writes)"}\n\n`,
    );

    const prisma = app.get(PrismaService);

    const scenarios = await prisma.learningScenario.findMany();

    if (scenarios.length === 0) {
      process.stdout.write("No scenarios found.\n");
      return;
    }

    let totalClasses = 0;
    let sessionsCreated = 0;
    let analysesCreated = 0;

    for (const scenario of scenarios) {
      process.stdout.write(
        `Scenario: ${scenario.code} (${scenario.nameZh})\n`,
      );

      const classes = await prisma.class.findMany({
        where: { grade: { school: { scenarioId: scenario.id } } },
        include: { grade: { include: { school: true } } },
      });

      if (classes.length === 0) {
        process.stdout.write("  No classes found.\n");
        continue;
      }

      const classIds = classes.map((cls) => cls.id);

      const [sessions, students, teachers, knowledges] = await Promise.all([
        prisma.interactionSession.findMany({
          where: { classId: { in: classIds } },
          orderBy: { occurredAt: "desc" },
        }),
        prisma.graphNode.findMany({
          where: { classId: { in: classIds }, nodeType: "Student" },
        }),
        prisma.graphNode.findMany({
          where: { classId: { in: classIds }, nodeType: "Teacher" },
        }),
        prisma.graphNode.findMany({
          where: { scenarioId: scenario.id, nodeType: "Knowledge" },
        }),
      ]);

      const sessionsByClassId = groupBy(sessions, (s) => s.classId);
      const studentsByClassId = groupBy(students, (s) => s.classId ?? "");
      const teachersByClassId = groupBy(teachers, (t) => t.classId ?? "");
      const knowledgeIds = new Set(knowledges.map((k) => k.id));

      const classSessionMap = new Map<string, any>();
      for (const cls of classes) {
        const classSessions = sessionsByClassId[cls.id] || [];
        let session = pickLatestSession(classSessions);

        if (!session) {
          if (!execute) {
            continue;
          }

          session = await prisma.interactionSession.create({
            data: {
              scenarioId: scenario.id,
              schoolId: cls.grade.school.id,
              gradeId: cls.grade.id,
              classId: cls.id,
              sessionName: `${cls.className} 课堂视频分析会话`,
              occurredAt: new Date(),
            },
          });
          sessionsCreated += 1;
          process.stdout.write(
            `    Created session: ${session.sessionName} (${session.id})\n`,
          );
        }

        classSessionMap.set(cls.id, session);
      }

      const sessionIds = Array.from(classSessionMap.values()).map((s) => s.id);
      const interactions = sessionIds.length > 0
        ? await prisma.interaction.findMany({
            where: { sessionId: { in: sessionIds } },
            include: { sourceNode: true, targetNode: true },
          })
        : [];

      const interactionsBySessionId = groupBy(interactions, (i) => i.sessionId);

      for (const cls of classes) {
        totalClasses += 1;
        process.stdout.write(`  Class: ${cls.className}\n`);

        const session = classSessionMap.get(cls.id);
        if (!session) {
          process.stdout.write(
            `    [DRY-RUN] 将创建会话: ${cls.className} 课堂视频分析会话\n`,
          );
          continue;
        }

        const classStudents = studentsByClassId[cls.id] || [];
        const classTeachers = teachersByClassId[cls.id] || [];
        const classInteractions = interactionsBySessionId[session.id] || [];

        const stats = {
          totalKnowledge: knowledgeIds.size,
          activatedKnowledge: new Set<string>(),
          studentUtterance: 0,
          teacherStudent: 0,
          peerCollab: 0,
          constructive: 0,
          closedQuestions: 0,
          appQuestions: 0,
          openQuestions: 0,
          acceptFeedback: 0,
          praiseFeedback: 0,
          extendFeedback: 0,
          correctFeedback: 0,
          toolTypes: new Set<string>(),
        };

        for (const i of classInteractions) {
          const clsResult = classifyInteraction(i);
          const srcStudent = i.sourceNode?.nodeType === "Student";
          const srcTeacher = i.sourceNode?.nodeType === "Teacher";
          const tgtStudent = i.targetNode?.nodeType === "Student";
          const tgtTeacher = i.targetNode?.nodeType === "Teacher";

          if (srcStudent) stats.studentUtterance += 1;
          if (srcStudent && clsResult.isConstructive) stats.constructive += 1;
          if ((srcTeacher && tgtStudent) || (srcStudent && tgtTeacher)) {
            stats.teacherStudent += 1;
          }
          if (srcStudent && tgtStudent) stats.peerCollab += 1;
          if (knowledgeIds.has(i.targetNodeId)) {
            stats.activatedKnowledge.add(i.targetNodeId);
          }

          if (clsResult.isQuestion) {
            if (clsResult.questionType === "closed") stats.closedQuestions += 1;
            else if (clsResult.questionType === "application") stats.appQuestions += 1;
            else if (clsResult.questionType === "open") stats.openQuestions += 1;
          } else if (clsResult.isFeedback) {
            if (clsResult.feedbackType === "accept") stats.acceptFeedback += 1;
            else if (clsResult.feedbackType === "praise") stats.praiseFeedback += 1;
            else if (clsResult.feedbackType === "extend") stats.extendFeedback += 1;
            else if (clsResult.feedbackType === "correct") stats.correctFeedback += 1;
          }

          if (clsResult.isTool && i.actionType) stats.toolTypes.add(i.actionType);
        }

        const totalQuestions =
          stats.closedQuestions + stats.appQuestions + stats.openQuestions;
        const totalFeedback =
          stats.acceptFeedback +
          stats.praiseFeedback +
          stats.extendFeedback +
          stats.correctFeedback;
        const studentCount = Math.max(classStudents.length, 1);
        const activationRate =
          stats.totalKnowledge > 0
            ? Number(
                ((stats.activatedKnowledge.size / stats.totalKnowledge) * 100).toFixed(2),
              )
            : 0;

        const behavioralLevel = level3(classInteractions.length / studentCount, 8, 4);
        const cognitiveLevel = level3(stats.constructive / studentCount, 3, 1);

        const hasBurnout = behavioralLevel === "低" && cognitiveLevel === "低" && stats.studentUtterance === 0;
        const hasFrustration = behavioralLevel === "低" && stats.peerCollab === 0 && stats.constructive === 0;

        const analysisData = {
          sessionId: session.id,
          knowledgeActivationRate: new Prisma.Decimal(activationRate),
          activatedKnowledgeCount: stats.activatedKnowledge.size,
          totalKnowledgeCount: stats.totalKnowledge,
          behavioralEngagementLevel: behavioralLevel,
          teacherStudentInteractionCount: stats.teacherStudent,
          peerCollaborationCount: stats.peerCollab,
          cognitiveEngagementLevel: cognitiveLevel,
          constructiveUtteranceCount: stats.constructive,
          hasBurnout,
          hasFrustration,
          conceptDevelopmentLevel: level4(activationRate, 70, 50, 30),
          feedbackQualityLevel: level4(totalFeedback / studentCount, 2, 1, 0.5),
          academicExpectationLevel: level4(
            stats.teacherStudent / Math.max(classTeachers.length, 1),
            30,
            20,
            10,
          ),
          closedQuestionCount: stats.closedQuestions,
          applicationQuestionCount: stats.appQuestions,
          openQuestionCount: stats.openQuestions,
          acceptFeedbackCount: stats.acceptFeedback,
          praiseFeedbackCount: stats.praiseFeedback,
          extendFeedbackCount: stats.extendFeedback,
          correctFeedbackCount: stats.correctFeedback,
          studentUtteranceCount: stats.studentUtterance,
          teacherFluencyLevel: level4(stats.teacherStudent, 50, 20, 5),
          toolVarietyCount: Math.min(Math.max(stats.toolTypes.size, 1), 10),
          selfAwarenessLevel: level4(
            stats.teacherStudent / Math.max(studentCount, 1),
            3,
            2,
            1,
          ),
          selfManagementLevel: level4(
            totalFeedback / Math.max(classTeachers.length, 1),
            10,
            5,
            2,
          ),
          collectiveManagementLevel: level4(
            (stats.teacherStudent + stats.peerCollab) / studentCount,
            5,
            2,
            0.5,
          ),
          ruleClarityLevel:
            behavioralLevel === "高"
              ? "优秀"
              : behavioralLevel === "中"
                ? "良好"
                : "中等",
          positiveReinforcementLevel: level4(
            stats.praiseFeedback / Math.max(studentCount, 1),
            1,
            0.5,
            0.2,
          ),
          negativeReductionLevel: hasFrustration
            ? "待提升"
            : behavioralLevel === "低"
              ? "中等"
              : "优秀",
        };

        if (!execute) {
          process.stdout.write(
            `    [DRY-RUN] 将创建课堂分析: ${cls.className} (session=${session.id}, interactions=${classInteractions.length})\n`,
          );
          continue;
        }

        await prisma.sessionClassroomAnalysis.upsert({
          where: { sessionId: session.id },
          create: analysisData,
          update: analysisData,
        });

        analysesCreated += 1;
        process.stdout.write(
          `    Upserted classroom analysis for session ${session.id}\n`,
        );
      }
    }

    process.stdout.write(`\nSummary:\n`);
    process.stdout.write(`  Total classes processed: ${totalClasses}\n`);
    if (execute) {
      process.stdout.write(`  Sessions created: ${sessionsCreated}\n`);
      process.stdout.write(`  Analyses upserted: ${analysesCreated}\n`);
    } else {
      process.stdout.write(
        `  Add --execute to create missing sessions and upsert analyses.\n`,
      );
    }
    process.stdout.write(`Done!\n`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  process.stderr.write(e.message + "\n" + e.stack + "\n");
  process.exit(1);
});
