# 教育交互网络可视化系统 - 数据库结构文档

## 数据库概览

- **数据库类型**: SQL Server (MSSQL)
- **连接地址**: rm-bp10v29fkj305q3smfo.sqlserver.rds.aliyuncs.com:3433
- **数据库名**: interaction_network
- **ORM**: Prisma
- **当前数据状态**:
  - 📚 学习场景: 6 个
  - 👨‍🎓 学生节点: 31 个
  - 👨‍🏫 教师节点: 2 个
  - 📖 知识点节点: 5 个（刚初始化）
  - 🏫 学校: 2 个
  - 📊 年级: 1 个（8年级）
  - 🏠 班级: 1 个（1班）

---

## 核心数据模型

### 1. 学习场景 (LearningScenario)

定义不同的学习场景类型。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String (CUID) | 主键 |
| `code` | String (Unique) | 场景代码: SHOW_CASE, ONLINE_COURSE, TEACHER_QA, HOME_LEARNING, COLLABORATIVE_LEARNING, INFORMAL_LEARNING |
| `nameZh` | String | 场景中文名 |
| `sortOrder` | Int | 排序顺序 |
| `isActive` | Boolean | 是否启用 |
| `createdAt` | DateTime | 创建时间 |
| `updatedAt` | DateTime | 更新时间 |

**关系**:
- 一对多 → `InteractionSession` (交互会话)
- 一对多 → `GraphNode` (图谱节点)

---

### 2. 图谱节点 (GraphNode) ⭐ 核心表

存储所有类型的节点（学生、教师、知识点）。这是整个系统的核心表。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String (CUID) | 主键 |
| `nodeType` | String | 节点类型: **Student** / **Teacher** / **Knowledge** |
| `displayName` | String | 显示名称 |
| `scenarioId` | String | 所属场景ID (外键) |
| `schoolId` | String? | 学校ID (学生/教师有，知识点为null) |
| `gradeId` | String? | 年级ID |
| `classId` | String? | 班级ID |
| `createdAt` | DateTime | 创建时间 |
| `updatedAt` | DateTime | 更新时间 |

**关系**:
- 多对一 → `LearningScenario` (学习场景)
- 一对多 → `Interaction` (作为sourceNode)
- 一对多 → `Interaction` (作为targetNode)
- 一对一 → `StudentProfile` (学生档案)
- 一对一 → `TeacherProfile` (教师档案)
- 一对一 → `KnowledgeProfile` (知识点档案)
- 一对多 → `StudentCognitiveProfile` (认知画像)

**重要设计**:
- 使用 **单表继承** 模式存储不同类型的节点
- 通过 `nodeType` 字段区分类型
- 知识点是**全局数据**，`schoolId`/`gradeId`/`classId` 均为 null
- 学生和教师属于特定班级，这些字段有值

---

### 3. 学生档案 (StudentProfile)

学生节点的扩展信息（1:1 关联 GraphNode）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `nodeId` | String (PK) | 关联的 GraphNode ID |
| `learningStylePreference` | String? | 学习风格偏好 |
| `personality` | String? | 性格 |
| `groupBehavior` | String? | 小组行为 |
| `createdAt` | DateTime | 创建时间 |
| `updatedAt` | DateTime | 更新时间 |

---

### 4. 教师档案 (TeacherProfile)

教师节点的扩展信息（1:1 关联 GraphNode）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `nodeId` | String (PK) | 关联的 GraphNode ID |
| `subject` | String? | 教学科目 |
| `teachingGrade` | Int? | 授课年级 |
| `teachingClass` | String? | 授课班级 |
| `createdAt` | DateTime | 创建时间 |
| `updatedAt` | DateTime | 更新时间 |

---

### 5. 知识点档案 (KnowledgeProfile)

知识点节点的扩展信息（1:1 关联 GraphNode）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `nodeId` | String (PK) | 关联的 GraphNode ID |
| `content` | String? | 知识点具体内容/操作步骤 |
| `knowledgeType` | String? | 知识点类型: "知识单元" / "知识点" |
| `category` | String? | 分类: "信息技术" / "数学" / "语文" 等 |
| `parentNodeId` | String? | 父级知识点ID（支持树状结构） |
| `createdAt` | DateTime | 创建时间 |
| `updatedAt` | DateTime | 更新时间 |

**当前数据**:
```
1. Word文档编辑 - 信息技术 - 知识单元
2. Excel数据处理 - 信息技术 - 知识点
3. 分数加减法 - 数学 - 知识点
4. 网络基础知识 - 信息技术 - 知识单元
5. 人工智能入门 - 信息技术 - 知识点
```

---

### 6. 交互关系 (Interaction) ⭐ 核心表

存储节点之间的交互关系（有向边）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String (CUID) | 主键 |
| `sessionId` | String | 所属会话ID |
| `sourceNodeId` | String | 源节点ID |
| `targetNodeId` | String | 目标节点ID |
| `interactionType` | String | 交互类型: **PHYSICAL** (物理空间) / **PLATFORM** (平台采集) |
| `actionType` | String? | 动作子类型 |
| `strength` | Decimal | 交互强度/频次 (权重) |
| `durationSec` | Int? | 持续时间(秒) |
| `createdAt` | DateTime | 创建时间 |

**关系**:
- 多对一 → `InteractionSession` (交互会话)
- 多对一 → `GraphNode` (sourceNode)
- 多对一 → `GraphNode` (targetNode)

**示例交互**:
- 教师 → 学生: 授课互动
- 学生 → 知识点: 学习互动
- 学生 → 学生: 协作学习

---

### 7. 交互会话 (InteractionSession)

