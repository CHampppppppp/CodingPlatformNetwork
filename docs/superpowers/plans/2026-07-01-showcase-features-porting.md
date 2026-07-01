# SHOW_CASE 功能最小化移植实现计划（修订版）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不做能力框架、不改数据模型的前提下，把 SHOW_CASE 独占的「个人学情画像 16 维基础维度」「推荐资源」「专家干预」按钮开放给其他场景；对于没有 16 维基础维度数据的场景，基于已有的 10 维聚合维度反向 mock 生成 16 维基础维度，并**持久化写入数据库**。

**Architecture:** 前端把 `scenarioCode === "SHOW_CASE"` 硬编码开关改为场景允许列表；后端 `StudentService.getLatestCognitiveTemplate` 在学生缺失 16 维基础维度时，调用反向 mock 工具生成基础维度得分并写入 `StudentCognitiveDimensionScore`，随后返回完整维度列表。课堂视频分析和维度增量因数据不可移植而保持现状；真实姓名继续匿名化。

**Tech Stack:** NestJS + Prisma + MySQL/SQL Server；React + TypeScript + Vite + Tailwind。

---

## 数据审计结果（已执行）

| 功能 | SHOW_CASE | ONLINE_COURSE | TEACHER_QA | HOME_LEARNING | COLLABORATIVE_LEARNING | INFORMAL_LEARNING | 结论 |
|---|---|---|---|---|---|---|---|
| 课堂视频分析 | 1 | 0 | 0 | 0 | 0 | 0 | **不可移植** |
| 学生节点/有画像 | 32/32 | 8099/8099 | 191/191 | 191/191 | 247/247 | 99190/99190 | 聚合维度（10维）数据充足 |
| 16 维基础画像（原始） | 60 | 8099 | 191 | 191 | 787 | 198383 | 需要检查每个学生的画像是否包含基础维度代码 |
| 知识点节点 | 582 | 46 | 0 | 0 | 0 | 0 | 推荐/专家干预不依赖知识点数量，可移植 |
| 真实姓名 | - | - | - | - | - | - | 保持匿名化 |
| 维度增量 | 仅 801 班 | 无 | 无 | 无 | 无 | 无 | **不可移植** |

---

## 文件结构

| 文件 | 改动 |
|---|---|
| `frontend/constants.ts` | 新增共享常量 `PORTRAIT_FEATURE_SCENARIOS`（已在 Task 1/2 中完成） |
| `frontend/App.tsx:1308-1325` | 推荐资源/专家干预按钮使用 `PORTRAIT_FEATURE_SCENARIOS`（已完成） |
| `frontend/App.tsx:1401-1486` | 16 维基础画像块使用 `PORTRAIT_FEATURE_SCENARIOS`（已完成） |
| `backend/src/shared/utils/cognitive-dimensions.ts` | 新增 `generateMockBaseDimensionScores`，根据 10 维聚合得分反向 mock 16 维基础得分 |
| `backend/src/modules/student/student.service.ts` | 在 `getLatestCognitiveTemplate` 中检测缺失基础维度时，生成并持久化 mock 基础维度 |
| `frontend/components/AnalysisPanel.tsx:150` | 添加注释，说明课堂视频分析保持 SHOW_CASE-only |
| `backend/scripts/audit-showcase-porting-data.ts` | 临时审计脚本，需要删除 |

---

## 16 维基础维度 mock 规则

16 个基础维度代码及其所属的聚合维度：

| 基础维度代码 | 名称 | 所属聚合维度 |
|---|---|---|
| `COG_READING` | 阅读理解 | knowledgeReserve |
| `COG_LANGUAGE` | 语言表达 | knowledgeReserve |
| `COG_SCIENCE_KNOWLEDGE` | 科学知识 | knowledgeReserve |
| `COG_SCIENCE_INQUIRY` | 科学探究 | learningEngagement |
| `COG_COMPUTATIONAL` | 计算思维 | computationalThinking |
| `COG_TECH_LITERACY` | 技术素养 | humanAiTrust / aiLiteracy |
| `PSY_ANXIETY` | 焦虑倾向 | cognitiveLoad |
| `PSY_DEPRESSION` | 抑郁倾向 | cognitiveLoad |
| `PSY_PRESSURE` | 学业压力 | cognitiveLoad |
| `PSY_LIFE_SATISFACTION` | 生活满意度 | cognitiveLoad |
| `PSY_RESILIENCE` | 坚毅品格 | learningMotivation |
| `PSY_INTEREST_STABILITY` | 兴趣稳定性 | learningMotivation |
| `PRAC_INNOVATION` | 创新能力 | learningAttitude |
| `PRAC_PROBLEM_SOLVING` | 问题解决能力 | selfRegulatedLearning / learningMethod |
| `PRAC_COLLABORATION` | 协作能力 | learningEngagement / learningMethod |
| `PRAC_PRACTICE` | 实践能力 | learningEngagement |

