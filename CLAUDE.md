# CLAUDE.md

## 项目定位

教育交互网络可视化平台：把不同教育平台的数据统一映射为三元交互网络（学生-教师-知识点），再通过后端 API 提供给 React + D3 前端展示。

**多源平台边界**：当前系统中的六个场景（含一个展示场景）中，五个正式场景分别对应五个不同的外部教学平台。各平台数据相互独立，仅共享统一的数据模型与可视化能力，不跨平台聚合或比较。

技术栈：NestJS + Prisma + MySQL/SQL Server + React + TypeScript + Vite + D3。

## 工作原则

- 默认中文沟通，代码、命令、变量名用英文。
- 先判断根因，再改代码；不要为了"能跑"绕过问题。
- 大改动先给方案，确认后再动手。
- 不要新增无关文档；用户明确要求写文档时才写。
- 不要删除、覆盖、回滚用户已有改动。
- **数据必须关联成闭环，禁止孤立/mock 式插入**：新增实体时要同步建立与上下级表的外键/关系（如班级-教师-学校-场景），避免只写主表而漏掉关联表。

## 红线

以下操作必须先问用户：

- 删除文件、目录、数据库数据或 git 历史。
- 修改 `.env`、密钥、token、CI/CD 配置。
- 修改 Prisma schema、执行迁移、执行 `db push --accept-data-loss`。
- 执行真实数据导入、清理、覆盖、批量 CRUD 数据库。
- `git push`、`git rebase`、`git reset --hard`、强制推送。
- 安装全局依赖、修改系统配置、生产发布。

## 项目结构约定

- 后端源码：`backend/src`
- 后端模块：`backend/src/modules/{module-name}`
- Prisma schema：`backend/prisma/schema.prisma`
- 脚本：`backend/scripts`
- 原始/生成数据：`backend/datas/`
- 前端源码：`frontend`（主入口 `App.tsx`，组件 `components/`，服务 `services/`）

新增目录前先明确：放什么、不放什么、命名规则。

## 数据库核心表

| 表 | 说明 |
|---|---|
| `learning_scenarios` | 学习场景 |
| `schools` / `grades` / `classes` | 组织层级 |
| `graph_nodes` | 三元网络节点（Student / Teacher / Knowledge） |
| `student_profiles` | 学生扩展属性 |
| `teacher_profiles` | 教师扩展属性 |
| `knowledge_profiles` | 知识点扩展属性 |
| `interaction_sessions` | 交互会话 |
| `interactions` | 三元有向边 |
| `student_cognitive_profiles` | 学生认知能力画像 |
| `student_cognitive_dimension_scores` | 认知维度得分 |
| `cognitive_dimension_defs` | 认知维度定义 |
| `resources` | 学习资源 |
| `resource_knowledge_relations` | 资源-知识点关联 |
| `student_resource_rates` | 学生对资源评分 |
| `student_knowledge_relations` | 学生-知识点学习关系 |
| `student_works` | 学生作品 |
| `session_classroom_analyses` | 课堂视频自动分析报告 |

## 数据导入约定

不同平台原始数据格式可以不同，但进入系统前必须转为统一中间模型。

```text
Excel/CSV/JSON
  -> platform adapter
  -> NormalizedPlatformData
  -> IngestionService
  -> database
```

- 平台解析逻辑放：`backend/src/modules/ingestion/adapters`
- 统一中间类型放：`backend/src/modules/ingestion/types`
- 统一入库逻辑放：`backend/src/modules/ingestion/services`
- `backend/scripts/import-{platform}.ts` 只能做薄入口：加载 adapter、调用 `IngestionService`、打印结果。
- 不要在平台脚本里直接写大量 `prisma.*.create()` 入库逻辑。
- Excel/CSV 都应由 adapter 读取并转成 `NormalizedPlatformData`。
- **入库时必须保证关系闭环**：班级必须关联年级/学校/场景，教师必须关联班级/学校/场景，交互必须关联会话与源/目标节点，不能只插主表而漏掉外键与扩展表。

## 场景约定

- 场景以数据库 `LearningScenario.code` 为准。
- 前端不要硬编码真实场景数据；可展示后端返回的 `nameZh`。
- `SHOW_CASE` 视为演示/展示场景；正式平台场景独立处理。
- **六个场景（含 SHOW_CASE）中学生、教师、班级、交互必须按 `scenarioId` 隔离，禁止跨场景聚合。**
- **知识点与资源可跨场景共享**，以缓解单平台数据稀疏问题。
- 外部平台原始 ID（如 `externalUserId`、班级名称）仅在同一 `scenarioId` 内保证唯一性，查询时必须带场景作用域。

## 学生个人

- **个人维度分析**是 10 个聚合维度：知识储备、学习投入、认知负荷、学习动机、计算思维、人机信任度、学习方法倾向、学习态度、自我调节学习、人工智能素养。
- **个人学情画像**是 16 个原始/细分维度（基础维度）：阅读理解、语言表达、科学知识、科学探究、计算思维、技术素养、焦虑倾向、抑郁倾向、心理韧性、兴趣稳定性、学业压力、生活满意度、创新能力、问题解决能力、实践能力、协作能力。
- 不要混用两者：10 维的个人维度分析用于维度分析展示和班级群体认知模版分析；16 维的个人学情画像用于学情画像明细、专家干预策略。

