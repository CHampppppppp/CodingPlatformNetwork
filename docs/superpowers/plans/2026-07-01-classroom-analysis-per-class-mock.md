# 课堂视频分析按班级 mock 数据实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为除 SHOW_CASE 外的所有场景班级生成基于实际数据的 `SessionClassroomAnalysis` mock 数据，并让前端按班级查询展示。

**架构：** 后端新增一个幂等的 Node/TypeScript 脚本负责生成/更新分析数据；`classroom-analysis` 服务增强按 `classId` 精确过滤；前端把 `classInfo` 解析为组织 ID 后传入 API，并放开课堂视频分析标签的展示场景限制。

**技术栈：** NestJS + Prisma + TypeScript + React + Vite

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `backend/scripts/mock-classroom-analysis.ts` | 新增：遍历班级、统计指标、生成/更新 `SessionClassroomAnalysis` |
| `backend/src/modules/classroom-analysis/classroom-analysis.service.ts` | 修改：支持 `classId` 精确过滤，未传时保持原逻辑 |
| `frontend/services/apiService.ts` | 修改：`fetchClassroomAnalysis` 接收名称并解析为 ID |
| `frontend/services/dataService.ts` | 修改：`fetchClassroomAnalysis` 透传 `classInfo` |
| `frontend/components/AnalysisPanel.tsx` | 修改：放开标签展示限制，按班级加载/重置 |

---

## Task 1: 后端 classroom-analysis 服务支持按班级过滤

**Files:**
- Modify: `backend/src/modules/classroom-analysis/classroom-analysis.service.ts`
- Test: `curl` 或浏览器请求验证

- [ ] **Step 1: 修改 `getClassroomAnalysisByScenario` 参数与查询逻辑**

在 `getClassroomAnalysisByScenario` 中：
1. 如果 `params.classId` 存在，直接按 `classId` 查询 `InteractionSession`。
2. 否则保持原有按 `scenarioId/schoolId/gradeId` 的查询逻辑。
3. 查询到 session 后，返回该 session 的 `SessionClassroomAnalysis`（由于每个班级只有一条，直接取第一条）。

```typescript
async getClassroomAnalysisByScenario(params: {
  scenarioCode?: string;
  schoolId?: string;
  gradeId?: string;
  classId?: string;
}) {
  const where: any = {};

  if (params.scenarioCode) {
    const scenario = await this.prisma.learningScenario.findUnique({
      where: { code: params.scenarioCode },
      select: { id: true },
    });
    if (scenario) {
      where.scenarioId = scenario.id;
    }
  }

  if (params.schoolId) where.schoolId = params.schoolId;
  if (params.gradeId) where.gradeId = params.gradeId;
  if (params.classId) where.classId = params.classId;

  const sessions = await this.prisma.interactionSession.findMany({
    where,
    select: { id: true },
  });

  if (sessions.length === 0) {
    return { data: null, meta: null, error: "NOT_FOUND" };
  }

  const analyses = await this.prisma.sessionClassroomAnalysis.findMany({
    where: {
      sessionId: { in: sessions.map((s) => s.id) },
    },
  });

  if (analyses.length === 0) {
    return { data: null, meta: null, error: "NOT_FOUND" };
  }

  return { data: analyses[0], meta: null, error: null };
}
```

- [ ] **Step 2: 验证后端类型与编译**

Run:
```bash
cd backend && npm run build
```

Expected: 构建成功，无类型错误。

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/classroom-analysis/classroom-analysis.service.ts
git commit -m "feat(classroom-analysis): support class_id filter in service"
```

---

## Task 2: 新增 classroom-analysis mock 数据脚本

**Files:**
- Create: `backend/scripts/mock-classroom-analysis.ts`
- Test: `npx ts-node scripts/mock-classroom-analysis.ts` (dry-run)

- [ ] **Step 1: 创建脚本入口与参数解析**

```typescript
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";
import { Prisma } from "@prisma/client";

function parseArgs(): { execute: boolean } {
  const args = process.argv.slice(2);
  return { execute: args.includes("--execute") };
}