反向生成公式（基础维度满分 10 分，聚合维度满分 5 分）：

```text
基础维度得分 = (聚合维度得分 × 2) ± 随机扰动
```

- 随机扰动范围：`[-1.0, +1.0]`
- 结果裁剪到 `[0, 10]`
- 使用**学生节点 ID 作为 seed**，保证同一个学生的 mock 结果稳定一致。
- 对于同一个聚合维度对应多个基础维度的情况，每个基础维度独立加扰动。

举例：
- `knowledgeReserve = 3.5`
- `COG_READING = 3.5 × 2 + rand(-1, 1) = 6.0 ~ 8.0`
- `COG_LANGUAGE = 3.5 × 2 + rand(-1, 1) = 6.0 ~ 8.0`
- `COG_SCIENCE_KNOWLEDGE = 3.5 × 2 + rand(-1, 1) = 6.0 ~ 8.0`

---

## 持久化策略

1. **只在读取时触发**：当 `StudentService.getLatestCognitiveTemplate` 被调用，且返回的 `dimensions` 中**不包含任何基础维度代码**（如 `COG_READING`）时，执行 mock 生成。
2. **只写没有的数据**：创建新的 `StudentCognitiveProfile` 记录和对应的 `StudentCognitiveDimensionScore` 记录。
3. **不覆盖已有数据**：如果学生已经存在基础维度，直接返回已有数据。
4. **版本号规则**：mock 生成的 `profileVersion` 使用 `"mock-v1"`。
5. **时间戳规则**：`generatedAt` 使用当前时间。

---

### Task 1 (Revised): 新增 16 维基础维度反向 mock 工具

**Files:**
- Modify: `backend/src/shared/utils/cognitive-dimensions.ts`

**说明：** 在该文件中新增一个纯函数 `generateMockBaseDimensionScores(aggregateScores, seed)`，用于根据 10 维聚合得分生成 16 维基础得分。不依赖 Prisma，方便单元测试。

- [ ] **Step 1: 新增常量与函数**

```ts
export const BASE_DIMENSION_CODES = [
  "COG_READING",
  "COG_LANGUAGE",
  "COG_SCIENCE_KNOWLEDGE",
  "COG_SCIENCE_INQUIRY",
  "COG_COMPUTATIONAL",
  "COG_TECH_LITERACY",
  "PSY_ANXIETY",
  "PSY_DEPRESSION",
  "PSY_PRESSURE",
  "PSY_LIFE_SATISFACTION",
  "PSY_RESILIENCE",
  "PSY_INTEREST_STABILITY",
  "PRAC_INNOVATION",
  "PRAC_PROBLEM_SOLVING",
  "PRAC_COLLABORATION",
  "PRAC_PRACTICE",
] as const;

export const AGGREGATE_TO_BASE_CODES: Record<
  AggregateDimensionKey,
  readonly string[]
> = {
  knowledgeReserve: ["COG_READING", "COG_LANGUAGE", "COG_SCIENCE_KNOWLEDGE"],
  learningEngagement: ["COG_SCIENCE_INQUIRY", "PRAC_PRACTICE", "PRAC_COLLABORATION"],
  cognitiveLoad: ["PSY_ANXIETY", "PSY_DEPRESSION", "PSY_PRESSURE", "PSY_LIFE_SATISFACTION"],
  learningMotivation: ["PSY_RESILIENCE", "PSY_INTEREST_STABILITY"],
  computationalThinking: ["COG_COMPUTATIONAL"],
  humanAiTrust: ["COG_TECH_LITERACY"],
  learningMethod: ["PRAC_PROBLEM_SOLVING", "PRAC_COLLABORATION"],
  learningAttitude: ["PRAC_INNOVATION"],
  selfRegulatedLearning: ["PRAC_PROBLEM_SOLVING"],
  aiLiteracy: ["COG_TECH_LITERACY"],
};

function seededRandom(seed: string): () => number {
  let s = 0;
  for (let i = 0; i < seed.length; i++) {
    s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function generateMockBaseDimensionScores(
  aggregateScores: Partial<AggregateDimensionScores>,
  seed: string,
): Map<string, number> {
  const rand = seededRandom(seed);
  const baseScores = new Map<string, number>();

  for (const key of AGGREGATE_DIMENSION_KEYS) {
    const aggregateScore = aggregateScores[key];
    if (typeof aggregateScore !== "number" || aggregateScore <= 0) {
      continue;
    }
    const baseCodes = AGGREGATE_TO_BASE_CODES[key];
    for (const code of baseCodes) {
      const noise = rand() * 2 - 1; // [-1, 1]
      const score = Math.max(0, Math.min(10, aggregateScore * 2 + noise));
      baseScores.set(code, Number(score.toFixed(2)));
    }
  }

  return baseScores;
}
```

