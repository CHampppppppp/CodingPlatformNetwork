# TEACHER_QA / HOME_LEARNING 模拟数据生成设计

## 背景

平台当前六个场景元数据已存在，但 `TEACHER_QA`（课后线上教师授课答疑）和 `HOME_LEARNING`（家庭在线学习）两个场景在 `graph_nodes_test` / `interaction_sessions_test` 中没有任何节点与会话数据，导致前端可视化与分析报表中这两个场景为空。

本设计目标是为这两个缺失场景生成闭环、可复用、符合现有数据管道的 mock 数据文件，由用户自行决定何时执行入库。

## 需求确认

| 需求项 | 确认结果 |
|---|---|
| 目标场景 | `TEACHER_QA`、`HOME_LEARNING` |
| 每场景班级数 | 4-6 个班 |
| 学校数 | 每个场景 2 所，仿照现有场景学校命名 |
| 每班学生数 | 20-40 人（随机） |
| 每班教师数 | 1 名班主任 |
| 数据丰富度 | 完整数据：学校/年级/班级/教师/学生 + 知识点 + 会话 + 交互 + 认知画像 |
| 是否直接入库 | 先生成文件，默认 dry-run，加 `--execute` 才写入，由用户决定是否执行 |

## 总体方案

采用 **可复用 MockScenarioAdapter + 薄脚本** 方案：

1. 新增 `backend/src/modules/ingestion/adapters/mock-scenario.adapter.ts`
   - 实现 `PlatformAdapter` 接口，返回 `NormalizedPlatformData`。
   - 输入：`scenarioCode`（`TEACHER_QA` 或 `HOME_LEARNING`）及规模参数（学校数、每校班级数、每班学生范围等）。
   - 输出：完整的 `NormalizedPlatformData`，包含学校、年级、班级、教师、学生、知识点、会话、学生-知识点关系、平台交互、认知画像。
2. 新增 `backend/scripts/import-mock-scenario.ts`
   - 命令行入口：解析 `--scenarioCode`、规模参数、`--execute` 标志。
   - 默认先 dry-run 打印统计信息，加 `--execute` 才调用 `IngestionService.importPlatformData()` 写入数据库。
3. 用户自行运行 `recompute-student-degrees.ts` 等后续脚本更新统计字段。

## 数据生成规则

### 学校

- 每个场景生成 2 所学校。
- 学校名仿照现有场景中出现的样式，例如：
  - `TEACHER_QA`：`三门县实验学校`、`杭州市答疑实验中学`
  - `HOME_LEARNING`：`杭州市星洲小学`、`竺可桢学校`
- `externalId` 使用场景前缀 + 学校序号，确保同一场景内唯一。

### 年级与班级

- 年级随机取小学 3-6 年级或初中 7-9 年级。
- 班级命名参照“三门县实验学校小学部3年级1班”格式：
  - `{学校名}{学部}{年级}年级{班号}班`
  - 学部根据年级自动判定：1-6 年级为“小学部”，7-9 年级为“初中部”。
- 每所学校 2-3 个班，保证每场景共 4-6 个班。

### 教师

- 每个班 1 名班主任。
- `displayName`：`{班级名}老师`。
- `externalId`：带场景/学校/年级/班级前缀。

### 学生

- 每班随机 20-40 人。
- `displayName`：使用常见中文姓名 mock（从姓名池中随机抽取，避免真实隐私）。
- `externalUserId`：使用 `externalId` 或学号格式，便于追踪。
- `gender`：随机男/女。

### 知识点

- 每个场景预置 8-12 条知识点，覆盖语文、数学、英语、科学等学科。
- `category`、`difficulty` 随机赋值。

### 会话

- 每个班生成 1-2 次会话。
- `sessionName`：例如“三门县实验学校小学部3年级1班 课后答疑”。
- `occurredAt`：随机落在最近 30 天内。

### 交互

- 学生 -> 知识点：`STUDY`，强度随机 0.5-1.0（由 `studentKnowledgeRelations` 自动生成）。
- 教师 -> 学生：`TEACHING`，强度随机 0.6-1.0。
- 学生 -> 教师：`HELP_SEEKING`，每班少量边。
- 学生 <-> 学生：`COLLABORATION`，在同班内随机生成少量边。

### 认知画像

- 为每名学生生成 10 维个人维度分析数据（如 `knowledgeReserve`、`learningMotivation` 等），分数随机 0-100。
- 维度代码从现有 `CognitiveDimensionDef` 中选取。

## 关键约束与避坑

- 所有数据必须通过 `IngestionService.importPlatformData()` 入库，保证 `scenario -> school -> grade -> class -> teacher/student -> session -> interaction` 的外键闭环。
- 一个班只能有一位老师（`Class.teacherId` / `TeacherProfile.classId` 唯一）。
- `Interaction` 有唯一索引 `@@unique([sessionId, sourceNodeId, targetNodeId, interactionType, actionType])`，生成时避免重复边。
- 外部 ID 带场景前缀，避免跨场景冲突。
- 脚本默认 dry-run，防止误写入数据库。

## 输出文件

- `backend/src/modules/ingestion/adapters/mock-scenario.adapter.ts`
- `backend/scripts/import-mock-scenario.ts`

## 后续可选步骤（由用户执行）

```bash
# 1. 查看 dry-run 统计
cd backend && npx ts-node scripts/import-mock-scenario.ts TEACHER_QA

# 2. 确认后执行入库
npx ts-node scripts/import-mock-scenario.ts TEACHER_QA --execute
npx ts-node scripts/import-mock-scenario.ts HOME_LEARNING --execute

# 3. 更新学生度数统计
npx ts-node scripts/recompute-student-degrees.ts

# 4. 抽样验证
npx ts-node scripts/export-class-students.ts --scenarioCode=TEACHER_QA --className=小学部3年级1班
```

## 验收标准

- [ ] `MockScenarioAdapter` 能通过 TypeScript 编译。
- [ ] dry-run 输出包含学校、班级、学生、教师、知识点、会话、交互、认知画像的数量统计。
- [ ] 生成的 `NormalizedPlatformData` 能通过 `IngestionService.importPlatformData()` 的校验并成功写入（用户执行 `--execute` 时）。
- [ ] 写入后两个场景在数据库中均有 4-6 个班、每班 20-40 名学生、1 名教师、若干知识点与会话。
