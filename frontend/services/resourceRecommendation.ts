import { Resource } from "../types";

/** 资源推荐结果项：在原始资源基础上附带本次推荐的理由与难度档。 */
export interface RecommendedResource extends Resource {
  /** 推荐理由（依据知识储备 / 学习投入生成）。 */
  recommendReason: string;
  /** 资源难度档：基于资源 difficulty 字段推断。 */
  difficultyLabel: "基础" | "进阶" | "挑战";
}

/** 0-5 维度阈值：≤2 视为低，≥4 视为高，其余为中。 */
const LOW_THRESHOLD = 2;
const HIGH_THRESHOLD = 4;

/** 不同学习投入对应的推荐资源数量。 */
const COUNT_BY_ENGAGEMENT = { high: 6, medium: 4, low: 3 } as const;

/** 学习投入 → 偏好的资源类型（按优先级排列）。 */
const TYPE_PREFERENCE_BY_ENGAGEMENT = {
  high: ["VIDEO", "ARTICLE"],
  medium: ["PRACTICE", "DOCUMENT"],
  low: ["GAME"],
} as const;

/** difficulty 与中文难度档的映射。 */
const DIFFICULTY_TO_LABEL: Record<
  "LOW" | "MEDIUM" | "HIGH" | string,
  RecommendedResource["difficultyLabel"]
> = {
  LOW: "基础",
  MEDIUM: "进阶",
  HIGH: "挑战",
};

/** 将知识储备转换为偏好的 difficulty 等级。 */
function preferredDifficulty(
  knowledgeReserve: number,
): "LOW" | "MEDIUM" | "HIGH" {
  if (knowledgeReserve >= HIGH_THRESHOLD) return "HIGH";
  if (knowledgeReserve > LOW_THRESHOLD) return "MEDIUM";
  return "LOW";
}

/** 根据学习投入决定推荐数量。 */
function countByEngagement(engagement: number): number {
  if (engagement >= HIGH_THRESHOLD) return COUNT_BY_ENGAGEMENT.high;
  if (engagement > LOW_THRESHOLD) return COUNT_BY_ENGAGEMENT.medium;
  return COUNT_BY_ENGAGEMENT.low;
}

/** 根据学习投入决定偏好的资源类型。 */
function preferredTypes(engagement: number): string[] {
  if (engagement >= HIGH_THRESHOLD) {
    return [...TYPE_PREFERENCE_BY_ENGAGEMENT.high];
  }
  if (engagement > LOW_THRESHOLD) {
    return [...TYPE_PREFERENCE_BY_ENGAGEMENT.medium];
  }
  return [...TYPE_PREFERENCE_BY_ENGAGEMENT.low];
}

/** 按资源 difficulty 字段给资源打难度标签。 */
function difficultyLabelOf(
  difficulty: string | null,
): RecommendedResource["difficultyLabel"] {
  if (!difficulty) return "进阶";
  return DIFFICULTY_TO_LABEL[difficulty] ?? "进阶";
}

/** 计算类型匹配分数：命中偏好类型得 1 分，否则 0 分。 */
function typeMatchScore(resourceType: string, preferred: string[]): number {
  return preferred.includes(resourceType) ? 1 : 0;
}

/** 计算难度匹配分数：同档 1 分，差一档 0.5 分，差两档 0 分。 */
function difficultyMatchScore(
  actual: string | null,
  preferred: "LOW" | "MEDIUM" | "HIGH",
): number {
  if (!actual) return 0.5;

  const order = ["LOW", "MEDIUM", "HIGH"] as const;
  const actualIndex = order.indexOf(actual as (typeof order)[number]);
  const preferredIndex = order.indexOf(preferred);
  if (actualIndex === -1 || preferredIndex === -1) return 0.3;

  const distance = Math.abs(actualIndex - preferredIndex);
  if (distance === 0) return 1;
  if (distance === 1) return 0.5;
  return 0;
}

/** Fisher-Yates 洗牌，原地打乱数组。 */
function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** 生成推荐理由文案。 */
function buildReason(
  knowledgeReserve: number,
  engagement: number,
  difficulty: RecommendedResource["difficultyLabel"],
  resourceType: string,
): string {
  const reserveDesc =
    knowledgeReserve <= LOW_THRESHOLD
      ? "知识储备偏弱"
      : knowledgeReserve >= HIGH_THRESHOLD
        ? "知识储备扎实"
        : "知识储备中等";
  const engagementDesc =
    engagement <= LOW_THRESHOLD
      ? "学习投入较低"
      : engagement >= HIGH_THRESHOLD
        ? "学习投入高"
        : "学习投入中等";

  const typeDescMap: Record<string, string> = {
    VIDEO: "视频",
    ARTICLE: "文章",
    PRACTICE: "练习",
    DOCUMENT: "文档",
    GAME: "游戏化",
  };
  const typeDesc = typeDescMap[resourceType] || resourceType;

  return `${reserveDesc}、${engagementDesc}，推荐${difficulty}${typeDesc}类资源巩固提升`;
}

interface ScoredResource {
  item: Resource;
  typeScore: number;
  diffScore: number;
  baseScore: number;
}

/**
 * 依据学生的知识储备与学习投入，从资源池中按规则映射推荐若干资源。
 *
 * 规则：
 * - 学习投入决定偏好的资源类型：高→视频/文章，中→练习/文档，低→游戏化。
 * - 知识储备决定偏好的难度：高→挑战，中→进阶，低→基础。
 * - 资源先按「类型匹配 + 难度匹配」综合得分分组排序，同分段内随机打乱，
 *   再按学习投入对应的数量取前 N 个，避免每次推荐完全固定，同时允许降级展示。
 *
 * @param pool 候选资源（通常为当前图谱关联的资源）
 * @param knowledgeReserve 知识储备得分 0-5
 * @param engagement 学习投入得分 0-5
 */
export function recommendResources(
  pool: Resource[],
  knowledgeReserve: number,
  engagement: number,
): RecommendedResource[] {
  if (pool.length === 0) return [];

  const preferredDiff = preferredDifficulty(knowledgeReserve);
  const count = countByEngagement(engagement);
  const preferredTypeSet = preferredTypes(engagement);

  // 类型匹配权重更高（0.6），难度匹配次之（0.4）。
  const scored: ScoredResource[] = pool.map((resource) => {
    const typeScore = typeMatchScore(resource.type, preferredTypeSet);
    const diffScore = difficultyMatchScore(resource.difficulty, preferredDiff);
    return {
      item: resource,
      typeScore,
      diffScore,
      baseScore: typeScore * 0.6 + diffScore * 0.4,
    };
  });

  // 按基础分数分组，组内随机打乱，再按分数降序拼接。
  const groups = new Map<number, ScoredResource[]>();
  for (const entry of scored) {
    const list = groups.get(entry.baseScore) ?? [];
    list.push(entry);
    groups.set(entry.baseScore, list);
  }

  for (const list of groups.values()) {
    shuffleArray(list);
  }

  const sorted = Array.from(groups.entries())
    .sort(([scoreA], [scoreB]) => scoreB - scoreA)
    .flatMap(([, list]) => list);

  const selected = sorted.slice(0, count).map((entry) => entry.item);

  return selected.map((resource) => {
    const difficultyLabel = difficultyLabelOf(resource.difficulty);
    return {
      ...resource,
      difficultyLabel,
      recommendReason: buildReason(
        knowledgeReserve,
        engagement,
        difficultyLabel,
        resource.type,
      ),
    };
  });
}