- [ ] **Step 2: 验证工具函数行为**

在文件末尾追加临时测试代码（实现后删除或保留为注释）：

```ts
// Quick sanity check
if (require.main === module) {
  const scores = generateMockBaseDimensionScores(
    { knowledgeReserve: 3.5, learningEngagement: 4.0 },
    "student-123",
  );
  console.log(Object.fromEntries(scores));
}
```

Run: `cd backend && npx ts-node -e "const { generateMockBaseDimensionScores } = require('./src/shared/utils/cognitive-dimensions'); console.log(Object.fromEntries(generateMockBaseDimensionScores({ knowledgeReserve: 3.5, learningEngagement: 4.0 }, 'student-123')));"`
Expected: 输出 7 个左右的维度得分，且同一个 seed 两次运行结果一致。

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/utils/cognitive-dimensions.ts
git commit -m "feat: add reverse-mock generator for 16 base dimensions"
```

---

### Task 2 (Revised): 在 StudentService 中持久化 mock 基础维度

**Files:**
- Modify: `backend/src/modules/student/student.service.ts`

**说明：** 当学生的最新认知画像缺少 16 维基础维度时，基于已有的 10 维聚合维度生成 mock 基础维度，并写入 `StudentCognitiveProfile` 和 `StudentCognitiveDimensionScore`。

- [ ] **Step 1: 导入新增工具函数与常量**

```ts
import {
  computeAggregateDimensionScores,
  AGGREGATE_DIMENSION_KEYS,
  AGGREGATE_DIMENSION_NAME_ZH,
  AGGREGATE_DIMENSION_CATEGORY,
  generateMockBaseDimensionScores,
  BASE_DIMENSION_CODES,
} from "../../shared/utils/cognitive-dimensions";
```

- [ ] **Step 2: 判断是否需要 mock**

在 `getLatestCognitiveTemplate` 方法中，获取 `latestProfile` 后，检查 `dimensionScores` 中是否包含基础维度代码。如果没有，则生成 mock。

```ts
const hasBaseDimensions = latestProfile?.dimensionScores.some((item) =>
  BASE_DIMENSION_CODES.includes(item.dimensionCode as any),
);
```

- [ ] **Step 3: 构造聚合维度得分 map**

从 `latestProfile` 的 `dimensionScores` 中提取 10 维聚合维度得分：

```ts
const aggregateScoreMap = new Map<string, number>();
for (const item of latestProfile?.dimensionScores ?? []) {
  if (AGGREGATE_DIMENSION_KEYS.includes(item.dimensionCode as any)) {
    aggregateScoreMap.set(item.dimensionCode, Number(item.scoreValue));
  }
}
```

- [ ] **Step 4: 生成并持久化 mock 基础维度**

```ts
if (!hasBaseDimensions && aggregateScoreMap.size > 0) {
  const aggregateScores = Object.fromEntries(
    AGGREGATE_DIMENSION_KEYS.map((key) => [key, aggregateScoreMap.get(key) ?? 0]),
  ) as Partial<AggregateDimensionScores>;

  const baseScores = generateMockBaseDimensionScores(
    aggregateScores,
    studentNodeId,
  );

  const newProfile = await this.prisma.studentCognitiveProfile.create({
    data: {
      studentNodeId,
      profileVersion: "mock-v1",
      generatedAt: new Date(),
      totalScore: latestProfile?.totalScore ?? 0,
      dimensionScores: {
        create: Array.from(baseScores.entries()).map(([dimensionCode, scoreValue]) => ({
          dimensionCode,
          scoreValue,
          scoreLevel: scoreLevel(scoreValue, 0, 10),
        })),
      },
    },
    include: {
      dimensionScores: {
        include: { dimensionDef: true },
        orderBy: { dimensionDef: { sortOrder: "asc" } },
      },
    },
  });

  // 用新的 profile 替换 latestProfile 继续后续返回逻辑
}
```

注意：需要把后续 `latestProfile` 的变量更新为 `newProfile`。

- [ ] **Step 5: 确保类型导入**

`AggregateDimensionScores` 类型需要从 `cognitive-dimensions.ts` 导入（如果尚未导入）。

- [ ] **Step 6: 验证编译**

Run: `cd backend && npm run build`  
Expected: 无类型错误，构建成功。

- [ ] **Step 7: 验证持久化行为**

启动后端服务，调用一次 `GET /api/v1/students/{studentNodeId}/cognitive-template`，其中 `studentNodeId` 来自非 SHOW_CASE 场景且没有基础维度的学生。随后查询数据库确认新增了一条 `StudentCognitiveProfile` 记录和 16 条 `StudentCognitiveDimensionScore` 记录。

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/student/student.service.ts
git commit -m "feat: persist mocked 16 base dimensions for students missing them"
```

