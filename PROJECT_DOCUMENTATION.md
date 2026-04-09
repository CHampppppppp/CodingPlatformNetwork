# 交互网络可视化系统 - 项目详细文档

## 项目概述

**交互网络可视化系统**是一个教育技术平台，用于可视化和分析学生学习场景中的交互网络。该系统采用三元交互模型（学生-教师-知识点），通过网络图谱展示师生互动、生生协作和人机/自主学习等多种学习模式。

---

## 1. 系统架构

### 1.1 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| **后端** | NestJS + TypeScript | 模块化后端框架 |
| **数据库** | SQL Server + Prisma ORM | 关系型数据库 |
| **前端** | React + TypeScript | UI框架 |
| **可视化** | D3.js | 网络图谱渲染 |
| **构建工具** | Vite | 前端构建 |
| **样式** | Tailwind CSS | 原子化CSS |

### 1.2 目录结构

```
CodingPlatformNetwork/
├── backend/                          # 后端服务
│   ├── prisma/
│   │   ├── schema.prisma            # 数据模型定义
│   │   └── migrations/              # 数据库迁移
│   ├── src/
│   │   ├── main.ts                  # 应用入口
│   │   ├── app.module.ts            # 根模块
│   │   ├── modules/                  # 功能模块
│   │   │   ├── graph/              # 图谱模块
│   │   │   ├── interaction/        # 交互模块
│   │   │   ├── interaction-session/ # 交互会话模块
│   │   │   ├── node/               # 节点模块
│   │   │   ├── org/                # 组织模块
│   │   │   ├── scenario/           # 场景模块
│   │   │   └── student/            # 学生模块
│   │   └── shared/                  # 共享资源
│   │       ├── types/              # 类型定义
│   │       └── utils/              # 工具函数
│   └── package.json
├── frontend/                         # 前端应用
│   ├── components/                  # React组件
│   │   ├── NetworkGraph.tsx        # 网络图谱组件
│   │   └── AnalysisPanel.tsx       # 分析面板组件
│   ├── services/                    # 服务层
│   │   ├── apiService.ts           # API通信
│   │   ├── dataService.ts          # 数据处理
│   │   ├── dataValidator.ts        # 数据验证
│   │   ├── dataParser.ts           # 数据解析
│   │   ├── dataConfig.ts           # 配置
│   │   ├── performanceUtils.ts     # 性能工具
│   │   ├── realData.ts             # 真实数据
│   │   └── strategies.ts           # 策略
│   ├── App.tsx                     # 主应用组件
│   ├── index.tsx                   # 入口文件
│   ├── types.ts                    # 类型定义
│   └── package.json
└── README.md
```

---

## 2. 数据模型详解

系统采用 **三元交互网络** 模型，核心实体包括：

### 2.1 实体关系图

```
LearningScenario (学习场景)
       │
       ├── GraphNode (网络节点)
       │      ├── StudentProfile (学生扩展属性)
       │      ├── TeacherProfile (教师扩展属性)
       │      └── KnowledgeProfile (知识点扩展属性)
       │
       └── InteractionSession (交互会话)
              │
              └── Interaction (交互边)
```

### 2.2 核心数据模型

#### LearningScenario - 学习场景
| 字段 | 类型 | 说明 |
|-----|------|------|
| id | String | 唯一标识 (CUID) |
| code | String | 场景代码 (唯一) |
| nameZh | String | 中文名称 |
| sortOrder | Int | 排序权重 |
| isActive | Boolean | 是否启用 |

**预置场景**：
- 展示场景
- 学科课程在线学习
- 课后线上教师授课答疑
- 家庭在线学习
- 在线协作学习
- 社团课等非正式学习

#### GraphNode - 网络节点 (核心)
| 字段 | 类型 | 说明 |
|-----|------|------|
| id | String | 唯一标识 |
| nodeType | String | 节点类型：Student/Teacher/Knowledge |
| displayName | String | 显示名称 |
| scenarioId | String | 所属场景 |
| schoolId | String? | 学校ID |
| gradeId | String? | 年级ID |
| classId | String? | 班级ID |

**节点类型**：
- `STUDENT` - 学生节点 (val=8, group=3)
- `TEACHER` - 教师节点 (val=25, group=1)
- `KNOWLEDGE` - 知识点节点 (val=15, group=2)

