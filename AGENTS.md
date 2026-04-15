# Agent 约束文件

## 项目背景

教育交互网络可视化系统，基于三元交互模型（学生-教师-知识点）。技术栈：NestJS + SQL Server + React + D3.js。

---

## 技术约束

- **数据库**: SQL Server + Prisma ORM，连接通过 `@prisma/adapter-mssql`
- **后端框架**: NestJS，使用模块化架构（每个实体一个 module）
- **前端框架**: React + TypeScript + Vite
- **验证**: 统一使用 `zod` 进行请求校验（DTO schema）
- **API 风格**: RESTful，路径 `/api/v1/{resource}`，返回格式 `{ data, meta, error }`

---

## 命名规范

| 类型 | 规范 | 示例 |
|-----|------|-----|
| 后端文件 | kebab-case | `student-controller.ts` |
| 后端类/方法 | PascalCase / camelCase | `StudentService.findAll()` |
| 数据库表 | snake_case 复数 | `interaction_sessions` |
| API 路径 | snake_case | `/api/v1/student-cognitive-template` |
| 请求参数 | camelCase | `scenarioCode` |

---

## 代码规范

- **禁止**: `as any`、`@ts-ignore`、空 catch、删除测试掩盖问题
- **Controller**: 只做参数解析和响应转换，业务逻辑在 Service
- **Service**: 使用 `PrismaService` 操作数据库，返回统一格式 `{ data, meta, error }`
- **DTO**: 使用 `zod` schema 定义，Controller 层用 `.parse()` 验证
- **Prisma**: 用 `Decimal` 处理浮点数，用 `$transaction` 保证原子性

---

## 前端规范

- **组件**: 函数组件 + Hooks，不使用 class 组件
- **状态管理**: 组件内部 `useState`，服务层处理数据逻辑
- **D3 图谱**: 节点数据结构含 `val`(半径)、`group`(分组)、`type`(类型)
- **样式**: Tailwind CSS，按需引入，不做全局覆盖

---


## 关键文件位置

- 数据模型: `backend/prisma/schema.prisma`
- 后端入口: `backend/src/main.ts` (端口 3333)
- 前端入口: `frontend/index.tsx`
- 类型定义: `frontend/types.ts`
- 图谱类型: `backend/src/shared/types/graph-data.type.ts`

---

## 数据库注意事项

- `graph_nodes` 表通过 `nodeType` 区分实体类型，用扩展表存储详情
- `interactions` 表的复合唯一索引防止重复交互
- `CognitiveDimensionDef` 是枚举表，关联 `StudentCognitiveDimensionScore`

---

## MUST
- don't make docs unless I told you so
- 不要尝试npx prisma studio，因为MSSQL不支持Studio，只要知道能正常获取数据即可，通过scripts/db-explorer.ts查询数据库表。
- 全程使用test后缀的数据库表来作为测试开发，不要修改生产环境的数据库表。
- 生成的data文件放在`backend/datas/scripts_filterd`目录下。
- script文件统一放在`backend/scripts`目录下。
- 不要sql文件，使用prisma。
- don't create any new tables in the database. If you have to, ask me first.
- when you create script without I asking, please DELETE it after finishing the task.
- don't modify prisma schema unless I told you so.