记录某场景下某班级的完整交互会话。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String (CUID) | 主键 |
| `scenarioId` | String | 场景ID |
| `schoolId` | String | 学校ID |
| `gradeId` | String | 年级ID |
| `classId` | String? | 班级ID |
| `sessionName` | String? | 会话名称 |
| `occurredAt` | DateTime | 发生时间 |
| `createdAt` | DateTime | 创建时间 |

**关系**:
- 多对一 → `LearningScenario` (学习场景)
- 一对多 → `Interaction` (交互记录)

---

### 8. 组织层级表

#### 学校 (School)
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String (CUID) | 主键 |
| `name` | String (Unique) | 学校名称 |
| `createdAt` | DateTime | 创建时间 |

#### 年级 (Grade)
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String (CUID) | 主键 |
| `schoolId` | String | 所属学校ID |
| `gradeName` | Int | 年级名称 (如: 8) |
| `createdAt` | DateTime | 创建时间 |

#### 班级 (SchoolClass)
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String (CUID) | 主键 |
| `gradeId` | String | 所属年级ID |
| `className` | String | 班级名称 (如: "1班") |
| `createdAt` | DateTime | 创建时间 |

**当前数据**:
- 学校: zkz
- 年级: 8年级
- 班级: 1班

---

### 9. 认知能力相关表

#### 认知维度定义 (CognitiveDimensionDef)
定义可测量的认知能力维度。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String (CUID) | 主键 |
| `dimensionCode` | String (Unique) | 维度代码 |
| `dimensionNameZh` | String | 维度中文名 |
| `category` | String | 分类 |
| `minScore` | Decimal | 最小分数 |
| `maxScore` | Decimal | 最大分数 |
| `sortOrder` | Int | 排序 |
| `isActive` | Boolean | 是否启用 |

**维度示例**:
- `knowledgeReserve` - 知识储备
- `learningEngagement` - 学习投入
- `cognitiveLoad` - 认知负荷
- `learningMotivation` - 学习动机
- `computationalThinking` - 计算思维
- `humanAiTrust` - 人机信任度
- `learningMethod` - 学习方法倾向
- `learningAttitude` - 学习态度

#### 学生认知画像 (StudentCognitiveProfile)
学生的认知能力评估结果（按版本）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String (CUID) | 主键 |
| `studentNodeId` | String | 学生节点ID |
| `profileVersion` | String | 画像版本 |
| `generatedAt` | DateTime | 生成时间 |
| `totalScore` | Decimal | 综合得分 |
| `createdAt` | DateTime | 创建时间 |

#### 认知维度得分 (StudentCognitiveDimensionScore)
具体维度的得分记录。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String (CUID) | 主键 |
| `profileId` | String | 画像ID |
| `dimensionCode` | String | 维度代码 |
| `scoreValue` | Decimal | 分数值 |
| `scoreLevel` | String | 评级 (高/中/低) |
| `createdAt` | DateTime | 创建时间 |

---

## 数据关系图

```
LearningScenario (学习场景)
├── GraphNode (节点) [1:N]
│   ├── StudentProfile (学生档案) [1:1]
│   ├── TeacherProfile (教师档案) [1:1]
│   └── KnowledgeProfile (知识点档案) [1:1]
└── InteractionSession (交互会话) [1:N]
    └── Interaction (交互) [1:N]
        ├── sourceNode → GraphNode
        └── targetNode → GraphNode

School (学校)
└── Grade (年级) [1:N]
    └── SchoolClass (班级) [1:N]

GraphNode (学生)
└── StudentCognitiveProfile (认知画像) [1:N]
    └── StudentCognitiveDimensionScore (维度得分) [1:N]
        └── CognitiveDimensionDef (维度定义) [N:1]
```

---

## 关键查询示例

### 1. 查询某班级的所有节点
```sql
-- 查询8年级1班的所有学生和教师
SELECT * FROM graph_nodes
WHERE schoolId = 'xxx' 
  AND gradeId = 'xxx' 
  AND classId = 'xxx'
  AND nodeType IN ('Student', 'Teacher');

-- 查询该场景下的所有知识点（全局数据）
SELECT * FROM graph_nodes
WHERE scenarioId = 'xxx'
  AND nodeType = 'Knowledge'
  AND schoolId IS NULL;
```

### 2. 查询交互网络
```sql
-- 查询某班级的所有交互关系
SELECT i.*, s.displayName as sourceName, t.displayName as targetName
FROM interactions i
JOIN graph_nodes s ON i.sourceNodeId = s.id
JOIN graph_nodes t ON i.targetNodeId = t.id
JOIN interaction_sessions ses ON i.sessionId = ses.id
WHERE ses.gradeId = 'xxx' AND ses.classId = 'xxx';
```

### 3. 查询学生认知画像
```sql
-- 查询某学生的最新认知画像
SELECT * FROM student_cognitive_profiles
WHERE studentNodeId = 'xxx'
ORDER BY generatedAt DESC
LIMIT 1;
```

---

## 数据管理脚本

### 检查知识点数据
```bash
cd backend
export DATABASE_URL="your-database-url"
npx ts-node scripts/check-knowledge.ts
```

### 初始化知识点数据
```bash
cd backend
export DATABASE_URL="your-database-url"
npx ts-node scripts/seed-knowledge.ts
```

---

## 注意事项

1. **知识点是全局数据**: 不属于特定班级，查询时要单独处理
2. **交互是有向的**: source → target 表示从源到目标的交互
3. **单表继承设计**: GraphNode 表通过 nodeType 区分不同类型
4. **数据一致性**: 节点和档案是 1:1 关系，创建节点时必须同时创建档案
