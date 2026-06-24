import { Resource } from "../types";

/** 资源推荐结果项：在原始资源基础上附带本次推荐的理由与难度档。 */
export interface RecommendedResource extends Resource {
  /** 推荐理由（依据知识储备 / 活跃度生成）。 */
  recommendReason: string;
  /** 资源难度档：基于历史正确率推断。 */
  difficultyLabel: "基础" | "进阶" | "挑战";
}

/** 0-5 维度阈值：≤2 视为低，≥4 视为高，其余为中。 */
const LOW_THRESHOLD = 2;
const HIGH_THRESHOLD = 4;

/** 不同活跃度对应的推荐资源数量。 */
const COUNT_BY_ENGAGEMENT = { high: 6, medium: 4, low: 3 } as const;

/** 正确率缺失时使用的中性占位值，避免无数据资源被完全排除。 */
const NEUTRAL_ACCURACY = 60;

/**
 * 依据学生「知识储备」推断偏好的资源正确率（作为难度的代理指标）。
 * 正确率越高 ≈ 越基础、越易上手；正确率越低 ≈ 越有挑战性。
 * - 知识储备低 → 偏好高正确率（基础）资源，target≈90
 * - 知识储备高 → 偏好低正确率（挑战）资源，target≈40
 */
function preferredAccuracy(knowledgeReserve: number): number {
  const clamped = Math.max(0, Math.min(5, knowledgeReserve));
  return 90 - (clamped / 5) * 50;
}

/** 按历史正确率给资源打难度标签。 */
function difficultyLabelOf(accuracy: number | null): RecommendedResource["difficultyLabel"] {
  const value = accuracy ?? NEUTRAL_ACCURACY;
  if (value >= 70) return "基础";
  if (value >= 45) return "进阶";
  return "挑战";
}

/** 根据活跃度决定推荐数量。 */
function countByEngagement(engagement: number): number {
  if (engagement >= HIGH_THRESHOLD) return COUNT_BY_ENGAGEMENT.high;
  if (engagement > LOW_THRESHOLD) return COUNT_BY_ENGAGEMENT.medium;
  return COUNT_BY_ENGAGEMENT.low;
}

/** 生成推荐理由文案。 */
function buildReason(
  knowledgeReserve: number,
  engagement: number,
  difficulty: RecommendedResource["difficultyLabel"],
): string {
  const reserveDesc =
    knowledgeReserve <= LOW_THRESHOLD
      ? "知识储备偏弱"
      : knowledgeReserve >= HIGH_THRESHOLD
        ? "知识储备扎实"
        : "知识储备中等";
  const engagementDesc =
    engagement <= LOW_THRESHOLD
      ? "活跃度较低"
      : engagement >= HIGH_THRESHOLD
        ? "活跃度高"
        : "活跃度中等";
  return `${reserveDesc}、${engagementDesc}，推荐${difficulty}类资源巩固提升`;
}

/**
 * 加权随机不放回抽样：weight 越大被抽中的概率越高。
 * 注意：依赖 `Math.random()`，仅在浏览器/运行时调用，不可用于 Workflow 脚本。
 */
function weightedSampleWithoutReplacement<T>(
  items: Array<{ item: T; weight: number }>,
  count: number,
): T[] {
  const pool = items.map((entry) => ({ ...entry }));
  const picked: T[] = [];
  const take = Math.min(count, pool.length);

  for (let i = 0; i < take; i += 1) {
    const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) {
      // 全部权重为 0 时退化为均匀随机
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool[idx].item);
      pool.splice(idx, 1);
      continue;
    }
    let threshold = Math.random() * totalWeight;
    let chosenIndex = pool.length - 1;
    for (let j = 0; j < pool.length; j += 1) {
      threshold -= pool[j].weight;
      if (threshold <= 0) {
        chosenIndex = j;
        break;
      }
    }
    picked.push(pool[chosenIndex].item);
    pool.splice(chosenIndex, 1);
  }

  return picked;
}

/**
 * 依据学生的知识储备与活跃度，从资源池中随机推荐若干合适的资源。
 *
 * @param pool 候选资源（通常为当前图谱关联的资源）
 * @param knowledgeReserve 知识储备得分 0-5
 * @param engagement 学习投入 / 活跃度得分 0-5
 */
export function recommendResources(
  pool: Resource[],
  knowledgeReserve: number,
  engagement: number,
): RecommendedResource[] {
  if (pool.length === 0) return [];

  const target = preferredAccuracy(knowledgeReserve);
  const count = countByEngagement(engagement);

  // 资源与偏好难度越接近，权重越高；并叠加随机扰动避免结果过于固定。
  const weighted = pool.map((resource) => {
    const accuracy = resource.accuracy ?? NEUTRAL_ACCURACY;
    const distance = Math.abs(accuracy - target);
    const fitWeight = 1 / (1 + distance / 25);
    const jitter = 0.5 + Math.random();
    return { item: resource, weight: fitWeight * jitter };
  });

  const selected = weightedSampleWithoutReplacement(weighted, count);

  return selected.map((resource) => {
    const difficultyLabel = difficultyLabelOf(resource.accuracy);
    return {
      ...resource,
      difficultyLabel,
      recommendReason: buildReason(knowledgeReserve, engagement, difficultyLabel),
    };
  });
}
