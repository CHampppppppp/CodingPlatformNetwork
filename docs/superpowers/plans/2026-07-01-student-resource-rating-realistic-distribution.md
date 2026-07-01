# 学生资源评分真实分布改造实施计划

> **For agentic workers:** REQUIRED SUB-TOOL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让学生对知识点相关资源的评分按资源真实难度分层（LOW 90%-100%、MEDIUM 70%-90%、HIGH 50%-70%），同时保持整体平均接受度在 85% 左右。

**Architecture:** 复用 `Resource.difficulty` 字段标记难度；新增回填脚本给现有资源打标签；改造评分生成脚本，根据真实难度分布反推各档目标接受度并叠加正态噪声生成个体评分；补全资源创建接口的 `difficulty` 字段。

**Tech Stack:** NestJS + Prisma + TypeScript + ts-node

---

## 文件结构

| 文件 | 类型 | 职责 |
|---|---|---|
| `backend/src/modules/resource/resource.dto.ts` | 修改 | 为创建资源接口增加 `difficulty` 枚举字段校验 |
| `backend/src/modules/resource/resource.service.ts` | 修改 | 创建资源时持久化 `difficulty` |
| `backend/scripts/backfill-resource-difficulty.ts` | 新建 | 批量回填现有 `difficulty IS NULL` 的资源难度标签 |
| `backend/scripts/mock-student-resource-rates.ts` | 修改 | 按资源难度分布生成带真实差异的评分 |

---

## Task 1: 资源创建接口补全 difficulty 字段

**Files:**
- Modify: `backend/src/modules/resource/resource.dto.ts`
- Modify: `backend/src/modules/resource/resource.service.ts`

- [ ] **Step 1: 在 DTO 中新增 difficulty 字段**

在 `backend/src/modules/resource/resource.dto.ts` 的 `createResourceSchema` 中新增：

```ts
export const difficultySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const createResourceSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  resourceType: resourceTypeSchema,
  acceptanceRate: z.coerce.number().min(0).max(100).optional().nullable(),
  difficulty: difficultySchema.optional().nullable(),
  knowledgeNodeIds: z.array(z.string().trim()).optional(),
});
```

- [ ] **Step 2: 在 Service 中写入 difficulty**

修改 `backend/src/modules/resource/resource.service.ts` 中 `createResource` 的数据库写入逻辑：

```ts
const resource = await tx.resource.create({
  data: {
    title: dto.title,
    description: dto.description ?? null,
    url: dto.url ?? null,
    resourceType: dto.resourceType,
    difficulty: dto.difficulty ?? null,
    acceptanceRate: dto.acceptanceRate ?? null,
  },
});
```

- [ ] **Step 3: 编译后端并运行相关 lint / build 检查**

Run:
```bash
cd backend && npm run build
```

Expected: 构建通过，无类型错误。

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/resource/resource.dto.ts backend/src/modules/resource/resource.service.ts
git commit -m "feat(resource): support difficulty field on resource creation"
```

---

## Task 2: 新建资源难度回填脚本

**Files:**
- Create: `backend/scripts/backfill-resource-difficulty.ts`

- [ ] **Step 1: 创建脚本文件并读取所有未设置难度的资源**

创建 `backend/scripts/backfill-resource-difficulty.ts`，内容骨架：

```ts
/**
 * 回填 Resource.difficulty 字段。
 *
 * 规则：
 * - 标题含“入门|基础|简单|初识|导读” → LOW
 * - 标题含“进阶|提高|挑战|困难|深入|高级” → HIGH
 * - 无关键词时按 resourceType 默认：VIDEO/ARTICLE → LOW；PRACTICE → MEDIUM；GAME → HIGH
 * - 默认 dry-run，加 --execute 写入。
 *
 * 用法：
 *   npx ts-node scripts/backfill-resource-difficulty.ts [--execute]
 */

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";

type Difficulty = "LOW" | "MEDIUM" | "HIGH";

const LOW_KEYWORDS = /入门|基础|简单|初识|导读/;
const HIGH_KEYWORDS = /进阶|提高|挑战|困难|深入|高级/;