#### Interaction - 交互边
| 字段 | 类型 | 说明 |
|-----|------|------|
| id | String | 唯一标识 |
| sourceNodeId | String | 源节点 |
| targetNodeId | String | 目标节点 |
| interactionType | String | 交互类型：PHYSICAL/PLATFORM |
| strength | Decimal | 交互强度/频次 |
| actionType | String? | 动作细分子类型 |
| durationSec | Int? | 持续时长(秒) |

**交互类型**：
- `PHYSICAL` - 物理空间采集（实线）
- `PLATFORM` - 平台采集（虚线）

#### InteractionSession - 交互会话
| 字段 | 类型 | 说明 |
|-----|------|------|
| id | String | 唯一标识 |
| scenarioId | String | 场景ID |
| schoolId | String | 学校ID |
| gradeId | String | 年级ID |
| classId | String? | 班级ID |
| sessionName | String? | 会话名称 |
| occurredAt | DateTime | 发生时间 |

#### 组织结构
```
School (学校)
  └── Grade (年级)
         └── SchoolClass (班级)
```

#### 学生认知模型
```
GraphNode (nodeType=Student)
  └── StudentProfile (学习风格/性格/行为)
  └── StudentCognitiveProfile (认知画像)
         └── StudentCognitiveDimensionScore (各维度得分)
               └── CognitiveDimensionDef (维度定义)
```

**认知维度**：
| 维度代码 | 中文名称 |
|---------|---------|
| knowledgeReserve | 知识储备 |
| learningEngagement | 学习投入 |
| cognitiveLoad | 认知负荷 |
| learningMotivation | 学习动机 |
| computationalThinking | 计算思维 |
| humanAiTrust | 人机信任度 |
| learningMethod | 学习方法倾向 |
| learningAttitude | 学习态度 |

---

## 3. API接口规范

### 3.1 图谱数据接口

**GET** `/api/v1/graph-data`

获取指定条件的图谱数据。

| 参数 | 类型 | 说明 |
|-----|------|------|
| scenario_code | string | 场景代码 |
| school_id | string | 学校ID |
| grade_id | string | 年级ID |
| class_id | string | 班级ID |
| from | string | 开始时间 (ISO) |
| to | string | 结束时间 (ISO) |

**响应结构**：
```typescript
{
  data: {
    nodes: Node[],           // 节点列表
    links: Link[],          // 边列表
    meta: {
      nodeCount: number,     // 节点总数
      linkCount: number,     // 边总数
      scenarioCode: string   // 场景代码
    }
  },
  meta: null,
  error: null
}
```

### 3.2 场景统计接口

**GET** `/api/v1/graph-data/scenario-stats`

获取各场景的统计信息。

**响应结构**：
```typescript
{
  data: [{
    scenarioCode: string,
    scenarioNameZh: string,
    nodeCount: number,
    linkCount: number,
    avgStrength: number,
    density: number,
    studentTeacherRatio: number
  }]
}
```

### 3.3 交互管理接口

**GET** `/api/v1/interactions`

查询交互记录列表。

**POST** `/api/v1/interactions/batchCreate`

批量创建交互记录。

```typescript
{
  sessionId: string,
  items: [{
    sourceNodeId: string,
    targetNodeId: string,
    interactionType: "PHYSICAL" | "PLATFORM",
    strength: number,
    actionType?: string,
    durationSec?: number
  }]
}
```

### 3.4 交互会话接口

**POST** `/api/v1/interaction-sessions`

创建新的交互会话。

**GET** `/api/v1/interaction-sessions`

查询交互会话列表。

### 3.5 节点管理接口

**GET** `/api/v1/nodes`

查询节点列表。

**POST** `/api/v1/nodes`

创建新节点。

### 3.6 学生认知接口

**GET** `/api/v1/students/:id/cognitive-template`

获取学生的最新认知模板。

### 3.7 组织架构接口

**GET** `/api/v1/org/schools` - 获取学校列表

**GET** `/api/v1/org/grades?school_id=xxx` - 获取年级列表

**GET** `/api/v1/org/classes?grade_id=xxx` - 获取班级列表

**GET** `/api/v1/org/hierarchy` - 获取完整组织层级

### 3.8 场景接口

**GET** `/api/v1/scenarios`

获取所有启用的学习场景。

---

## 4. 前端模块详解

### 4.1 主应用组件 (App.tsx)

主应用组件管理以下状态：