---

### Task 3 (Revised): 确认前端允许列表与渲染

**Files：**
- 已修改：`frontend/App.tsx`, `frontend/constants.ts`
- 可选：`frontend/App.tsx` 中 16 维画像渲染可过滤只展示基础维度

**说明：** Task 1 和 Task 2 的前端改动已经完成。这里只需要确认：`PORTRAIT_FEATURE_SCENARIOS` 常量已存在，按钮和 16 维画像块都在使用它。

- [ ] **Step 1: 确认常量存在**

`frontend/constants.ts` 中应包含：

```ts
export const PORTRAIT_FEATURE_SCENARIOS = [
  "SHOW_CASE",
  "ONLINE_COURSE",
  "TEACHER_QA",
  "HOME_LEARNING",
  "COLLABORATIVE_LEARNING",
  "INFORMAL_LEARNING",
] as const;
```

- [ ] **Step 2: 确认 16 维画像块过滤基础维度（可选但推荐）**

在 `frontend/App.tsx` 的「个人学情画像」渲染处，如果只期望展示 16 个基础维度，可以对 `selectedNode.studentProfile.template.dimensions` 进行过滤。例如只保留代码在 `BASE_DIMENSION_CODES` 中的维度。

由于后端现在会补齐基础维度，这一步可选。如果不做过滤，可能会同时展示聚合维度和基础维度。

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `cd frontend && npm run build`  
Expected: 无类型错误，构建成功。

- [ ] **Step 4: Commit（如果有过滤改动）**

如果做了 Step 2 的过滤改动：

```bash
git add frontend/App.tsx
git commit -m "feat: filter 16 base dimensions in portrait panel"
```

---

### Task 4: 注释说明「课堂视频分析」保持 SHOW_CASE-only

**Files:**
- Modify: `frontend/components/AnalysisPanel.tsx:150`

**说明：** 审计显示只有 SHOW_CASE 有 `SessionClassroomAnalysis` 数据，因此不需要改代码，但应添加注释防止后续误操作。

- [ ] **Step 1: 添加注释**

```tsx
// 保持 SHOW_CASE-only：当前数据库中只有 SHOW_CASE 有 SessionClassroomAnalysis 记录
const isShowCase = scenarioCode === 'SHOW_CASE';
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd frontend && npm run build`  
Expected: 无类型错误，构建成功。

- [ ] **Step 3: Commit**

```bash
git add frontend/components/AnalysisPanel.tsx
git commit -m "docs: add comment explaining classroom-analysis stays SHOW_CASE-only"
```

---

### Task 5: 清理临时审计脚本

**Files:**
- Delete: `backend/scripts/audit-showcase-porting-data.ts`

**说明：** 该脚本是为本次数据审计临时创建的，审计结果已记录在本计划中，不需要保留在代码库。

- [ ] **Step 1: 删除临时脚本**

```bash
rm backend/scripts/audit-showcase-porting-data.ts
```

- [ ] **Step 2: 确认未引入 git 跟踪**