async function main() {
  const { execute } = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);

  try {
    console.log(`Mode: ${execute ? "EXECUTE" : "DRY-RUN"}`);
    // implementation in next steps
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: 实现班级遍历与指标统计**

在 `main()` 中实现：
1. 查询所有场景，排除 `SHOW_CASE`。
2. 对每个场景，查询 `Class` 并包含 `grade` 和 `school`。
3. 对每个班级，查找/创建 `InteractionSession`。
4. 查询班级下的 `GraphNode`（学生、教师）和该场景下的知识点节点。
5. 查询班级的 `Interaction` 并分类统计。

```typescript
const scenarios = await prisma.learningScenario.findMany({
  where: { code: { not: "SHOW_CASE" } },
  orderBy: { sortOrder: "asc" },
});

for (const scenario of scenarios) {
  const classes = await prisma.class.findMany({
    where: { grade: { school: { scenarioId: scenario.id } } },
    include: { grade: { include: { school: true } } },
  });

  for (const cls of classes) {
    const grade = cls.grade;
    const school = grade.school;

    let session = await prisma.interactionSession.findFirst({
      where: { classId: cls.id },
      orderBy: { occurredAt: "desc" },
    });

    if (!session) {
      if (!execute) {
        console.log(`[DRY-RUN] 将创建会话: ${school.name} / ${grade.gradeName} / ${cls.className}`);
        continue;
      }
      session = await prisma.interactionSession.create({
        data: {
          scenarioId: scenario.id,
          schoolId: school.id,
          gradeId: grade.id,
          classId: cls.id,
          sessionName: `${cls.className} 课堂视频分析会话`,
          occurredAt: new Date(),
        },
      });
      console.log(`  新建会话: ${session.id}`);
    }

    // 统计节点
    const [students, teachers, knowledges] = await Promise.all([
      prisma.graphNode.findMany({
        where: { classId: cls.id, nodeType: "Student" },
        select: { id: true },
      }),
      prisma.graphNode.findMany({
        where: { classId: cls.id, nodeType: "Teacher" },
        select: { id: true },
      }),
      prisma.graphNode.findMany({
        where: { scenarioId: scenario.id, nodeType: "Knowledge" },
        select: { id: true },
      }),
    ]);

    const studentIds = new Set(students.map((n) => n.id));
    const teacherIds = new Set(teachers.map((n) => n.id));
    const knowledgeIds = new Set(knowledges.map((n) => n.id));

    const interactions = await prisma.interaction.findMany({
      where: { sessionId: session.id },
      include: { sourceNode: true, targetNode: true },
    });

    // classify interactions...
  }
}
```

- [ ] **Step 3: 实现交互分类与字段计算函数**

在脚本中添加辅助函数：

```typescript
function classifyInteraction(interaction: any) {
  const action = (interaction.actionType || "").toLowerCase();
  const srcStudent = interaction.sourceNode?.nodeType === "Student";
  const srcTeacher = interaction.sourceNode?.nodeType === "Teacher";
  const tgtStudent = interaction.targetNode?.nodeType === "Student";
  const tgtTeacher = interaction.targetNode?.nodeType === "Teacher";

  const isQuestion = /question|ask|quiz|probe/.test(action) ||
    (interaction.interactionType === "PLATFORM" && srcTeacher && tgtStudent && !action);
  const isFeedback = /feedback|comment|reply/.test(action) ||
    (interaction.interactionType === "PLATFORM" && srcTeacher && tgtStudent && !action);
  const isCollaboration = /collaborate|peer|group|discuss/.test(action) ||
    (interaction.interactionType === "PHYSICAL" && srcStudent && tgtStudent);
  const isTool = /tool|resource|material|device/.test(action);

  let questionType: "closed" | "application" | "open" | null = null;
  if (isQuestion) {
    if (/closed|close|yes_no/.test(action)) questionType = "closed";
    else if (/open|inquiry|explore/.test(action)) questionType = "open";
    else questionType = "application";
  }

  let feedbackType: "accept" | "praise" | "extend" | "correct" | null = null;
  if (isFeedback) {
    if (/accept|adopt/.test(action)) feedbackType = "accept";
    else if (/praise|encourage/.test(action)) feedbackType = "praise";
    else if (/extend|expand/.test(action)) feedbackType = "extend";
    else if (/correct|revise/.test(action)) feedbackType = "correct";
    else feedbackType = "praise"; // default teacher→student feedback
  }

  return { isQuestion, questionType, isFeedback, feedbackType, isCollaboration, isTool };
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
```

- [ ] **Step 4: 实现完整分析记录生成与写入**

在脚本中，基于分类结果计算字段，然后 upsert：

```typescript
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

for (const i of interactions) {
  const cls = classifyInteraction(i);
  const srcStudent = i.sourceNode?.nodeType === "Student";

  if (srcStudent) stats.studentUtterance += 1;

  const srcTeacher = i.sourceNode?.nodeType === "Teacher";
  const tgtStudent = i.targetNode?.nodeType === "Student";
  const tgtTeacher = i.targetNode?.nodeType === "Teacher";

  if ((srcTeacher && tgtStudent) || (srcStudent && tgtTeacher)) {
    stats.teacherStudent += 1;
  }

  if (srcStudent && tgtStudent) stats.peerCollab += 1;

  if (knowledgeIds.has(i.targetNodeId)) stats.activatedKnowledge.add(i.targetNodeId);

  if (cls.isQuestion) {
    if (cls.questionType === "closed") stats.closedQuestions += 1;
    else if (cls.questionType === "application") stats.appQuestions += 1;
    else if (cls.questionType === "open") stats.openQuestions += 1;
  }

  if (cls.isFeedback) {
    if (cls.feedbackType === "accept") stats.acceptFeedback += 1;
    else if (cls.feedbackType === "praise") stats.praiseFeedback += 1;
    else if (cls.feedbackType === "extend") stats.extendFeedback += 1;
    else if (cls.feedbackType === "correct") stats.correctFeedback += 1;
  }

  if (cls.isTool && i.actionType) stats.toolTypes.add(i.actionType);
}

stats.constructive = Math.round(stats.studentUtterance * 0.35);

const totalQuestions = stats.closedQuestions + stats.appQuestions + stats.openQuestions;
const totalFeedback = stats.acceptFeedback + stats.praiseFeedback + stats.extendFeedback + stats.correctFeedback;

const studentCount = Math.max(students.length, 1);
const activationRate = stats.totalKnowledge > 0
  ? Number(((stats.activatedKnowledge.size / stats.totalKnowledge) * 100).toFixed(2))
  : 0;

const behavioralLevel = level3(interactions.length / studentCount, 8, 4);
const cognitiveLevel = level3(stats.constructive / studentCount, 3, 1);

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
  hasBurnout: false,
  hasFrustration: false,
  conceptDevelopmentLevel: level4(activationRate, 70, 50, 30),
  feedbackQualityLevel: level4(totalFeedback / studentCount, 2, 1, 0.5),
  academicExpectationLevel: level4(stats.teacherStudent / Math.max(teachers.length, 1), 30, 20, 10),
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
  selfAwarenessLevel: level4(stats.teacherStudent / Math.max(teachers.length, 1), 30, 20, 10),
  selfManagementLevel: level4(totalFeedback / studentCount, 2, 1, 0.5),
  collectiveManagementLevel: level4((stats.teacherStudent + stats.peerCollab) / studentCount, 5, 2, 0.5),
  ruleClarityLevel: behavioralLevel === "高" ? "优秀" : behavioralLevel === "中" ? "良好" : "中等",
  positiveReinforcementLevel: level4(totalFeedback / studentCount, 2, 1, 0.5),
  negativeReductionLevel: "良好",
};

if (execute) {
  await prisma.sessionClassroomAnalysis.upsert({
    where: { sessionId: session.id },
    create: analysisData,
    update: analysisData,
  });
  console.log(`  ✓ ${scenario.code} / ${school.name} / ${grade.gradeName} / ${cls.className}`);
} else {
  console.log(`[DRY-RUN] ${scenario.code} / ${school.name} / ${grade.gradeName} / ${cls.className}: ` +
    `students=${students.length}, interactions=${interactions.length}, activation=${activationRate}%`);
}
```

- [ ] **Step 5: 运行 dry-run 验证脚本**

Run:
```bash
cd backend && npx ts-node scripts/mock-classroom-analysis.ts
```

Expected: 打印每个班级的预览信息，不写入数据库。

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/mock-classroom-analysis.ts
git commit -m "feat(scripts): add mock-classroom-analysis generator"
```

---

## Task 3: 前端 API 层按班级传参

**Files:**
- Modify: `frontend/services/apiService.ts`
- Test: TypeScript build

- [ ] **Step 1: 修改 `fetchClassroomAnalysis` 签名与 ID 解析**

```typescript
export const fetchClassroomAnalysis = async (params: {
  scenarioCode?: string;
  school?: string;
  grade?: string;
  classId?: string;
}): Promise<any> => {
  try {
    const queryParams = new URLSearchParams();
    if (params.scenarioCode) queryParams.append("scenario_code", params.scenarioCode);

    const schoolId = params.school ? schoolNameToId.get(params.school) : undefined;
    const rawGrade = params.grade ? (gradeDisplayToRaw.get(params.grade) || params.grade) : undefined;
    const rawClassId = params.classId ? (classDisplayToRaw.get(params.classId) || params.classId) : undefined;
    const gradeId = params.school && rawGrade
      ? gradeKeyToId.get(`${params.school}::${rawGrade}`)
      : undefined;
    const classId = params.school && rawGrade && rawClassId
      ? classKeyToId.get(`${params.school}::${rawGrade}::${rawClassId}`)
      : undefined;

    if (schoolId) queryParams.append("school_id", schoolId);
    if (gradeId) queryParams.append("grade_id", gradeId);
    if (classId) queryParams.append("class_id", classId);

    const url = `${API_BASE_URL}/classroom-analysis${
      queryParams.toString() ? `?${queryParams.toString()}` : ""
    }`;
    console.log("请求课堂视频分析数据:", url);

    const response = await fetchWithRetry(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`);
    }

    const payload = await response.json();
    if (payload.error) {
      console.log("课堂视频分析数据未找到:", payload.error);
      return null;
    }

    const data = payload?.data ?? null;
    console.log("获取课堂视频分析数据成功:", data ? "有数据" : "无数据");
    return data;
  } catch (error) {
    console.error("获取课堂视频分析数据失败:", error);
    throw error;
  }
};
```

- [ ] **Step 2: 修改 `dataService.ts` 透传 `classInfo`**

```typescript
export const fetchClassroomAnalysis = async (
  scenarioCode: string,
  classInfo: ClassInfo,
): Promise<ClassroomAnalysis | null> => {
  try {
    const data = await fetchClassroomAnalysisFromApi({
      scenarioCode,
      school: classInfo.school,
      grade: classInfo.grade,
      classId: classInfo.classId,
    });

    return data as ClassroomAnalysis | null;
  } catch (error) {
    console.error("获取课堂视频分析数据失败:", error);
    return null;
  }
};
```

- [ ] **Step 3: 前端类型检查**

Run:
```bash
cd frontend && npm run build
```

Expected: 构建成功，无类型错误。

- [ ] **Step 4: Commit**

```bash
git add frontend/services/apiService.ts frontend/services/dataService.ts
git commit -m "feat(frontend): pass classInfo to classroom-analysis API"
```

---

## Task 4: 前端 AnalysisPanel 放开标签并联动班级

**Files:**
- Modify: `frontend/components/AnalysisPanel.tsx`
- Test: 浏览器手动验证

- [ ] **Step 1: 替换 SHOW_CASE 判断为全部场景可见**

```typescript
const canShowClassroomAnalysis = true;
```

把所有 `isShowCase` 引用改为 `canShowClassroomAnalysis`。

- [ ] **Step 2: 重置状态当 classInfo 变化时**

在 `useEffect` 中添加 `classInfo` 依赖，并在切换时清空已有数据：

```typescript
useEffect(() => {
  if (activeTab === 'classroom-analysis' && canShowClassroomAnalysis && !classroomAnalysisLoading) {
    setClassroomAnalysisLoading(true);
    fetchClassroomAnalysis(scenarioCode, classInfo)
      .then((analysis) => {
        setClassroomAnalysis(analysis);
      })
      .catch((err) => {
        console.error('加载课堂视频分析数据失败:', err);
        setClassroomAnalysis(null);
      })
      .finally(() => {
        setClassroomAnalysisLoading(false);
      });
  }
}, [activeTab, canShowClassroomAnalysis, scenarioCode, classInfo, classroomAnalysisLoading]);
```

注意：去掉 `!classroomAnalysis` 条件，改为每次 `classInfo` 变化都重新加载；依赖数组中包含 `classInfo` 即可实现。

- [ ] **Step 3:  classroom-analysis 标签可见性控制**

把原来 `isShowCase` 控制标签页显示/隐藏的地方改为 `canShowClassroomAnalysis`。

- [ ] **Step 4: 前端构建验证**

Run:
```bash
cd frontend && npm run build
```

Expected: 构建成功。

- [ ] **Step 5: Commit**

```bash
git add frontend/components/AnalysisPanel.tsx
git commit -m "feat(frontend): show classroom-analysis tab for all scenarios and reload per class"
```

---

## Task 5: 执行脚本写入数据并端到端验证

**Files:**
- 运行脚本
- 浏览器验证

- [ ] **Step 1: 再次 dry-run 确认**

Run:
```bash
cd backend && npx ts-node scripts/mock-classroom-analysis.ts
```

Expected: 所有目标班级都被列出，无异常。

- [ ] **Step 2: 执行写入**

Run:
```bash
cd backend && npx ts-node scripts/mock-classroom-analysis.ts --execute
```

Expected: 每个班级创建或更新一条 `SessionClassroomAnalysis`；无唯一约束冲突。

- [ ] **Step 3: 数据库校验**

Run (MySQL/SQL Server 客户端或 Prisma query):
```sql
SELECT s.code, COUNT(sca.id)
FROM session_classroom_analyses_test sca
JOIN interaction_sessions_test ses ON sca.sessionId = ses.id
JOIN learning_scenarios_test s ON ses.scenarioId = s.id
WHERE s.code != 'SHOW_CASE'
GROUP BY s.code;
```

Expected: 非 SHOW_CASE 场景下，`SessionClassroomAnalysis` 数量等于对应场景班级总数。

- [ ] **Step 4: 启动前后端并浏览器验证**

Run:
```bash
# 后端
cd backend && npm run start:dev

# 前端（新终端）
cd frontend && npm run dev
```

打开浏览器，选择非 SHOW_CASE 场景和不同班级，点击“统计分析 → 课堂视频分析”，验证：
- 标签可见。
- 不同班级显示不同数据。
- 无数据班级显示“暂无课堂视频分析数据”。

- [ ] **Step 5: Commit 数据变更记录（可选）**

如果数据导入结果需要记录：

```bash
git add backend/scripts/mock-classroom-analysis.ts
git commit -m "data: generate per-class classroom-analysis for non-showcase scenarios"
```

---

## 自我审查

| 规格要求 | 对应任务 |
|---|---|
| 为 SHOW_CASE 外所有场景所有班级生成一条分析 | Task 2 |
| 基于班级实际数据推导，不随机 | Task 2 中的分类与计算函数 |
| 班级无会话时新建会话 | Task 2 Step 2 |
| 前端按班级查询 | Task 3 + Task 4 |
| 标签对所有场景可见 | Task 4 |
| dry-run / execute 模式 | Task 2 Step 5/6 + Task 5 |
| 不修改 Prisma schema | 本计划无 schema 变更 |

---

## 执行交接

**Plan complete and saved to `docs/superpowers/plans/2026-07-01-classroom-analysis-per-class-mock.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
