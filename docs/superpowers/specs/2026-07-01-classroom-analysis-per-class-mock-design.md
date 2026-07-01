# 课堂视频分析按班级 mock 数据方案

## 背景与目标

当前系统只有 `SHOW_CASE` 场景有一条 `SessionClassroomAnalysis` 记录，其他真实平台场景的班级在“统计分析 → 课堂视频分析”标签下无数据。

目标：为 `SHOW_CASE` 以外的所有场景、每个班级生成一条 `SessionClassroomAnalysis`，且字段值必须基于该班级的实际数据推导，不能凭空随机生成。

## 范围

- **覆盖场景**：除 `SHOW_CASE` 外的全部 `LearningScenario`。
- **覆盖班级**：目标场景下的全部 `Class`。
- **数据粒度**：每个班级仅一条 `SessionClassroomAnalysis`。
- **会话处理**：班级无现成 `InteractionSession` 时，新建一条最小会话作为挂靠。

## 方案选型

采用 **方案 A：完全基于班级实际指标推导**。

不采用随机生成（不满足“对应上”），也不采用 SHOW_CASE 模板等比缩放（会抹平班级差异）。

## 数据模型

依赖表：
- `classes_test` (Class)
- `grades_test` (Grade)
- `schools_test` (School)
- `learning_scenarios_test` (LearningScenario)
- `interaction_sessions_test` (InteractionSession)
- `session_classroom_analyses_test` (SessionClassroomAnalysis)
- `graph_nodes_test` (GraphNode)
- `interactions_test` (Interaction)

## 生成脚本

新增脚本：`backend/scripts/mock-classroom-analysis.ts`

### 执行方式

```bash
# 演练模式，只打印预览，不写入
npx ts-node scripts/mock-classroom-analysis.ts

# 真正写入数据库
npx ts-node scripts/mock-classroom-analysis.ts --execute
```

### 算法步骤

1. 查询所有 `LearningScenario`，过滤掉 `code === 'SHOW_CASE'`。
2. 对每个目标场景，查询其下所有 `Class`（含 grade/school）。
3. 对每个班级：
   a. 查询该班级最新的一条 `InteractionSession`（按 `occurredAt` 降序）。
   b. 若不存在，新建一条 `InteractionSession`：
      - `scenarioId` / `schoolId` / `gradeId` / `classId` 取自班级链路。
      - `sessionName` = `{班级名称} 课堂视频分析会话`。
      - `occurredAt` = `new Date()`。
   c. 以该 session 为中心，统计班级实际指标。
   d. 按固定公式计算 `SessionClassroomAnalysis` 各字段。
   e. 使用 `upsert`（按 `sessionId`）写入记录。
4. 输出每个班级的处理结果与字段摘要。

## 字段推导规则

统计指标定义：
- `S` = 班级学生节点数（`GraphNode.nodeType = 'Student'`, `classId = 班级.id`）
- `T` = 班级教师节点数（`GraphNode.nodeType = 'Teacher'`）
- `K_total` = 该场景下知识点节点总数
- `K_activated` = 班级会话交互中作为目标出现的不同知识点节点数
- `I_total` = 班级所有会话的交互总数
- `I_student_source` = 学生作为源节点的交互数
- `I_teacher_student` = 师生之间交互数（源或目标为学生/教师）
- `I_peer` = 学生-学生交互数
- `I_questions` = 被识别为提问的交互数（按 `actionType` 映射）
- `I_feedback` = 被识别为反馈的交互数
- `actionTypes` = 班级交互中不同 `actionType` 集合

字段计算：

### 交互分类规则

当 `Interaction.actionType` 存在时，按以下关键字匹配（大小写不敏感）：
- **提问类**：`question`, `ask`, `quiz`, `probe`
  - 子类型：含 `closed`, `close`, `yes_no` → 封闭式；含 `open`, `inquiry`, `explore` → 开放探究；其他 → 理解应用
- **反馈类**：`feedback`, `comment`, `reply`
  - 子类型：含 `accept`, `adopt` → 接受/采纳；含 `praise`, `encourage` → 表扬/鼓励；含 `extend`, `expand` → 拓展性；含 `correct`, `revise` → 纠正性
- **合作类**：`collaborate`, `peer`, `group`, `discuss`
- **工具使用**：`tool`, `resource`, `material`, `device`

当 `actionType` 为空时，按 `interactionType` 回退：
- `PHYSICAL` 且学生↔学生 → 合作类
- `PLATFORM` 且含教师 → 反馈类或提问类（按源目标角色推断）
- 其他 → 普通发言/交互

### 字段映射表