Run: `git status`  
Expected: `backend/scripts/audit-showcase-porting-data.ts` 不在已暂存或已跟踪文件列表中。该文件为临时审计工具，不纳入版本控制。

---

### Task 6: 端到端验证与最终构建

**Files:**
- Test: 后端构建 + 前端构建 + API 调用 + 数据库查询 + 浏览器手动验证

- [ ] **Step 1: 后端构建**

Run: `cd backend && npm run build`  
Expected: 构建成功。

- [ ] **Step 2: 前端构建**

Run: `cd frontend && npm run build`  
Expected: 构建成功。

- [ ] **Step 3: 验证 mock 持久化**

1. 启动后端服务（如果尚未启动）。
2. 选择一个非 SHOW_CASE 场景的学生节点 ID（如 ONLINE_COURSE）。
3. 先查询数据库确认该学生没有基础维度记录：

```sql
SELECT p.id, p.profileVersion, s.dimensionCode, s.scoreValue
FROM student_cognitive_profiles_test p
JOIN student_cognitive_dimension_scores_test s ON p.id = s.profileId
WHERE p.studentNodeId = '{studentNodeId}';
```

4. 调用 API：`GET /api/v1/students/{studentNodeId}/cognitive-template`。
5. 再次查询数据库，确认新增了 `profileVersion = 'mock-v1'` 的记录，且包含 16 个基础维度代码。

- [ ] **Step 4: 浏览器手动验证**

打开前端页面，依次验证：
1. `SHOW_CASE`：原有功能不变，16 维画像、推荐资源、专家干预正常。
2. `ONLINE_COURSE`：学生节点详情中出现 16 维画像、推荐资源、专家干预按钮；首次点击学生节点时，后端会生成并持久化 mock 基础维度，后续刷新不会再变。
3. `TEACHER_QA` / `HOME_LEARNING` / `COLLABORATIVE_LEARNING` / `INFORMAL_LEARNING`：同上。
4. 课堂视频分析标签仅在 `SHOW_CASE` 出现。

- [ ] **Step 5: 最终 Commit（可选）**

如果只做构建和验证无新代码改动，无需提交；如有修复，按常规提交。

---

## 验收标准

- `frontend/App.tsx` 中「推荐资源」「专家干预」「16 维基础画像」不再被 `SHOW_CASE` 唯一限制。
- `frontend/components/AnalysisPanel.tsx` 中课堂视频分析保持 SHOW_CASE-only，并带有注释说明。
- `frontend/services/dataService.ts` 中学生匿名化逻辑不变。
- 后端 `generateMockBaseDimensionScores` 函数存在且行为稳定（同一 seed 输出一致）。
- 非 SHOW_CASE 场景下，学生首次调用 `GET /api/v1/students/{id}/cognitive-template` 时，数据库新增 `profileVersion = 'mock-v1'` 的 `StudentCognitiveProfile` 记录和 16 条 `StudentCognitiveDimensionScore` 记录。
- 前端 `npm run build` 与后端 `npm run build` 均通过。
- 未移植功能（课堂视频分析、维度增量）在非 SHOW_CASE 场景下仍不出现。
- 不修改 Prisma schema、不执行迁移、不改 `.env`。

---

## 未移植功能说明

| 功能 | 不移植原因 |
|---|---|
| 课堂视频分析 | 数据库中 `SessionClassroomAnalysis` 仅 SHOW_CASE 有 1 条记录 |
| 维度增量更新 | 外部 chatbot DB 仅含 `801班` 数据，对应 SHOW_CASE 的特定班级 |
| 真实姓名展示 | 隐私策略：默认保持其他场景学生匿名化 |

---

## Self-Review

**Spec coverage:** 设计文档中的「数据审计」「代码改动清单」「推荐开放顺序」「风险」均已对应到任务。

**Placeholder scan:** 无 TBD/TODO/"implement later"。

**Type consistency:** 允许列表中的场景代码字符串与 `frontend/constants.ts` 及 `frontend/types.ts` 中定义的一致；mock 生成函数中基础维度代码与 `CognitiveDimensionDef` 表中一致。

**Scope check:** 本计划只改前端硬编码和后端 mock 持久化，不改 Prisma schema，符合方案 A 的最小改动原则。

**Data safety:** 仅对缺失基础维度的学生做增量写入；不覆盖已有数据；`profileVersion = 'mock-v1'` 明确标识 mock 来源。
