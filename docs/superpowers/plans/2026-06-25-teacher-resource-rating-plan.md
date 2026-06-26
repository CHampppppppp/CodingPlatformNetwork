# 推荐资源弹窗教师评分功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `SHOW_CASE` 场景的「推荐资源」弹窗中，为每个推荐资源卡片增加教师五星评分组件，评分仅保存在前端临时状态。

**Architecture:** 新增可复用 `StarRating` 组件负责渲染与交互；在 `App.tsx` 中用本地 state 保存每个 `resource.id` 的评分；关闭弹窗时清空评分。不调用后端，不持久化。

**Tech Stack:** React + TypeScript + Tailwind CSS + lucide-react

---

## 文件结构

- **Create**: `frontend/components/StarRating.tsx`
  - 负责 5 星评分交互：hover 预览、点击选分、只读模式、标签文案。
- **Modify**: `frontend/App.tsx`
  - 新增 `resourceRatings` state。
  - 在「推荐资源」弹窗的每个资源卡片中嵌入 `StarRating`。
  - 关闭弹窗时清空评分状态。
- **Test**: 本项目前端无单元测试套件，通过 `npm run build` 与手动交互验证。

---

## Task 1: 创建 StarRating 组件

**Files:**
- Create: `frontend/components/StarRating.tsx`

- [ ] **Step 1: 编写组件代码**

```tsx
import React, { useState } from "react";
import { Star } from "lucide-react";

export interface StarRatingProps {
  /** 当前分值 1-5，0 表示未评分 */
  value: number;
  /** 分值变化回调 */
  onChange?: (value: number) => void;
  /** 是否只读 */
  readOnly?: boolean;
  /** 星星尺寸 */
  size?: number;
  /** 标签文案 */
  label?: string;
}

const StarRating: React.FC<StarRatingProps> = ({
  value,
  onChange,
  readOnly = false,
  size = 16,
  label,
}) => {
  const [hoverValue, setHoverValue] = useState(0);

  const displayValue = hoverValue || value;

  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-[11px] text-slate-500 shrink-0">{label}</span>
      )}
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((score) => {
          const filled = score <= displayValue;
          return (
            <button
              key={score}
              type="button"
              disabled={readOnly}
              onClick={() => onChange?.(score)}
              onMouseEnter={() => !readOnly && setHoverValue(score)}
              onMouseLeave={() => !readOnly && setHoverValue(0)}
              className={`p-0.5 transition-colors focus:outline-none ${
                readOnly ? "cursor-default" : "cursor-pointer hover:scale-105"
              }`}
              aria-label={`评分 ${score} 分`}
            >
              <Star
                size={size}
                className={
                  filled
                    ? "fill-amber-400 text-amber-400"
                    : "fill-transparent text-slate-200"
                }
              />
            </button>
          );
        })}
      </div>
      {displayValue > 0 && (
        <span className="text-[11px] font-medium text-amber-600 min-w-[1.5rem]">
          {displayValue.toFixed(0)}
        </span>
      )}
    </div>
  );
};

export default StarRating;
```

- [ ] **Step 2: 提交组件**

```bash
git add frontend/components/StarRating.tsx
git commit -m "feat: add StarRating component for teacher resource feedback"
```

---

## Task 2: 在 App.tsx 中接入评分状态

**Files:**
- Modify: `frontend/App.tsx`

- [ ] **Step 1: 导入 StarRating 组件**

在 `frontend/App.tsx` 的 import 区域（`AnalysisPanel` 导入下方）新增：

```tsx
import StarRating from "./components/StarRating";
```

- [ ] **Step 2: 新增评分 state**

在 `App` 组件内，找到 `recommendedResources` state 的定义位置（约第 159 行），在其下方新增：

```tsx
const [resourceRatings, setResourceRatings] = useState<Record<string, number>>({});
```

- [ ] **Step 3: 修改关闭弹窗逻辑**

将 `handleCloseRecommend` 函数改为清空评分状态：

```tsx
const handleCloseRecommend = () => {
  setIsRecommendOpen(false);
  setRecommendedResources([]);
  setResourceRatings({});
};
```

- [ ] **Step 4: 在推荐资源卡片中嵌入评分组件**

找到「推荐资源」弹窗中 `recommendedResources.map((resource) => (...))` 的卡片渲染区域（约 1861 行），在卡片最底部（资源接受度 `span` 之后）插入：

```tsx
<div className="mt-2 pt-2 border-t border-slate-100">
  <StarRating
    label="教师反馈："
    value={resourceRatings[resource.id] ?? 0}
    onChange={(score) => {
      setResourceRatings((prev) => ({
        ...prev,
        [resource.id]: score,
      }));
    }}
  />
</div>
```

- [ ] **Step 5: 提交修改**

```bash
git add frontend/App.tsx
git commit -m "feat: embed StarRating into recommended resources modal"
```

---

## Task 3: 构建验证

**Files:**
- 无新增文件

- [ ] **Step 1: 运行前端构建**

```bash
cd /home/zju/CodingPlatformNetwork/frontend && npm run build
```

- [ ] **Step 2: 确认构建通过**

Expected output: 构建命令以退出码 0 结束，无 TypeScript 类型错误。

- [ ] **Step 3: 提交验证结果（可选，若无代码改动则无需提交）**

如果构建过程中需要修复代码，修复后执行：

```bash
git add frontend/App.tsx frontend/components/StarRating.tsx
git commit -m "fix: resolve type/style issues from build"
```

---

## Task 4: 手动交互验证（说明，无法自动执行）

- [ ] 在浏览器中打开前端页面。
- [ ] 选择 `SHOW_CASE` 场景并加载班级数据。
- [ ] 点击一个学生节点，右侧详情卡片出现「推荐资源」按钮。
- [ ] 点击「推荐资源」按钮，弹窗中每个资源卡片底部出现「教师反馈：★★★★★」。
- [ ] 点击星星，确认颜色变化且数字更新。
- [ ] 关闭弹窗后再打开，确认评分已重置为空。

---

## 自我检查

### Spec 覆盖检查

| Spec 要求 | 对应 Task |
|---|---|
| 每个推荐资源卡片增加教师评分入口 | Task 2 Step 4 |
| 支持 1–5 星打分、hover 预览、点击确认 | Task 1 |
| 仅前端保存评分状态 | Task 2 Step 2、Step 3 |
| 关闭弹窗后评分状态丢弃 | Task 2 Step 3 |
| 不影响其他弹窗 | 仅修改推荐资源弹窗区域 |
| 使用 `lucide-react` | Task 1 使用 `Star` 图标 |

### Placeholder 检查

- 无 "TBD" / "TODO" / "implement later"。
- 所有代码块为实际可运行代码。
- 所有命令为实际可执行命令。

### 类型一致性检查

- `resourceRatings` 类型为 `Record<string, number>`，与 `StarRatingProps.value` 的 `number` 类型一致。
- `onChange` 回调签名 `(value: number) => void` 与 `setResourceRatings` 更新逻辑一致。
- `resource.id` 为 `string`，符合 `Record<string, number>` 的 key 类型。
