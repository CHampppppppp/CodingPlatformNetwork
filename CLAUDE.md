# CLAUDE.md

## 项目定位

教育交互网络可视化平台：把不同教育平台的数据统一映射为三元交互网络（学生-教师-知识点），再通过后端 API 提供给 React + D3 前端展示。

技术栈：NestJS + Prisma + MySQL/SQL Server + React + TypeScript + Vite + D3。

## 工作原则

- 默认中文沟通，代码、命令、变量名用英文。
- 先判断根因，再改代码；不要为了“能跑”绕过问题。
- 大改动先给方案，确认后再动手。
- 不要新增无关文档；用户明确要求写文档时才写。
- 不要删除、覆盖、回滚用户已有改动。

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
- 原始/生成数据：`backend/datas/script_filterd`
- 前端源码：`frontend`

新增目录前先明确：放什么、不放什么、命名规则。

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

## 场景约定

- 场景以数据库 `LearningScenario.code` 为准。
- 前端不要硬编码真实场景数据；可展示后端返回的 `nameZh`。
- `SHOW_CASE` 视为演示/展示场景；正式平台场景独立处理。

## 学生个人

- **个人维度分析**是 10 个聚合维度：知识储备、学习投入、认知负荷、学习动机、计算思维、人机信任度、学习方法倾向、学习态度、自我调节学习、人工智能素养。
- **个人学情画像**是 14 个原始/细分维度：阅读理解、语言表达、科学知识、科学探究、计算思维、技术素养、焦虑倾向、抑郁倾向、兴趣稳定性、学业压力、创新能力、问题解决能力、实践能力、协作能力。
- 不要混用两者：10维的个人维度分析用于维度分析展示和班级群体认知模版分析；14维的个人学情画像用于学情画像明细、专家干预策略。

## 代码规范

- 禁止：`as any`、`@ts-ignore`、空 `catch`、注释掉报错代码、删除测试掩盖问题。
- Controller 只做参数解析和响应转换；业务逻辑放 Service。
- DTO 请求校验使用 `zod`。
- API 返回保持 `{ data, meta, error }`。
- Prisma 金额/分数/强度等小数用 `Decimal`。
- 前端使用函数组件 + Hooks；D3 图谱节点保持 `id/type/name/group/val` 基础结构。

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
- 改完小单元后要验证并commit，方便rollback。
- 最终说明要列出改了什么、验证了什么、哪些事情没有做。