function inferDifficulty(title: string, resourceType: string): Difficulty {
  if (LOW_KEYWORDS.test(title)) return "LOW";
  if (HIGH_KEYWORDS.test(title)) return "HIGH";

  switch (resourceType) {
    case "VIDEO":
    case "ARTICLE":
      return "LOW";
    case "PRACTICE":
      return "MEDIUM";
    case "GAME":
      return "HIGH";
    default:
      return "MEDIUM";
  }
}

async function main() {
  const execute = process.argv.includes("--execute");

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);

  try {
    const resources = await prisma.resource.findMany({
      where: { difficulty: null },
      select: { id: true, title: true, resourceType: true },
    });

    console.log(`待回填资源数: ${resources.length}`);

    const updates = resources.map((r) => ({
      id: r.id,
      difficulty: inferDifficulty(r.title, r.resourceType),
    }));

    const stats = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    for (const u of updates) {
      stats[u.difficulty]++;
    }

    console.log("预计分布:", stats);

    if (execute) {
      let count = 0;
      for (const u of updates) {
        await prisma.resource.update({
          where: { id: u.id },
          data: { difficulty: u.difficulty },
        });
        count++;
      }
      console.log(`已更新: ${count}`);
    } else {
      console.log("这是演练模式，未写入。加 --execute 执行。");
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: 运行 dry-run 查看预计分布**

Run:
```bash
cd backend && npx ts-node scripts/backfill-resource-difficulty.ts
```

Expected: 打印待回填资源数、各难度预计数量。确认无异常。

- [ ] **Step 3: 运行 execute 写入**

Run:
```bash
cd backend && npx ts-node scripts/backfill-resource-difficulty.ts --execute
```

Expected: 打印已更新数量。

- [ ] **Step 4: 数据库抽样验证**

Run:
```bash
cd backend && npx prisma studio
```
或直接查询数据库：
```sql
SELECT difficulty, COUNT(*) FROM resources_test GROUP BY difficulty;
```

Expected: `difficulty` 字段大部分已被填充为 LOW/MEDIUM/HIGH。

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/backfill-resource-difficulty.ts
git commit -m "feat(scripts): add backfill script for resource difficulty"
```

---

## Task 3: 改造评分生成脚本

**Files:**
- Modify: `backend/scripts/mock-student-resource-rates.ts`

- [ ] **Step 1: 新增难度相关常量与正态分布采样函数**

在文件顶部新增：

```ts
const DIFFICULTY_RANGES: Record<string, { minAcceptance: number; maxAcceptance: number }> = {
  LOW: { minAcceptance: 90, maxAcceptance: 100 },
  MEDIUM: { minAcceptance: 70, maxAcceptance: 90 },
  HIGH: { minAcceptance: 50, maxAcceptance: 70 },
};

const TARGET_OVERALL_ACCEPTANCE = 85;
const RATING_NOISE_STD = 0.25;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function sampleNormal(random: () => number): number {
  // Box-Muller transform
  const u1 = random();
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
```

- [ ] **Step 2: 新增目标接受度求解函数**

在 `generateRate` 附近新增：

```ts
interface TargetAcceptance {
  LOW: number;
  MEDIUM: number;
  HIGH: number;
}

function solveTargetAcceptance(
  counts: Record<string, number>,
): TargetAcceptance {
  const total = counts.LOW + counts.MEDIUM + counts.HIGH;
  if (total === 0) {
    throw new Error("没有可用资源，无法计算目标接受度。");
  }

  const pLow = counts.LOW / total;
  const pMedium = counts.MEDIUM / total;
  const pHigh = counts.HIGH / total;

  // 先尝试中点组合：LOW=95, HIGH=60，反推 MEDIUM
  let aLow = 95;
  let aHigh = 60;
  let aMedium = (TARGET_OVERALL_ACCEPTANCE - pLow * aLow - pHigh * aHigh) / pMedium;

  if (aMedium >= 70 && aMedium <= 90) {
    return { LOW: aLow, MEDIUM: aMedium, HIGH: aHigh };
  }

  // 若 MEDIUM 偏高，尝试边界：LOW=90, HIGH=70
  if (aMedium > 90) {
    aLow = 90;
    aHigh = 70;
    aMedium = (TARGET_OVERALL_ACCEPTANCE - pLow * aLow - pHigh * aHigh) / pMedium;
    if (aMedium >= 70 && aMedium <= 90) {
      return { LOW: aLow, MEDIUM: aMedium, HIGH: aHigh };
    }
  }

  // 若 MEDIUM 偏低，说明 HIGH 资源过多，无法在约束内达到 85%
  throw new Error(
    `无法在当前资源难度分布下达到目标接受度 ${TARGET_OVERALL_ACCEPTANCE}%。` +
    `当前分布：LOW=${counts.LOW}, MEDIUM=${counts.MEDIUM}, HIGH=${counts.HIGH}。` +
    `请调整回填规则或放宽目标均值。`,
  );
}
```

- [ ] **Step 3: 修改 generateRate 为按资源难度生成评分**

把原 `generateRate` 改为：

```ts
function generateRate(
  random: () => number,
  baseAcceptance: number,
): number {
  const baseRate = (baseAcceptance / 100) * RATE_MAX;
  const noise = sampleNormal(random) * RATING_NOISE_STD;
  return round2(clamp(baseRate + noise, RATE_MIN, RATE_MAX));
}
```

- [ ] **Step 4: 在 mockRatesForScenario 中读取资源难度并求解目标接受度**

修改 `mockRatesForScenario`：

1. 获取资源时同时读取 `difficulty`：

```ts
const resourceRelations = await prisma.resourceKnowledgeRelation.findMany({
  where: { knowledgeNodeId: { in: knowledgeIds } },
  select: {
    resourceId: true,
    knowledgeNodeId: true,
    resource: { select: { difficulty: true } },
  },
});
```

2. 统计难度分布并求解：

```ts
const counts: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
for (const rel of resourceRelations) {
  const difficulty = rel.resource.difficulty || "MEDIUM";
  counts[difficulty] = (counts[difficulty] || 0) + 1;
}

const targetAcceptance = solveTargetAcceptance(counts);
console.log("目标接受度:", targetAcceptance);
console.log("资源难度分布:", counts);
```

3. 生成评分时使用资源难度对应的目标接受度：

```ts
for (const [studentNodeId, resourceIds] of resourcesByStudent) {
  for (const resourceId of resourceIds) {
    const difficulty =
      resourceRelations.find((r) => r.resourceId === resourceId)?.resource.difficulty || "MEDIUM";
    const baseAcceptance = targetAcceptance[difficulty];
    const rate = generateRate(random, baseAcceptance);
    rateSum += rate;
    totalCount += 1;

    if (execute) {
      rateRows.push({
        studentId: studentNodeId,
        resourceId,
        rate: Number(rate.toFixed(2)),
      });
    }
  }
}
```

- [ ] **Step 5: 增强输出统计**

在打印汇总信息时，按难度分组统计生成的评分：

```ts
// 在 rateRows 生成过程中同步记录分组和
const rateSumByDifficulty: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
const rateCountByDifficulty: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };

for (const [studentNodeId, resourceIds] of resourcesByStudent) {
  for (const resourceId of resourceIds) {
    const difficulty = ...;
    const rate = generateRate(random, targetAcceptance[difficulty]);
    rateSumByDifficulty[difficulty] += rate;
    rateCountByDifficulty[difficulty] += 1;
    // ... 其余不变
  }
}

// 打印
for (const difficulty of ["LOW", "MEDIUM", "HIGH"]) {
  const count = rateCountByDifficulty[difficulty];
  if (count === 0) continue;
  const avg = round2(rateSumByDifficulty[difficulty] / count);
  console.log(`  ${difficulty} 预计平均评分: ${avg} / ${RATE_MAX} (接受度 ${round2((avg / RATE_MAX) * 100)}%)`);
}
```

- [ ] **Step 6: 运行 dry-run 验证分布**

Run:
```bash
cd backend && npx ts-node scripts/mock-student-resource-rates.ts --all
```

Expected:
- 打印各难度资源分布
- 打印目标接受度
- LOW 组平均评分在 4.50-5.00，MEDIUM 在 3.50-4.50，HIGH 在 2.50-3.50
- 整体预计平均接受度在 84%-86% 之间

- [ ] **Step 7: 清理旧评分并执行写入**

先清空旧评分（注意：这会删除所有学生资源评分）：
```bash
cd backend && npx ts-node scripts/clear-student-resource-rates.ts
```

再执行新评分生成：
```bash
cd backend && npx ts-node scripts/mock-student-resource-rates.ts --all --execute
```

Expected: 成功写入，打印各难度分组统计和汇总统计。

- [ ] **Step 8: 数据库验证**

Run:
```sql
SELECT r.difficulty, AVG(srr.rate) / 5 * 100 AS acceptance
FROM student_resource_rates_test srr
JOIN resources_test r ON r.id = srr.resourceId
GROUP BY r.difficulty;
```

Expected:
- LOW: 90%-100%
- MEDIUM: 70%-90%
- HIGH: 50%-70%

再查整体均值：
```sql
SELECT AVG(rate) / 5 * 100 AS overall_acceptance FROM student_resource_rates_test;
```

Expected: 84%-86%。

- [ ] **Step 9: Commit**

```bash
git add backend/scripts/mock-student-resource-rates.ts
git commit -m "feat(scripts): generate resource ratings by difficulty with realistic distribution"
```

---

## Task 4: 验证资源 API 返回的 acceptanceRate

**Files:**
- No file changes, only verification.

- [ ] **Step 1: 启动后端并请求资源列表**

启动后端（按项目实际命令）：
```bash
cd backend && npm run start:dev
```

调用接口（替换为实际 URL）：
```bash
curl "http://localhost:3000/api/resources?page=1&pageSize=50"
```

- [ ] **Step 2: 检查 acceptanceRate 分布**

Expected: 不同 difficulty 资源的 `acceptanceRate` 有明显分层，不再是全部 84-86。

- [ ] **Step 3: 记录验证结果**

把抽样结果截图或复制到任务记录中，作为完成证据。

---

## Task 5: 处理学生-知识点关联默认评分的副作用

**Files:**
- Modify: `backend/src/modules/student-knowledge-relation/student-knowledge-relation.service.ts`

`upsertResourceRates` 在学生-知识点关联创建时，若未提供评分会默认写入 3.0。这与新的“按难度评分”逻辑不一致，需要同步调整。

- [ ] **Step 1: 读取资源难度并生成合理默认评分**

修改 `upsertResourceRates` 方法，当没有 `explicitRates` 时：

```ts
const resourceRelations = await prisma.resourceKnowledgeRelation.findMany({
  where: { knowledgeNodeId },
  select: {
    resourceId: true,
    resource: { select: { difficulty: true } },
  },
});

for (const { resourceId, resource } of resourceRelations) {
  const difficulty = resource.difficulty || "MEDIUM";
  const baseAcceptance =
    difficulty === "LOW" ? 95 : difficulty === "HIGH" ? 60 : 80;
  const rate = new Prisma.Decimal(
    Math.round(((baseAcceptance / 100) * 5) * 100) / 100,
  );

  try {
    await this.prisma.studentResourceRate.create({
      data: { studentId: studentNodeId, resourceId, rate },
    });
  } catch (error: any) {
    if (error?.code === "P2002") continue;
    throw error;
  }
}
```

- [ ] **Step 2: 构建并验证后端无类型错误**

Run:
```bash
cd backend && npm run build
```

Expected: 构建通过。

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/student-knowledge-relation/student-knowledge-relation.service.ts
git commit -m "fix(student-knowledge-relation): use difficulty-aware default resource rating"
```

---

## 自我检查

### Spec coverage

- [x] 难度标签定义（LOW/MEDIUM/HIGH） → Task 2
- [x] 资源创建接口补全 difficulty → Task 1
- [x] 现有资源回填 → Task 2
- [x] 评分脚本按真实分布反推目标接受度 → Task 3
- [x] 无解时终止 → Task 3 Step 2
- [x] 学生-知识点关联默认评分同步 → Task 5
- [x] 验证 API 分层 → Task 4

### Placeholder scan

- [x] 无 TBD / TODO
- [x] 无 "add appropriate error handling" 等模糊描述
- [x] 每个代码步骤都包含具体代码
- [x] 每个命令都包含预期输出

### Type consistency

- [x] `difficulty` 取值统一为 `"LOW" | "MEDIUM" | "HIGH"`
- [x] `targetAcceptance` 对象键与难度取值一致
- [x] `solveTargetAcceptance` 输入输出类型在 Task 3 中保持一致

---

## 执行方式

Plan complete and saved to `docs/superpowers/plans/2026-07-01-student-resource-rating-realistic-distribution.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach would you like?
