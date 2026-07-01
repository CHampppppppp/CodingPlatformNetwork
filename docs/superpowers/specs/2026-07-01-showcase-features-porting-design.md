# SHOW_CASE 功能移植方案（最小改动）

## 背景

当前系统中，`SHOW_CASE`（展示场景）承载了最完整的交互功能，而 `ONLINE_COURSE`、`TEACHER_QA`、`HOME_LEARNING`、`COLLABORATIVE_LEARNING`、`INFORMAL_LEARNING` 五个真实场景在前端被显式关闭或隐藏了部分能力。

本方案目标：在**不做能力框架、不改数据模型、不引入新配置层**的前提下，按各场景实际数据可用性，把 SHOW_CASE 独占功能逐步开放给对应场景。

## 方案选型

采用 **方案 A：数据审计 + 最小代码改动（硬编码扩展）**。

不采用能力矩阵框架，因为当前需求是快速验证、快速上线，而非长期可扩展的通用开关体系。

## 当前 SHOW_CASE 独占功能

| 功能 | 前端位置 | 数据依赖 | 后端通用性 |
|---|---|---|---|
| 课堂视频分析标签 | `AnalysisPanel.tsx` | `SessionClassroomAnalysis` | 通用 |
| 学生维度增量更新 | `App.tsx` | 外部 chatbot DB（801班） | 通用 |
| 推荐资源按钮 | `App.tsx` | 学生画像 + 知识点节点 | 通用 |
| 专家干预按钮 | `App.tsx` | 学生画像 + 16维基础数据 | 通用 |
| 16维基础画像 | `App.tsx` | `CognitiveTemplate.dimensions` | 通用 |
| 真实姓名展示 | `dataService.ts` | 无，纯隐私策略 | 通用 |

## 数据审计计划

在代码改动前，必须先确认各目标场景是否具备对应功能的最小数据。审计为只读查询，不修改数据库。

### 审计项

1. **课堂视频分析**
   - 查询：`SELECT scenarioId, COUNT(*) FROM SessionClassroomAnalysis GROUP BY scenarioId;`
   - 可开放条件：目标场景计数 > 0；当前审计前预计只有 `SHOW_CASE` 具备。

2. **16维基础画像**
   - 查询：`CognitiveTemplate` 按 `scenarioId` 关联 `CognitiveTemplateDimension`，检查是否存在 16 个基础维度代码。
   - 可开放条件：目标场景存在至少一个模板，且包含全部 16 个基础维度。

3. **推荐资源 / 专家干预**
   - 查询：目标场景下学生节点数量、知识点节点数量、学生画像完整度。
   - 可开放条件：学生节点 > 0 且画像字段非空。

4. **真实姓名展示**
   - 无数据依赖，由产品/隐私策略决定。

5. **维度增量更新**
   - 外部 chatbot DB 仅记录 `801班`，目前基本只有 SHOW_CASE 可使用。

## 代码改动清单

确认数据可用后，对以下硬编码点进行扩展（保持最小改动）：

| 文件 | 当前硬编码 | 改动方式 |
|---|---|---|
| `frontend/components/AnalysisPanel.tsx:150` | `const isShowCase = scenarioCode === 'SHOW_CASE';` | 改为允许列表：`const canShowClassroomAnalysis = ['SHOW_CASE', 'ONLINE_COURSE', ...].includes(scenarioCode);`，具体列表由审计结果确定。 |
| `frontend/components/AnalysisPanel.tsx:383-390` | `isShowCase` 控制标签 | 使用新变量 |
| `frontend/App.tsx:791-796` | `if (scenarioCode !== 'SHOW_CASE') return false;` | 保留 `SHOW_CASE` + 801班限制，其他场景暂不开放 |
| `frontend/App.tsx:1308-1325` | `scenarioCode === 'SHOW_CASE'` | 改为允许列表，具体场景由审计结果确定 |
| `frontend/App.tsx:1401-1485` | `scenarioCode === 'SHOW_CASE'` | 改为允许列表，具体场景由审计结果确定 |
| `frontend/services/dataService.ts:37` | `scenarioCode === 'SHOW_CASE'` | 保持默认匿名；如需开放，按产品决策扩展允许列表 |

## 推荐开放顺序

1. **推荐资源**（风险最低，后端通用，数据要求低）
2. **专家干预**（依赖学生画像，但后端通用）
3. **16维基础画像**（需确认模板数据）
4. **课堂视频分析**（需确认各场景有分析数据）
5. **真实姓名**（需产品决策）
6. **维度增量更新**（暂不建议扩展，外部数据限制）

## 风险与规避

| 风险 | 规避措施 |
|---|---|
| 某场景开放后无数据，导致按钮空点或页面空白 | 每步先审计数据，只改确认有数据的场景；改后验证 UI 是否正常降级 |
| 真实姓名泄露隐私 | 默认保持匿名化；如必须开放，需产品/法务确认 |
| 外部 chatbot 数据无法同步 | 维度增量暂不开放 |
| 硬编码列表难以维护 | 后续如继续扩展，再考虑重构为能力矩阵；本次只加注释说明 |

## 验收标准

- 审计 SQL 已执行并记录结果。
- 目标场景下，已开放功能按钮/标签可见且可正常交互。
- 未开放功能在非 SHOW_CASE 场景下仍不可见。
- 前端构建通过，无类型错误。
- 不修改 Prisma schema、不执行迁移、不改 `.env`。
