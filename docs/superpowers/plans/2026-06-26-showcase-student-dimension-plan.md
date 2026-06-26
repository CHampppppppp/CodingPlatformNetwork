# SHOW_CASE 学生个人维度得分去同质化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 SHOW_CASE 场景下每个学生的个人维度分析默认展示与其真实认知画像关联的得分，点击“增量更新”后展示基于学生 ID 稳定生成的差异化学期末得分。

**架构：** 用学生节点自带的 10 维聚合得分（`studentProfile`）作为真实基线，替代全局硬编码学期前常量；改造 demo 生成器，基于 `studentNodeId` 做稳定哈希生成 0.3~0.9 的维度增量，保证同一学生稳定、不同学生不同；前端渲染默认读取 `studentProfile`。

**Tech Stack:** React + TypeScript + Vite, frontend 目录。

---

## 文件变更清单

- **修改** `frontend/services/chatbotDimensionDemo.ts`
  - 移除 `SEMESTER_BEFORE_SCORES`、`SEMESTER_AFTER_SCORES`。
  - 新增稳定哈希函数 `stableHashFromString`。
  - 新增 fallback 常量 `FALLBACK_BASELINE_SCORES`（仅内部兜底）。
  - 修改 `generateDemoChatbotIncrementData` 签名，接收 `baseline: Partial<CognitiveAttributes>`。
  - 根据基线和哈希增量生成 `previousValue` / `newValue`。

- **修改** `frontend/App.tsx`
  - 移除 `SEMESTER_BEFORE_SCORES` 导入。
  - 个人维度分析默认展示 `selectedNode.studentProfile` 真实值，缺失时 fallback 到 `FALLBACK_BASELINE_SCORES`。
  - 调用 `generateDemoChatbotIncrementData` 时传入当前 `studentProfile` 作为基线。

---

## Task 1: 改造 chatbotDimensionDemo.ts

**Files:**
- Modify: `frontend/services/chatbotDimensionDemo.ts`

- [ ] **Step 1: 用新实现替换文件内容**

```typescript
import { ChatbotDimensionIncrementData, CognitiveAttributes } from "../types";
import {
  COGNITIVE_DIMENSION_KEYS,
  COGNITIVE_DIMENSION_LABELS,
} from "../constants";

/** 班级平均水平兜底常量（仅当学生画像缺失时使用） */
const FALLBACK_BASELINE_SCORES: Record<string, number> = {
  knowledgeReserve: 3.2,
  learningEngagement: 3.5,
  cognitiveLoad: 3.0,
  learningMotivation: 3.8,
  computationalThinking: 3.1,
  humanAiTrust: 3.6,
  learningMethod: 3.3,
  learningAttitude: 3.7,
  selfRegulatedLearning: 3.4,
  aiLiteracy: 3.0,
};

const DIMENSION_CATEGORY: Record<string, string> = {
  knowledgeReserve: "认知能力",
  learningEngagement: "实践能力",
  cognitiveLoad: "心理健康",
  learningMotivation: "心理健康",
  computationalThinking: "认知能力",
  humanAiTrust: "认知能力",
  learningMethod: "实践能力",
  learningAttitude: "实践能力",
  selfRegulatedLearning: "实践能力",
  aiLiteracy: "认知能力",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 基于字符串生成稳定 0~1 浮点数 */
function stableHashFromString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const positive = Math.abs(hash);
  return positive / 2147483647;
}

/** 根据变化幅度生成描述前缀 */
function changeWording(delta: number): string {
  if (delta === 0) return "保持稳定";
  if (delta > 0 && delta < 0.3) return "略有提升";
  if (delta >= 0.3 && delta < 0.7) return "稳步改善";
  if (delta >= 0.7) return "明显提升";
  return "略有回落";
}

/** 每个个人维度分析维度对应“增量更新”的教学干预依据文案 */
function dimensionReason(code: string, delta: number): string {
  const dimensionName = COGNITIVE_DIMENSION_LABELS[code] ?? code;
  const wording = changeWording(delta);

  if (delta === 0) {
    return `近期 ${dimensionName} 未观察到显著波动，继续保持当前学习节奏与干预策略即可。`;
  }

  if (delta < 0) {
    return `略有回落：受近期任务难度或学习节奏变化影响，${dimensionName} 出现短期波动，建议关注后续变化并及时调整支持策略。`;
  }

  const reasons: Record<string, string> = {
    knowledgeReserve:
      "通过分层阅读任务、语言表达支架与科学知识网络梳理，学生的知识储备得到巩固与扩展。",
    learningEngagement:
      "围绕科学探究、动手实践与小组协作开展的项目化学习，提升了学生的学习投入程度。",
    cognitiveLoad:
      "情绪识别、放松策略与压力管理支持有效缓解了学生的认知负荷与心理负担。",
    learningMotivation:
      "挫折情境复盘与成功体验积累帮助学生在较长时间内保持了较为稳定的学习动机。",
    computationalThinking:
      "编程思维与算法拆解练习使学生在抽象问题求解与逻辑推理上更加熟练。",
    humanAiTrust:
      "数字工具使用、信息甄别与人机协作任务提升了学生对人机交互的信任与掌控感。",
    learningMethod:
      "真实情境中的问题链训练与小组合作，使学生在学习方法倾向上更加注重策略与协作。",
    learningAttitude:
      "开放性设计任务与创造性方案迭代激发了学生积极的学习态度与创新意愿。",
    selfRegulatedLearning:
      "目标设定、时间管理反思与问题解决训练促进了学生自我调节学习能力的发展。",
    aiLiteracy:
      "人工智能工具使用与伦理思辨任务帮助学生在人工智能素养方面取得阶段性进步。",
  };

  return `${wording}：${reasons[code] ?? `${dimensionName}维度的针对性干预取得了阶段性进展。`}`;
}

/** 为学生节点生成稳定的维度增量 */
function computeStableDelta(nodeId: string, code: string, index: number): number {
  const base = stableHashFromString(`${nodeId}:${code}`);
  // 整体提升 0.25 ~ 0.85，少量维度可能接近 0
  const delta = 0.25 + base * 0.65;
  // 个别维度允许接近 0 的微小变化（约 15% 概率）
  const jitter = stableHashFromString(`${nodeId}:jitter:${index}`);
  if (jitter < 0.15) {
    return roundOneDecimal(jitter * 0.2);
  }
  return roundOneDecimal(delta);
}

export function generateDemoChatbotIncrementData(
  studentNodeId: string,
  baseline?: Partial<CognitiveAttributes>,
): ChatbotDimensionIncrementData {
  const aggregateDimensions = COGNITIVE_DIMENSION_KEYS.map((code, index) => {
    const rawBaseline = baseline?.[code] ?? FALLBACK_BASELINE_SCORES[code] ?? 0;
    const previousValue = clamp(roundOneDecimal(rawBaseline), 0, 5);
    const delta = computeStableDelta(studentNodeId, code, index);
    const newValue = clamp(roundOneDecimal(previousValue + delta), 0, 5);
    const changeDelta = roundOneDecimal(newValue - previousValue);

    return {
      dimensionCode: code,
      dimensionNameZh: COGNITIVE_DIMENSION_LABELS[code] ?? code,
      category: DIMENSION_CATEGORY[code] ?? "其他",
      previousValue,
      newValue,
      changeDelta,
      reason: dimensionReason(code, changeDelta),
      updatedAt: new Date().toISOString(),
    };
  });

  return { studentNodeId, aggregateDimensions };
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/zju/CodingPlatformNetwork
git add frontend/services/chatbotDimensionDemo.ts
git commit -m "feat: generate per-student stable demo dimension increments from baseline"
```