| 状态 | 类型 | 说明 |
|-----|------|------|
| scenario | Scenario | 当前学习场景 |
| classInfo | ClassInfo | 学校/年级/班级选择 |
| graphData | GraphData | 图谱数据 |
| resources | Resource[] | 学习资源列表 |
| selectedNode | GraphNode? | 选中的节点 |
| highlightedNodeIds | string[] | 高亮节点ID列表 |
| studentAcceptance | Record | 学生接受度记录 |

**核心功能**：
1. 场景切换和班级筛选
2. 图谱数据加载和缓存
3. 节点点击和详情展示
4. 资源关联和接受度计算
5. 分析面板切换

### 4.2 网络图谱组件 (NetworkGraph.tsx)

基于 D3.js 实现的力导向图。

**功能特性**：
- 节点拖拽交互
- 缩放/平移操作
- 节点高亮效果
- 交互类型区分（实线/虚线）
- 节点大小映射 (val)
- 学生接受度颜色编码

**节点颜色映射**：
| 类型 | 颜色 |
|-----|------|
| TEACHER | #7c3aed (Violet) |
| KNOWLEDGE | #059669 (Emerald) |
| STUDENT | #94a3b8 (Slate) |

**接受度颜色**：
- 高接受度: #22c55e (Green)
- 低接受度: #ef4444 (Red)

### 4.3 分析面板组件 (AnalysisPanel.tsx)

提供全局统计和子图透视两大功能。

**全局概览**：
- 节点概况统计
- 资源推荐分析
- 班级群体认知模板分析
- 满意度调查分析

**子图透视**：
- 知识热点图 (度中心性)
- 交互模式结构
- 数据来源分布
- 群体关注度分布
- 学习模式演化趋势

### 4.4 服务层

#### apiService.ts
封装所有API调用：
- `fetchGraphData()` - 获取图谱数据
- `fetchSchools()` - 获取学校列表
- `fetchGradesBySchool()` - 获取年级列表
- `fetchClassesBySchoolAndGrade()` - 获取班级列表
- `fetchStudentCognitiveTemplate()` - 获取学生认知模板

#### dataService.ts
数据处理服务：
- 输入验证 (validateScenario, validateClassInfo)
- 数据转换 (transformGraphData)
- 数据清理 (sanitizeGraphData)
- 资源生成 (generateResources)
- 缓存管理

#### dataValidator.ts
使用 Zod 进行运行时验证。

#### performanceUtils.ts
性能优化工具：
- `debounce()` - 防抖函数
- `withCache()` - 带缓存的异步函数
- `generateCacheKey()` - 缓存键生成

---

## 5. 核心业务逻辑

### 5.1 图谱数据查询流程

```
1. 接收查询参数 (scenarioCode, schoolId, gradeId, classId, from, to)
2. 构建会话查询条件 (buildSessionWhere)
3. 查询符合条件的会话
4. 从会话中提取节点和边
5. 补充查询直接关联的节点(含未参与交互的教师节点)
6. 构建节点Map去重
7. 转换为前端需要的图谱格式
8. 返回 {nodes, links, meta}
```

### 5.2 节点转换规则

```typescript
putNode(nodeMap, node, schoolNames, gradeNames, classNames) {
  // 学生节点
  if (nodeType === "STUDENT") {
    return {
      id, type: "STUDENT", name,
      group: 3, val: 8,
      studentProfile: { school, grade, classId, learningStyle... }
    }
  }
  
  // 教师节点
  if (nodeType === "TEACHER") {
    return {
      id, type: "TEACHER", name,
      group: 1, val: 25,
      teacherProfile: { school, teachingGrade, teachingClass, subject }
    }
  }
  
  // 知识点节点
  return {
    id, type: "KNOWLEDGE", name,
    group: 2, val: 15,
    knowledgeProfile: { content, type, category, parentId }
  }
}
```

### 5.3 场景统计计算

```typescript
for (scenario of scenarios) {
  // 查询该场景的会话
  sessions = findSessions(scenario.id, filters)
  
  // 查询会话中的所有交互
  interactions = findInteractions(sessions)
  
  // 统计
  nodeCount = unique(nodeIds)
  linkCount = interactions.length
  avgStrength = totalStrength / linkCount
  density = linkCount / (nodeCount * (nodeCount - 1))
  studentTeacherRatio = studentCount / teacherCount
}
```

### 5.4 资源关联计算

当点击某个知识点资源时：
1. 找到该资源关联的所有知识点ID
2. 遍历所有边，找出与这些知识点相连的学生节点
3. 根据资源准确率计算每个学生的接受概率
4. 高亮相关知识点和学生节点

