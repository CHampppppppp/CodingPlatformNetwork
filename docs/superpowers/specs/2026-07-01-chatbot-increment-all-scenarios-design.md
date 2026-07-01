# 增量更新功能全场景开放设计

## 背景

当前系统中，学生节点详情卡片上的「增量更新」按钮仅在 `SHOW_CASE` 场景下、且学生班级名包含 `"801"` 时才会显示。该功能对应后端 `/api/v1/students/{id}/chatbot-dimension-increment` 接口，该接口依赖独立 chatbot 数据库，目前只有展示场景 801 班有真实数据。

用户希望把「增量更新」按钮开放给**所有场景的所有学生**，模拟/真实模式继续通过原有的 `DEMO_CHATBOT_INCREMENT` 配置一键切换。其他场景在真实模式下因数据缺失而报错属于预期行为。

## 目标

- 所有场景的学生节点详情卡片都显示「增量更新」按钮。
- 不引入新的场景白名单或能力矩阵，复用现有 `DEMO_CHATBOT_INCREMENT` 配置。
- 保持后端逻辑不变，不修改数据模型。

## 方案选型

采用**方案 A：最小改动**。

不新增白名单常量，也不把开关从 `App.tsx` 顶部抽走，直接修改资格判断逻辑，让按钮对所有学生可见。

## 前端改动

### 文件

- `frontend/App.tsx`

### 当前逻辑

```tsx
const isChatbotIncrementEligible = useMemo(() => {
  if (scenarioCode !== "SHOW_CASE") return false;
  if (!selectedNode || selectedNode.type !== NodeType.STUDENT) return false;
  const studentClassId = selectedNode.studentProfile?.classId ?? "";
  return studentClassId.includes("801");
}, [scenarioCode, selectedNode]);
```

### 修改后逻辑

```tsx
const isChatbotIncrementEligible = useMemo(() => {
  return selectedNode?.type === NodeType.STUDENT;
}, [selectedNode]);
```

### 配置开关

`DEMO_CHATBOT_INCREMENT` 继续保留在 `frontend/App.tsx` 顶部：

```tsx
// 切换 chatbot 维度增量更新为演示模式（true=模拟数据，false=真实接口）
const DEMO_CHATBOT_INCREMENT = true;
```

`handleChatbotIncrement` 中已根据该开关选择调用 `generateDemoChatbotIncrementData` 或 `fetchChatbotDimensionIncrement`，无需改动。

## 后端改动

无。

## 数据与错误预期

| 模式 | 场景 | 学生 | 预期行为 |
|------|------|------|----------|
| DEMO (`DEMO_CHATBOT_INCREMENT = true`) | 任意 | 任意 | 使用 `chatbotDimensionDemo.ts` 生成模拟增量数据，按钮正常可用 |
| 真实 (`DEMO_CHATBOT_INCREMENT = false`) | SHOW_CASE 且 801 班 | 匹配 chatbot DB | 返回真实数据 |
| 真实 (`DEMO_CHATBOT_INCREMENT = false`) | 其他场景 | 任意 | 后端返回 404 / 无数据，控制台报错，按钮点击后无弹窗 |

## 验收标准

- `frontend/App.tsx` 中 `isChatbotIncrementEligible` 不再依赖 `scenarioCode` 和 `classId`。
- 所有场景下，选中任意学生节点后，详情卡片头部都出现「增量更新」刷新按钮。
- `DEMO_CHATBOT_INCREMENT = true` 时，任意学生点击按钮均弹出模拟增量数据面板。
- `DEMO_CHATBOT_INCREMENT = false` 时，按钮正常发起真实请求；SHOW_CASE 801 班学生返回真实数据，其他学生因数据缺失而请求失败，属于预期行为。
- `cd frontend && npm run build` 通过，无新增类型错误。
- 不修改 Prisma schema、不执行迁移、不改 `.env`。

## 风险与规避

| 风险 | 规避措施 |
|------|----------|
| 其他场景真实模式下按钮点击报错，用户误以为功能损坏 | 已在需求中明确报错是预期行为；如需要可在控制台错误信息中说明 |
| 演示/真实切换配置分散 | 本次保持 `DEMO_CHATBOT_INCREMENT` 原地不动，后续如扩展多场景能力矩阵再统一抽取 |

## 范围外

- 课堂视频分析标签仍保持 `SHOW_CASE`-only（已有数据审计支撑）。
- 推荐资源、专家干预、16 维基础画像已在之前的移植中开放给所有场景，本次不涉及。
- 不调整 chatbot 数据库连接、不修改 `chatbot-dimension.service.ts`。