---

## Task 2: 改造 App.tsx 默认展示与调用

**Files:**
- Modify: `frontend/App.tsx`

- [ ] **Step 1: 修改导入**

找到并替换：

```typescript
import {
  generateDemoChatbotIncrementData,
  SEMESTER_BEFORE_SCORES,
} from "./services/chatbotDimensionDemo";
```

为：

```typescript
import { generateDemoChatbotIncrementData } from "./services/chatbotDimensionDemo";
```

- [ ] **Step 2: 修改 generateDemoChatbotIncrementData 调用，传入 baseline**

找到代码段（约 789-791 行）：

```typescript
      const data = DEMO_CHATBOT_INCREMENT
        ? generateDemoChatbotIncrementData(selectedNode.id)
        : await fetchChatbotDimensionIncrement(selectedNode.id);
```

替换为：

```typescript
      const baselineProfile = selectedNode.studentProfile;
      const data = DEMO_CHATBOT_INCREMENT
        ? generateDemoChatbotIncrementData(selectedNode.id, baselineProfile)
        : await fetchChatbotDimensionIncrement(selectedNode.id);
```

- [ ] **Step 3: 修改个人维度分析默认展示逻辑**

找到渲染代码段（约 1317-1319 行）：

```typescript
                                  const displayValueRaw = !isIncrementApplied
                                    ? SEMESTER_BEFORE_SCORES[key]
                                    : selectedNode.studentProfile![attributeKey];
```

替换为：

```typescript
                                  const displayValueRaw = selectedNode.studentProfile![attributeKey];
```

- [ ] **Step 4: Commit**

```bash
cd /home/zju/CodingPlatformNetwork
git add frontend/App.tsx
git commit -m "feat: use real student profile scores as default dimension baseline"
```

---

## Task 3: 类型检查与构建验证

**Files:**
- 无新增文件

- [ ] **Step 1: 运行前端类型检查**

```bash
cd /home/zju/CodingPlatformNetwork/frontend
npx tsc --noEmit
```

Expected: 无类型错误。

- [ ] **Step 2: 运行前端构建**

```bash
cd /home/zju/CodingPlatformNetwork/frontend
npm run build
```

Expected: 构建成功，无错误。

- [ ] **Step 3: Commit（如构建产物未忽略）**

若 `dist` 已追踪且发生变化：

```bash
cd /home/zju/CodingPlatformNetwork
git add frontend/dist
git commit -m "chore: rebuild frontend after dimension baseline change"
```

若 `dist` 在 `.gitignore` 中，则无需 commit。

---

## Task 4: 手动验证

**Files:**
- 无文件变更

- [ ] **Step 1: 启动开发服务器**

```bash
cd /home/zju/CodingPlatformNetwork/frontend
npm run dev
```

- [ ] **Step 2: 打开 SHOW_CASE 场景，选择不同学生**

验证：
- 不同学生的“个人维度分析”10 维得分不同。
- 同一学生刷新后默认得分保持一致。

- [ ] **Step 3: 点击“增量更新”按钮**

验证：
- 弹窗中的 `previousValue` 等于默认展示值。
- 不同学生点击后 `newValue` 不同。
- 同一学生多次点击 `newValue` 保持一致。
- `changeDelta` 和 reason 文案正常。

- [ ] **Step 4: 关闭开发服务器**

按 `Ctrl+C` 停止。

---

## 自检

- [ ] Spec 覆盖：默认真实基线 ✅（Task 2 Step 3）、稳定哈希增量 ✅（Task 1）、弹窗前后值一致 ✅（Task 1）、UI 范围一致 ✅（clamp 0~5）。
- [ ] 无 TBD/TODO/占位符。
- [ ] 类型一致：`generateDemoChatbotIncrementData` 在 Task 1 和 Task 2 中签名一致（`studentNodeId, baseline?`）。