---

## 6. 命名规范

### 6.1 后端命名

| 类型 | 规范 | 示例 |
|-----|------|-----|
| 类名/接口名 | PascalCase | `StudentService` |
| 方法名/变量名 | camelCase | `findAllStudents` |
| 常量 | UPPER_SNAKE_CASE | `MAX_PAGE_SIZE` |
| 文件名 | kebab-case | `student-controller.ts` |
| 数据库表名 | snake_case (复数) | `students` |
| 数据库字段 | snake_case | `learning_engagement` |

### 6.2 API命名

| 类型 | 规范 | 示例 |
|-----|------|-----|
| URL路径 | snake_case | `/api/v1/students` |
| 查询参数 | snake_case | `teacher_id` |
| 请求体 | camelCase | `teacherId` |
| 响应字段 | camelCase | `studentProfile` |

---

## 7. 环境配置

### 7.1 后端环境变量 (.env)

```env
DATABASE_URL=sqlserver://localhost:1433;database=interaction_network;user=sa;password=xxx
```

### 7.2 启动命令

**后端**：
```bash
cd backend
pnpm install
pnpm start:dev  # 开发模式 (监听)
pnpm build && pnpm start:prod  # 生产模式
```

**前端**：
```bash
cd frontend
pnpm install
pnpm dev        # 开发模式
pnpm build      # 生产构建
```

---

## 8. 依赖清单

### 后端核心依赖

| 包 | 版本 | 用途 |
|----|-----|-----|
| @nestjs/core | ^10.0.0 | NestJS核心 |
| @prisma/client | ^7.5.0 | Prisma ORM |
| @prisma/adapter-mssql | ^7.5.0 | SQL Server适配器 |
| zod | ^3.0.0 | 数据验证 |
| xlsx | ^0.18.5 | Excel处理 |
| @faker-js/faker | ^10.3.0 | 测试数据生成 |

### 前端核心依赖

| 包 | 版本 | 用途 |
|----|-----|-----|
| react | ^18.2.0 | React框架 |
| d3 | ^7.9.0 | 数据可视化 |
| lucide-react | ^0.563.0 | 图标库 |
| zod | ^3.0.0 | 数据验证 |
| xlsx | ^0.18.5 | Excel处理 |

---

## 9. 数据库索引

为优化查询性能，系统定义了以下索引：

```prisma
// GraphNode
@@index([nodeType])
@@index([scenarioId])
@@index([schoolId, gradeId, classId])

// InteractionSession
@@index([scenarioId, occurredAt])
@@index([schoolId, gradeId, classId, occurredAt])

// Interaction
@@index([sessionId])
@@index([sourceNodeId, targetNodeId])
@@index([interactionType, createdAt])
@@unique([sessionId, sourceNodeId, targetNodeId, interactionType, actionType])

// StudentCognitiveProfile
@@index([studentNodeId, generatedAt(sort: Desc)])
```

---

## 10. 缓存策略

### OrgService 内存缓存

```typescript
class MemoryCache {
  private cache: Map<string, CacheItem>
  get(key)           // 获取缓存
  set(key, data, ttl = 3600000)  // 设置缓存 (默认1小时)
  delete(key)        // 删除缓存
  clear()            // 清空缓存
}
```

### 前端数据缓存

```typescript
// 带缓存的异步调用
const data = await withCache(cacheKey, async () => {
  return fetchFromApi();
});
```

---

## 11. 组件交互流程

### 11.1 班级选择流程

```
用户选择学校 → 加载年级列表 → 用户选择年级 → 加载班级列表 → 用户选择班级 → 触发数据加载
```

### 11.2 节点点击流程

```
点击节点 → 判断节点类型
  ├─ 学生节点 → 加载认知模板 → 显示学生详情面板
  ├─ 知识点节点 → 显示知识点详情 → 显示关联资源
  └─ 教师节点 → 显示教师详情面板
```

### 11.3 资源点击流程

```
点击资源 → 获取关联知识点ID → 计算相连学生 → 根据准确率计算接受度 → 高亮节点 → 更新图谱颜色
```

---

## 12. 待扩展功能

- [ ] 通义千问大模型集成
- [ ] 更多认知维度支持
- [ ] 实时交互数据同步
- [ ] 导出分析报告

---

## 13. 联系方式

如有问题，请联系项目维护团队。