| 字段 | 计算方式 |
|---|---|
| `totalKnowledgeCount` | `K_total` |
| `activatedKnowledgeCount` | `K_activated` |
| `knowledgeActivationRate` | `K_total > 0 ? (K_activated / K_total * 100) : 0`，保留两位小数 |
| `studentUtteranceCount` | `I_student_source` |
| `teacherStudentInteractionCount` | `I_teacher_student` |
| `peerCollaborationCount` | `I_peer` |
| `constructiveUtteranceCount` | `Math.round(I_student_source * 0.35)` |
| `closedQuestionCount` | `Math.round(I_questions * 0.45)` |
| `applicationQuestionCount` | `Math.round(I_questions * 0.35)` |
| `openQuestionCount` | `I_questions - closed - application` |
| `acceptFeedbackCount` | `Math.round(I_feedback * 0.25)` |
| `praiseFeedbackCount` | `Math.round(I_feedback * 0.25)` |
| `extendFeedbackCount` | `Math.round(I_feedback * 0.25)` |
| `correctFeedbackCount` | `I_feedback - accept - praise - extend` |
| `toolVarietyCount` | `actionTypes.size`，最小 1，最大 10 |
| `behavioralEngagementLevel` | 人均交互 `I_total / max(S,1)`：>8 高、4-8 中、<4 低 |
| `cognitiveEngagementLevel` | `constructiveUtteranceCount / max(S,1)`：>3 高、1-3 中、<1 低 |
| `hasBurnout` | 班级学生平均 `cognitiveLoad` 维度 > 3.5 且 `behavioralEngagementLevel` 为低；无认知数据时默认为 `false` |
| `hasFrustration` | 班级学生平均 `cognitiveLoad` > 3.5 且人均提问数 < 0.5；无认知数据时默认为 `false` |
| `conceptDevelopmentLevel` | `knowledgeActivationRate`：>70 优秀、50-70 良好、30-50 中等、<30 待提升 |
| `feedbackQualityLevel` | 反馈交互人均：>2 优秀、1-2 良好、0.5-1 中等、<0.5 待提升 |
| `academicExpectationLevel` | 教师交互占比：>30% 优秀、20-30% 良好、10-20% 中等、<10% 待提升 |
| `teacherFluencyLevel` | 教师交互总数：>50 优秀、20-50 良好、5-20 中等、<5 待提升 |
| `selfAwarenessLevel` | 同 `academicExpectationLevel` |
| `selfManagementLevel` | 同 `feedbackQualityLevel` |
| `collectiveManagementLevel` | 师生交互 + 同伴交互综合：高 优秀、中 良好、低 中等/待提升 |
| `ruleClarityLevel` | 默认按 `behavioralEngagementLevel` 映射：高→优秀、中→良好、低→中等 |
| `positiveReinforcementLevel` | 同 `feedbackQualityLevel` |
| `negativeReductionLevel` | 无沮丧情绪时 优秀/良好，否则 中等/待提升 |

> 阈值与系数可在实现阶段根据实际数据分布微调，但必须在脚本中写死，不能随机。

## 前端/API 改动

### 后端 `classroom-analysis.service.ts`

- 当 `params.classId` 传入时，按 `classId` 精确过滤 `InteractionSession`，再查询对应的 `SessionClassroomAnalysis`。
- 未传 `classId` 时保持现有逻辑（返回场景下第一条），避免破坏其他调用方。

### 前端 `apiService.ts`

- `fetchClassroomAnalysis` 接收 `school/grade/classId` 名称参数，复用现有 `schoolNameToId` / `gradeKeyToId` / `classKeyToId` 映射，转换为后端 ID 后查询。

### 前端 `dataService.ts`

- `fetchClassroomAnalysis(scenarioCode, classInfo)` 把 `classInfo` 透传给 `apiService.fetchClassroomAnalysis`。

### 前端 `AnalysisPanel.tsx`

- 把 `const isShowCase = scenarioCode === 'SHOW_CASE';` 改为 `const canShowClassroomAnalysis = true;`（所有场景都开放）。
- `useEffect` 中加载 classroom analysis 时依赖 `classInfo`，切换班级时重置 `classroomAnalysis` 状态。

## 验收标准

- [ ] 脚本 dry-run 能打印每个班级的预览字段，不写入数据库。
- [ ] 脚本 `--execute` 后为每个非 SHOW_CASE 班级创建/更新一条 `SessionClassroomAnalysis`。
- [ ] 数据库中每个班级仅一条分析记录（以 `sessionId` 唯一约束保证）。
- [ ] 前端切换到不同班级时，课堂视频分析标签显示对应该班级的数据。
- [ ] 切换场景/班级时无残留旧数据。
- [ ] 后端/前端构建通过，无类型错误。
- [ ] 不修改 Prisma schema，不执行迁移。

## 风险与规避

| 风险 | 规避 |
|---|---|
| 班级无会话导致无法挂分析 | 脚本自动新建最小会话 |
| 多次运行产生重复记录 | `upsert` 基于 `sessionId`，幂等 |
| 阈值不适合真实数据分布 | dry-run 打印统计分布，必要时微调 |
| 前端标签仍只给 SHOW_CASE | 改为所有场景可见 |
