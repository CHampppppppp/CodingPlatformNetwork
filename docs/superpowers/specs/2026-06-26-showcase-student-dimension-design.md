# SHOW_CASE 学生个人维度得分去同质化设计

## 背景
当前 SHOW_CASE 场景下，学生个人画板的“个人维度分析”默认展示全局硬编码的学期前得分（`SEMESTER_BEFORE_SCORES`），所有学生完全一致；点击“增量更新”后展示的另一套硬编码学期末得分（`SEMESTER_AFTER_SCORES`）也相同。目标是为每个学生生成与其真实画像关联、且学生间有差异的学期前/后得分。

## 目标
- 默认展示值应来源于学生自身的真实认知画像聚合得分。
- 增量更新后的学期末得分应基于学生 ID 稳定生成，保证同一学生一致、不同学生不同。
- 保持现有 UI 范围（0~5 分，一位小数）和交互流程不变。

## 方案
采用“真实基线 + 稳定哈希增量”方案。

### 1. 学期前得分来源
学生节点被选中时，前端已通过 `fetchStudentCognitiveTemplate` 加载 14 维原始画像，并聚合成 10 维 `CognitiveAttributes` 写入 `selectedNode.studentProfile`：
- `knowledgeReserve`
- `learningEngagement`
- `cognitiveLoad`
- `learningMotivation`
- `computationalThinking`
- `humanAiTrust`
- `learningMethod`
- `learningAttitude`
- `selfRegulatedLearning`
- `aiLiteracy`

“个人维度分析”默认展示直接使用该 `studentProfile` 中的值，替代原有的 `SEMESTER_BEFORE_SCORES` 全局常量。

### 2. 学期末得分生成
改造 `generateDemoChatbotIncrementData`：
- 输入：学生节点 ID + 当前 10 维基线得分（`CognitiveAttributes`）。
- 基于 `studentNodeId` 做稳定字符串哈希，为每个维度生成 0.3~0.9 的增量。
- 允许个别维度增量略低或接近 0，但主体为提升，符合“学期末进步”的演示语义。
- 生成后得分通过 `clamp(value, 0, 5)` 限制，并保留一位小数。

### 3. 增量详情弹窗
弹窗中的 `previousValue` 取自真实基线，`newValue` 取自生成值，`changeDelta = newValue - previousValue`，干预文案继续使用现有 `dimensionReason` 逻辑。

### 4. 状态回写
点击增量更新后，按现有逻辑：
- 将 `newValue` 回写到 `selectedNode.studentProfile`。
- 将增量后的得分存入 `localStorage`（`CHATBOT_INCREMENT_STORAGE_KEY`），保证刷新后仍展示学期末状态。

## 改动范围

### 文件 1：`frontend/services/chatbotDimensionDemo.ts`
- 移除 `SEMESTER_BEFORE_SCORES`、`SEMESTER_AFTER_SCORES` 全局硬编码常量。
- 新增基于节点 ID 的稳定哈希函数。
- 修改 `generateDemoChatbotIncrementData` 签名，接收 `baseline: CognitiveAttributes`。
- 根据基线 + 哈希增量生成每个维度的 `previousValue` 和 `newValue`。
- 保留 `DIMENSION_CATEGORY` 和 `dimensionReason` 逻辑。

### 文件 2：`frontend/App.tsx`
- 在“个人维度分析”渲染逻辑中，默认展示 `selectedNode.studentProfile` 中对应维度的真实值，而非 `SEMESTER_BEFORE_SCORES`。
- 调用 `generateDemoChatbotIncrementData` 时传入当前学生的 `studentProfile` 作为基线。
- 移除对 `SEMESTER_BEFORE_SCORES` 的导入。
- 保留兜底：若 `studentProfile` 中某维度缺失或 <=0，使用班级平均值 fallback（可保留一个内部常量，不对外暴露）。

## 边界与兜底
- 若学生画像加载失败或 `studentProfile` 缺少 10 维得分，使用班级平均常量作为 fallback，避免空白。
- 生成值严格 clamp 在 0~5 分，避免越界。
- `DEMO_CHATBOT_INCREMENT` 开关保留；设为 `false` 时仍走 `fetchChatbotDimensionIncrement` 真实接口，逻辑不受影响。

## 验证清单
- [ ] 切换不同学生，默认“个人维度分析”展示的 10 维得分不同。
- [ ] 同一学生 reload 后，默认得分保持一致。
- [ ] 点击“增量更新”后，弹窗展示的 previousValue 等于默认得分。
- [ ] 不同学生点击“增量更新”后，newValue 不同。
- [ ] 同一学生多次点击“增量更新”，newValue 保持一致。
- [ ] 增量详情中的 changeDelta 和 reason 文案正常。
- [ ] `DEMO_CHATBOT_INCREMENT = false` 时仍调用真实接口，不破坏现有逻辑。