### 个人维度分析计算公式

10 个个人维度分析由 16 个基础维度聚合而来，通用规则为：

```text
聚合维度得分 = 参与计算的基础维度有效得分平均值 × 0.5
```

其中"有效得分"指该基础维度得分存在且大于 0；若全部缺失或均为 0，则该聚合维度得分为 0。

| 个人维度分析 | 聚合维度代码 | 参与计算的基础维度 | 具体公式 |
|---|---|---|---|
| 知识储备 | `knowledgeReserve` | 阅读理解、语言表达、科学知识 | `(COG_READING + COG_LANGUAGE + COG_SCIENCE_KNOWLEDGE) / 3 × 0.5` |
| 学习投入 | `learningEngagement` | 科学探究、实践能力、协作能力 | `(COG_SCIENCE_INQUIRY + PRAC_PRACTICE + PRAC_COLLABORATION) / 3 × 0.5` |
| 认知负荷 | `cognitiveLoad` | 焦虑倾向、抑郁倾向、学业压力、生活满意度 | `(PSY_ANXIETY + PSY_DEPRESSION + PSY_PRESSURE + PSY_LIFE_SATISFACTION) / 4 × 0.5` |
| 学习动机 | `learningMotivation` | 心理韧性、兴趣稳定性 | `(PSY_RESILIENCE + PSY_INTEREST_STABILITY) / 2 × 0.5` |
| 计算思维 | `computationalThinking` | 计算思维 | `COG_COMPUTATIONAL × 0.5` |
| 人机信任度 | `humanAiTrust` | 技术素养 | `COG_TECH_LITERACY × 0.5` |
| 学习方法倾向 | `learningMethod` | 问题解决能力、协作能力 | `(PRAC_PROBLEM_SOLVING + PRAC_COLLABORATION) / 2 × 0.5` |
| 学习态度 | `learningAttitude` | 创新能力 | `PRAC_INNOVATION × 0.5` |
| 自我调节学习 | `selfRegulatedLearning` | 问题解决能力 | `PRAC_PROBLEM_SOLVING × 0.5` |
| 人工智能素养 | `aiLiteracy` | 技术素养 | `COG_TECH_LITERACY × 0.5` |

实现位置：`backend/src/shared/utils/cognitive-dimensions.ts`。

## 课堂视频分析

课堂视频分析引擎对每个 `InteractionSession` 生成九维度自动评估报告（`SessionClassroomAnalysis`），覆盖：

- 知识激活率（`knowledgeActivationRate`）
- 行为参与度（`behavioralEngagementLevel`）
- 认知参与度（`cognitiveEngagementLevel`）
- 概念发展水平（`conceptDevelopmentLevel`）
- 反馈质量（`feedbackQualityLevel`）
- 学业期望（`academicExpectationLevel`）
- 教师流畅度（`teacherFluencyLevel`）
- 社交情感指标（倦怠 `hasBurnout`、沮丧 `hasFrustration`）
- 课堂管理维度（自我意识、自我管理、集体管理、规则明确度、正向强化、负向消减）
- 提问类型统计（封闭/应用/开放）
- 反馈类型统计（接纳/表扬/拓展/纠正）

脚本入口：`backend/scripts/verify-classroom-analysis.ts`、`backend/scripts/mock-classroom-analysis.ts`。

## Chatbot 维度增量

学生与 AI 聊天机器人互动后，系统支持 10 个聚合维度的增量更新。前端 `AnalysisPanel` 展示每个维度的变化 delta 和理由。

- 后端：`backend/src/modules/student/chatbot-dimension.service.ts`
- 前端：`services/apiService.ts`（真实接口）、`services/chatbotDimensionDemo.ts`（演示模式）
- 前端通过 `DEMO_CHATBOT_INCREMENT` 开关切换演示/真实模式
- 增量数据缓存在 `localStorage` 中（key: `chatbot-increment-scores`）

## 代码规范

- 禁止：`as any`、`@ts-ignore`、空 `catch`、注释掉报错代码、删除测试掩盖问题。
- Controller 只做参数解析和响应转换；业务逻辑放 Service。
- DTO 请求校验使用 `zod`。
- API 返回保持 `{ data, meta, error }`。
- Prisma 金额/分数/强度等小数用 `Decimal`。
- 前端使用函数组件 + Hooks；D3 图谱节点保持 `id/type/name/group/val` 基础结构，`type` 取值 `STUDENT | TEACHER | KNOWLEDGE`。

## 验证命令

改后端后至少运行：

```bash
cd backend && npm run build
```

改前端后至少运行：

```bash
cd frontend && npm run build
```

改导入脚本但不执行真实导入时，优先做只编译检查。

## Git 纪律

- 工作区可能已有用户改动；只处理本任务相关文件。
- 改完小单元后要验证并 commit，方便 rollback。
- 最终说明要列出改了什么、验证了什么、哪些事情没有做。
