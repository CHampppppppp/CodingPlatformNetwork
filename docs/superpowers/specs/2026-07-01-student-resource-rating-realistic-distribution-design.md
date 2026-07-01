# 学生资源评分真实分布改造设计

## 背景与问题

当前 `StudentResourceRate` 中的评分由 `backend/scripts/mock-student-resource-rates.ts` 统一生成，所有资源共用同一个以 85% 接受度为目标的 Beta 分布。虽然单条评分有浮动，但 API 返回的是**资源级平均分**；当同一资源有大量评分时，大数定律把平均值压回 84%–86%，导致前端看到的资源接受度几乎没有区分度，不符合真实场景。

用户希望评分能反映资源真实难度：简单资源接受度高，困难资源接受度低。

## 目标

1. 资源级平均接受度按难度分层：
   - **LOW（简单）**: 90%–100%
   - **MEDIUM（中等）**: 70%–90%
   - **HIGH（困难）**: 50%–70%
2. 所有资源汇总后的**整体平均接受度≈85%**。
3. 达到目标的方式基于**现有资源的真实难度分布**，不人为虚构资源比例。
4. 如果真实分布导致方程无解，脚本必须终止并报告，而不是强行造假。

## 约束

- 使用 `Resource` 表已有的 `difficulty` 字段（当前多为空）。
- 不修改 Prisma schema，不执行数据迁移。
- 新资源创建接口需要支持填写 `difficulty`。
- 保持评分 5 分制，保留两位小数。

## 方案设计

### 1. 难度标签定义

在 `Resource.difficulty` 中统一使用三个字符串值：

- `LOW`：简单资源
- `MEDIUM`：中等资源
- `HIGH`：困难资源

未设置或无法识别时，默认 `MEDIUM`。

### 2. 资源创建接口补全 difficulty

**文件**: `backend/src/modules/resource/resource.dto.ts`

在 `createResourceSchema` 中新增可选字段：

```ts
difficulty: z.enum(["LOW", "MEDIUM", "HIGH"]).optional().nullable(),
```

**文件**: `backend/src/modules/resource/resource.service.ts`

`createResource` 写入数据库时把 `difficulty` 带上：

```ts
difficulty: dto.difficulty ?? null,
```

### 3. 现有资源难度回填脚本（新增）

**文件**: `backend/scripts/backfill-resource-difficulty.ts`

作用：给当前 `difficulty IS NULL` 的资源批量打标签。

回填规则（可配置，按优先级匹配）：

1. 标题关键词匹配：
   - 含“入门”“基础”“简单”“初识”“导读” → `LOW`
   - 含“进阶”“提高”“挑战”“困难”“深入”“高级” → `HIGH`
   - 其余 → `MEDIUM`
2. 若标题无关键词，可按 `resourceType` 默认：
   - `VIDEO`、`ARTICLE` → `LOW`
   - `PRACTICE` → `MEDIUM`
   - `GAME` → `HIGH` 或 `MEDIUM`（可配置）

默认 dry-run，加 `--execute` 才写入。运行后打印各难度的资源数量及占比。

### 4. 评分生成脚本改造

**文件**: `backend/scripts/mock-student-resource-rates.ts`

改造后的评分流程：

```
读取 StudentKnowledgeRelation
  ↓
读取关联资源及其 difficulty
  ↓
统计全局难度分布：p_LOW, p_MEDIUM, p_HIGH
  ↓
求解目标接受度 a_LOW, a_MEDIUM, a_HIGH，满足：
  p_LOW*a_LOW + p_MEDIUM*a_MEDIUM + p_HIGH*a_HIGH = 85
  a_LOW ∈ [90,100], a_MEDIUM ∈ [70,90], a_HIGH ∈ [50,70]
  ↓
若无解 → 终止并提示
  ↓
对每个 (学生, 资源) 对生成评分：
  baseRate = a_difficulty / 100 * 5
  noise ~ Normal(0, σ=0.25)
  rate = clamp(baseRate + noise, 1, 5)
  rate = round(rate, 2)
```

