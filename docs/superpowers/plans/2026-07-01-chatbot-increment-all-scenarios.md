# 增量更新功能全场景开放实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将「增量更新」按钮从仅 `SHOW_CASE` 801 班可见，改为所有场景所有学生节点都可见；模拟/真实模式继续由 `DEMO_CHATBOT_INCREMENT` 一键切换。

**Architecture:** 仅修改 `frontend/App.tsx` 中 `isChatbotIncrementEligible` 资格判断逻辑，去掉 `scenarioCode` 与 `classId` 限制；`handleChatbotIncrement` 已根据 `DEMO_CHATBOT_INCREMENT` 自动选择模拟数据或真实接口，无需改动。后端与数据模型保持不变。

**Tech Stack:** React + TypeScript + Vite + Tailwind；后端 NestJS + Prisma（无改动）。

---

## 文件结构

| 文件 | 职责 | 改动 |
|---|---|---|
| `frontend/App.tsx` | 主应用组件，包含学生详情卡片与增量更新按钮资格判断 | 修改 `isChatbotIncrementEligible` useMemo |

---

### Task 1: 修改学生节点详情卡片的增量更新按钮资格判断

**Files:**
- Modify: `frontend/App.tsx:793-798`

**说明：** 当前逻辑把按钮限制在 `SHOW_CASE` 场景且班级名包含 `"801"`。改为只要当前选中节点是学生类型即显示按钮。

- [ ] **Step 1: 读取当前代码**

```bash
cd /home/zju/CodingPlatformNetwork
sed -n '790,800p' frontend/App.tsx
```

Expected: 看到如下内容（行号可能略有偏差）：

```tsx
  const isChatbotIncrementEligible = useMemo(() => {
    if (scenarioCode !== "SHOW_CASE") return false;
    if (!selectedNode || selectedNode.type !== NodeType.STUDENT) return false;
    const studentClassId = selectedNode.studentProfile?.classId ?? "";
    return studentClassId.includes("801");
  }, [scenarioCode, selectedNode]);
```

- [ ] **Step 2: 替换为新的资格判断**

使用 `Edit` 工具精确替换上述代码块为：

```tsx
  const isChatbotIncrementEligible = useMemo(() => {
    return selectedNode?.type === NodeType.STUDENT;
  }, [selectedNode]);
```

- [ ] **Step 3: 验证替换结果**

```bash
sed -n '790,800p' frontend/App.tsx
```

Expected: 显示新的 `isChatbotIncrementEligible` 逻辑。

- [ ] **Step 4: 验证 TypeScript 编译**

```bash
cd /home/zju/CodingPlatformNetwork/frontend
npm run build
```

Expected: 构建成功，无新增类型错误。

- [ ] **Step 5: Commit**

```bash
cd /home/zju/CodingPlatformNetwork
git add frontend/App.tsx
git commit -m "feat: show chatbot increment button for all students in all scenarios"
```

---

### Task 2: 手动验证按钮可见性

**Files:**
- Test: 浏览器手动验证

- [ ] **Step 1: 启动前端开发服务器（如尚未启动）**

```bash
cd /home/zju/CodingPlatformNetwork/frontend
npm run dev
```

Expected: 开发服务器启动，控制台输出本地访问地址（如 `http://localhost:5173`）。

- [ ] **Step 2: 在浏览器中打开页面**

依次切换左侧场景列表中的每个场景：
- SHOW_CASE
- ONLINE_COURSE
- TEACHER_QA
- HOME_LEARNING
- COLLABORATIVE_LEARNING
- INFORMAL_LEARNING

在每个场景下，选择一个学生节点（圆形、标签为 STUDENT）。

- [ ] **Step 3: 确认按钮出现**

在学生节点详情卡片右上角，应看到刷新图标按钮（标题为「增量更新」或「已更新」）。

Expected: 所有场景下选中任意学生节点后，刷新按钮均可见。

- [ ] **Step 4: 验证 DEMO 模式可用**

确认 `frontend/App.tsx` 顶部 `DEMO_CHATBOT_INCREMENT = true`（默认）。点击刷新按钮，应弹出「维度增量更新」面板，展示 10 个维度的变化。

Expected: 任意场景的学生点击按钮后均弹出模拟增量数据面板。

- [ ] **Step 5: 验证真实模式请求行为（可选）**

临时把 `DEMO_CHATBOT_INCREMENT` 改为 `false`，刷新页面：

```tsx
const DEMO_CHATBOT_INCREMENT = false;
```

重新点击非 SHOW_CASE 场景学生的刷新按钮，浏览器 Network 面板应看到对 `/api/v1/students/{id}/chatbot-dimension-increment` 的请求，且后端返回 404 / 无数据，控制台报错。

Expected: 真实模式下其他场景请求失败，属于预期行为。

验证后恢复 `DEMO_CHATBOT_INCREMENT = true`。

---

## 验收标准

- `frontend/App.tsx` 中 `isChatbotIncrementEligible` 不再依赖 `scenarioCode` 和 `classId`。
- 所有场景下，选中任意学生节点后，详情卡片头部都出现「增量更新」刷新按钮。
- `DEMO_CHATBOT_INCREMENT = true` 时，任意学生点击按钮均弹出模拟增量数据面板。
- `cd frontend && npm run build` 通过，无新增类型错误。
- 不修改 Prisma schema、不执行迁移、不改 `.env`、不改后端代码。

---

## Self-Review

**Spec coverage:** 设计文档中的「前端改动」「配置开关」「数据与错误预期」「验收标准」均已对应到 Task 1 和 Task 2。

**Placeholder scan:** 无 TBD/TODO/"implement later"；所有代码块完整。

**Type consistency:** `isChatbotIncrementEligible` 返回类型仍为 `boolean`，依赖数组从 `[scenarioCode, selectedNode]` 变为 `[selectedNode]`，与实现一致。

**Scope check:** 本计划只涉及一个前端判断逻辑的修改，单文件、单提交，范围最小。
