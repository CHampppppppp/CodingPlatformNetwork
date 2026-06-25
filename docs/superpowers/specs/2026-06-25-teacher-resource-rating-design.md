# 推荐资源弹窗教师评分功能设计

## 背景

在 `SHOW_CASE` 展示场景中，教师点击学生节点后可在右侧详情卡片点击「推荐资源」按钮，系统会依据学生知识储备与活跃度从资源池中推荐若干资源。当前弹窗仅展示资源列表，缺少教师对推荐结果的主观反馈入口。

为了让教师能够对推荐资源进行「人在回路」式反馈，并为后续智能调整推荐策略打下基础，现计划在推荐资源弹窗中为每个资源卡片增加五星评分组件。

## 目标

- 在推荐资源弹窗的每个资源卡片上增加教师评分入口。
- 支持 1–5 星打分，hover 预览、点击确认。
- 本次仅在前端保存评分状态，不调用后端接口。
- 切换学生或关闭弹窗后，评分状态可丢弃（临时状态）。

## 非目标

- 不持久化到后端数据库。
- 不根据评分实时重新排序或过滤推荐结果（本次只做打分框）。
- 不增加文字评语、标签等多维反馈。
- 不影响其他弹窗（专家干预、课堂视频分析等）。

## 设计方案

### 总体架构

- 新增可复用组件 `StarRating`，负责星星渲染与交互。
- 在 `App.tsx` 的「推荐资源」弹窗中为每个 `RecommendedResource` 卡片嵌入 `StarRating`。
- 使用本地 React state 保存 `{ [resourceId]: number }` 评分映射。

### 组件：StarRating

**路径**：`frontend/components/StarRating.tsx`

**Props**：

```ts
interface StarRatingProps {
  /** 当前分值 1-5，0 表示未评分 */
  value: number;
  /** 分值变化回调 */
  onChange?: (value: number) => void;
  /** 是否只读 */
  readOnly?: boolean;
  /** 尺寸 */
  size?: number;
  /** 标签文案 */
  label?: string;
}
```

**行为**：

- 默认显示 5 个空心星星。
- 鼠标 hover 时，对应星星及左侧星星临时高亮，显示预览分。
- 鼠标移出后恢复为当前 `value` 状态。
- 点击星星后触发 `onChange`，传入 1–5 的整数。
- `readOnly` 为 true 时禁用 hover 与点击。

### 状态管理

在 `App.tsx` 中新增：

```ts
const [resourceRatings, setResourceRatings] = useState<Record<string, number>>({});
```

key 规则：`resource.id`。由于 `recommendedResources` 每次随学生切换重新生成，且弹窗关闭时清空推荐列表，当前 key 足以保证同一弹窗内不冲突；后续如需跨学生持久，再改为 `${studentId}-${resourceId}`。

关闭弹窗时清空评分状态：

```ts
const handleCloseRecommend = () => {
  setIsRecommendOpen(false);
  setRecommendedResources([]);
  setResourceRatings({});
};
```

### UI 位置

在每个推荐资源卡片底部、历史正确率上方增加一行：

```
教师反馈：[★★★★★]
```

文案颜色使用 slate-500，星星默认 amber-400，未选中为 slate-200。

### 样式规范

- 与现有 Tailwind 风格保持一致。
- 卡片内已有 `text-[10px]` 作为辅助文案尺寸，评分标签使用 `text-[11px]`。
- 保持卡片网格 `grid-cols-2 gap-3` 不变，评分行不额外撑高卡片。

## 依赖与影响

- 仅修改 `frontend/App.tsx` 与新增 `frontend/components/StarRating.tsx`。
- 不引入新依赖包，使用 `lucide-react` 的 `Star` 图标。
- 不改后端、不改 Prisma schema、不调用 API。

## 验证方式

- 前端构建通过：`cd frontend && npm run build`。
- 在 `SHOW_CASE` 场景下点击学生节点 → 打开「推荐资源」弹窗 → 每个资源卡片出现五星评分 → 点击星星可改变颜色 → 关闭弹窗再打开后评分重置。

## 后续可扩展方向

- 将 `onChange` 接入后端 API，实现评分持久化。
- 根据教师历史评分调整 `recommendResources` 的权重。
- 增加文字评语或「不适合原因」标签。
