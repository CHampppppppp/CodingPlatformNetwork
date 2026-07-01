# SHOW_CASE 功能最小化移植实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不做能力框架、不改数据模型的前提下，把 SHOW_CASE 独占的「个人学情画像 16 维基础维度」「推荐资源」「专家干预」按钮开放给其他场景。

**Architecture:** 基于数据审计结果，把前端 `scenarioCode === "SHOW_CASE"` 硬编码开关改为场景允许列表；课堂视频分析和维度增量因数据不可移植而保持现状；真实姓名继续匿名化。

**Tech Stack:** React + TypeScript + Vite + Tailwind；后端服务已是通用，无需修改。

---

## 数据审计结果（已执行）

| 功能 | SHOW_CASE | ONLINE_COURSE | TEACHER_QA | HOME_LEARNING | COLLABORATIVE_LEARNING | INFORMAL_LEARNING | 结论 |
|---|---|---|---|---|---|---|---|
| 课堂视频分析 | 1 | 0 | 0 | 0 | 0 | 0 | **不可移植** |
| 16 维基础画像 | 60 | 8099 | 191 | 191 | 787 | 198383 | **可移植到全部场景** |
| 学生节点/有画像 | 32/32 | 8099/8099 | 191/191 | 191/191 | 247/247 | 99190/99190 | **可移植** |
| 知识点节点 | 582 | 46 | 0 | 0 | 0 | 0 | 推荐/专家干预不依赖知识点数量，可移植 |
| 真实姓名 | - | - | - | - | - | - | 保持匿名化 |
| 维度增量 | 仅 801 班 | 无 | 无 | 无 | 无 | 无 | **不可移植** |

---

## 文件结构

| 文件 | 改动 |
|---|---|
| `frontend/App.tsx:1308-1325` | 把推荐资源/专家干预按钮的 `SHOW_CASE` 硬编码改为允许列表 |
| `frontend/App.tsx:1401-1486` | 把 16 维基础画像块的 `SHOW_CASE` 硬编码改为允许列表 |
| `frontend/components/AnalysisPanel.tsx:150` | 添加注释，说明课堂视频分析保持 SHOW_CASE-only |
| `frontend/services/dataService.ts:35-59` | 无需改动，保持非 SHOW_CASE 匿名化 |

---

### Task 1: 开放「推荐资源」和「专家干预」按钮

**Files:**
- Modify: `frontend/App.tsx:1308-1325`

**说明：** 当前代码仅在 `scenarioCode === "SHOW_CASE"` 时显示这两个按钮。审计表明所有场景都有学生画像数据，后端服务也是通用的，因此改为允许列表。

- [ ] **Step 1: 修改按钮渲染条件**

```tsx
// 改前
{scenarioCode === "SHOW_CASE" && (
  <div className="flex items-center gap-1.5 shrink-0">
    ...
  </div>
)}

// 改后
{[
  "SHOW_CASE",
  "ONLINE_COURSE",
  "TEACHER_QA",
  "HOME_LEARNING",
  "COLLABORATIVE_LEARNING",
  "INFORMAL_LEARNING",
].includes(scenarioCode) && (
  <div className="flex items-center gap-1.5 shrink-0">
    ...
  </div>
)}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd frontend && npm run build`  
Expected: 无类型错误，构建成功。

- [ ] **Step 3: 手动验证**

在浏览器中切换到 `ONLINE_COURSE` 场景，点击一个学生节点，确认「推荐资源」和「专家干预」按钮出现且可点击弹出对应弹窗。

- [ ] **Step 4: Commit**

```bash
git add frontend/App.tsx
git commit -m "feat: enable recommend resources and expert intervention for all scenarios"
```

---

### Task 2: 开放「个人学情画像」16 维基础维度

**Files:**
- Modify: `frontend/App.tsx:1401-1403`

**说明：** 当前代码在展示 16 维基础维度前先判断 `scenarioCode === "SHOW_CASE"`。由于所有场景都有 `StudentCognitiveProfile` 数据，且内部已有 `selectedNode.studentProfile.template?.dimensions?.length > 0` 的数据存在性检查，改为允许列表即可。

- [ ] **Step 1: 修改 16 维画像块渲染条件**

```tsx
// 改前
{scenarioCode === "SHOW_CASE" &&
  selectedNode.studentProfile.template?.dimensions
    ?.length > 0 && (
    ...
  )}

// 改后
{[
  "SHOW_CASE",
  "ONLINE_COURSE",
  "TEACHER_QA",
  "HOME_LEARNING",
  "COLLABORATIVE_LEARNING",
  "INFORMAL_LEARNING",
].includes(scenarioCode) &&
  selectedNode.studentProfile.template?.dimensions
    ?.length > 0 && (
    ...
  )}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd frontend && npm run build`  
Expected: 无类型错误，构建成功。

- [ ] **Step 3: 手动验证**

在浏览器中切换到 `ONLINE_COURSE` 场景，点击一个学生节点，向下滚动确认「个人学情画像」区域出现 16 个基础维度进度条。

- [ ] **Step 4: Commit**

```bash
git add frontend/App.tsx
git commit -m "feat: enable 16-dimension personal learning portrait for all scenarios"
```

---

### Task 3: 注释说明「课堂视频分析」保持 SHOW_CASE-only

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

### Task 4: 清理临时审计脚本

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

### Task 5: 端到端验证与最终构建

**Files:**
- Test: 前端构建 + 浏览器手动验证

- [ ] **Step 1: 全量构建**

Run: `cd frontend && npm run build`  
Expected: 构建成功，输出 `dist/` 目录。

- [ ] **Step 2: 场景切换验证**

打开前端页面，依次验证：
1. `SHOW_CASE`：原有功能不变，16 维画像、推荐资源、专家干预正常。
2. `ONLINE_COURSE`：学生节点详情中出现 16 维画像、推荐资源、专家干预按钮。
3. `TEACHER_QA` / `HOME_LEARNING` / `COLLABORATIVE_LEARNING` / `INFORMAL_LEARNING`：学生节点详情中出现 16 维画像、推荐资源、专家干预按钮。
4. 课堂视频分析标签仅在 `SHOW_CASE` 出现。

- [ ] **Step 3: 最终 Commit（可选）**

如果只做构建验证无新代码改动，无需提交；如有修复，按常规提交。

---

## 验收标准

- `frontend/App.tsx` 中「推荐资源」「专家干预」「16 维基础画像」不再被 `SHOW_CASE` 唯一限制。
- `frontend/components/AnalysisPanel.tsx` 中课堂视频分析保持 SHOW_CASE-only，并带有注释说明。
- `frontend/services/dataService.ts` 中学生匿名化逻辑不变。
- 前端 `npm run build` 通过。
- 非 SHOW_CASE 场景下，学生节点详情页出现新增按钮和 16 维画像区域。
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

**Type consistency:** 允许列表中的场景代码字符串与 `frontend/constants.ts` 及 `frontend/types.ts` 中定义的一致。

**Scope check:** 本计划只改前端硬编码，不改后端，符合方案 A 的最小改动原则。