#### 求解策略

为了结果稳定且可预期，按以下固定顺序取值并反推剩余变量：

1. 固定 `a_LOW = 95`（取 LOW 区间中点）
2. 固定 `a_HIGH = 60`（取 HIGH 区间中点）
3. 反推 `a_MEDIUM`：
   ```
   a_MEDIUM = (85 - p_LOW*95 - p_HIGH*60) / p_MEDIUM
   ```
4. 检查 `a_MEDIUM` 是否在 `[70, 90]` 内：
   - 若落在区间内，使用它。
   - 若高于 90，尝试把 `a_LOW` 下调到 90、`a_HIGH` 上调到 70 的边界组合，仍无解则终止。
   - 若低于 70，说明 HIGH 资源过多，无法在不造假的情况下达到 85%，脚本终止并报告真实分布。

如果希望更灵活，可引入一个小的“全局偏移”参数，但必须显式声明且默认禁用。

### 5. 输出与验证

脚本运行后（dry-run 和 execute 模式）均打印：

- 各难度资源数量与占比
- 各难度目标接受度
- 预计整体平均接受度
- 各难度评分样本的均值、标准差、最小/最大值

## 数据流

```
Resource (difficulty: LOW/MEDIUM/HIGH)
    ↓
backfill-resource-difficulty.ts （回填空值）
    ↓
mock-student-resource-rates.ts （按难度分布计算目标接受度并生成评分）
    ↓
StudentResourceRate (rate: 1.00-5.00)
    ↓
ResourceService.queryResources （聚合为 acceptanceRate）
    ↓
前端展示：按资源难度分层的接受度
```

## 测试与验证

1. **dry-run 验证**
   - 运行 `npx ts-node scripts/mock-student-resource-rates.ts --all`。
   - 确认输出中 LOW/MEDIUM/HIGH 三组的均值落在目标区间。
   - 确认整体预计平均接受度在 84%–86% 之间。

2. **数据库验证**
   - 执行写入后，抽样查询 `StudentResourceRate`。
   - 按资源难度分组统计 `acceptanceRate`：
     ```sql
     SELECT r.difficulty, AVG(srr.rate) / 5 * 100 as acceptance
     FROM student_resource_rates_test srr
     JOIN resources_test r ON r.id = srr.resourceId
     GROUP BY r.difficulty;
     ```
   - 结果应符合目标区间。

3. **无解场景验证**
   - 构造一个 HIGH 占比过高的测试数据集。
   - 运行脚本，确认脚本终止并打印清晰的错误信息。

## 风险与回退

- **风险**: 如果现有资源中 HIGH 占比过高，脚本可能无法达到 85% 目标而终止。
- **回退**: 用户可以调整回填规则（减少 HIGH 资源数量）或放宽目标均值，再重新运行。
- **数据安全**: 两个脚本都默认 dry-run，必须显式加 `--execute` 才会写入；写入前可先备份或清理旧评分。

## 实现文件清单

| 文件 | 改动类型 | 说明 |
|---|---|---|
| `backend/src/modules/resource/resource.dto.ts` | 修改 | 新增 `difficulty` 字段 |
| `backend/src/modules/resource/resource.service.ts` | 修改 | 创建资源时写入 `difficulty` |
| `backend/scripts/backfill-resource-difficulty.ts` | 新增 | 回填现有资源难度标签 |
| `backend/scripts/mock-student-resource-rates.ts` | 修改 | 按难度分布生成真实评分 |

## 后续可选优化

- 把 `difficulty` 枚举约束加入 Prisma schema，避免脏数据。
- 允许资源创建时根据标题自动推断 `difficulty`。
- 在评分生成中加入学生个体“打分严格度”因子，进一步增加真实感。
