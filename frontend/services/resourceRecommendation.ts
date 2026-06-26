import { Resource } from "../types";

/** 资源推荐结果项：在原始资源基础上附带本次推荐的理由与难度档。 */
export interface RecommendedResource extends Resource {
  /** 推荐理由（依据知识储备 / 活跃度生成）。 */
  recommendReason: string;
  /** 资源难度档：基于资源 difficulty 字段推断。 */
  difficultyLabel: "基础" | "进阶" | "挑战";
}

/** 0-5 维度阈值：≤2 视为低，≥4 视为高，其余为中。 */
const LOW_THRESHOLD = 2;
const HIGH_THRESHOLD = 4;

/** 不同活跃度对应的推荐资源数量。 */
const COUNT_BY_ENGAGEMENT = { high: 6, medium: 4, low: 3 } as const;

/** 资源类型偏好：活跃度越高越倾向轻量快速的内容，活跃度越低越倾向趣味游戏。 */
const TYPE_PREFERENCE_BY_ENGAGEMENT = {
  high: new Set(["VIDEO", "ARTICLE"]),
  medium: new Set(["PRACTICE", "DOCUMENT"]),
  low: new Set(["GAME"]),
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

/** 计算 difficulty 与偏好之间的匹配权重。 */
function difficultyFitWeight(
  actual: string | null,
  preferred: "LOW" | "MEDIUM" | "HIGH",
): number {
  if (!actual) return 0.5; // 无难度数据时给中性权重

  const order = ["LOW", "MEDIUM", "HIGH"] as const;
  const actualIndex = order.indexOf(actual as (typeof order)[number]);
  const preferredIndex = order.indexOf(preferred);
  if (actualIndex === -1 || preferredIndex === -1) return 0.3;

  const distance = Math.abs(actualIndex - preferredIndex);
  if (distance === 0) return 1.0;
  if (distance === 1) return 0.5;
  return 0.2;
}

/** 根据活跃度决定推荐数量。 */
function countByEngagement(engagement: number): number {
  if (engagement >= HIGH_THRESHOLD) return COUNT_BY_ENGAGEMENT.high;
  if (engagement > LOW_THRESHOLD) return COUNT_BY_ENGAGEMENT.medium;
  return COUNT_BY_ENGAGEMENT.low;
}

/** 根据活跃度决定偏好的资源类型集合。 */
function preferredTypes(
  engagement: number,
): Set<(typeof TYPE_PREFERENCE_BY_ENGAGEMENT)[keyof typeof TYPE_PREFERENCE_BY_ENGAGEMENT] extends Set<infer T> ? T : never> {
  if (engagement >= HIGH_THRESHOLD) return TYPE_PREFERENCE_BY_ENGAGEMENT.high;
  if (engagement > LOW_THRESHOLD) return TYPE_PREFERENCE_BY_ENGAGEMENT.medium;
  return TYPE_PREFERENCE_BY_ENGAGEMENT.low;
}

/** 计算资源类型与活跃度偏好之间的匹配权重。 */
function typeFitWeight(resourceType: string, preferred: Set<string>): number {
  return preferred.has(resourceType) ? 1.0 : 0.3;
}

/** 按资源 difficulty 字段给资源打难度标签。 */
function difficultyLabelOf(
  difficulty: string | null,
): RecommendedResource["difficultyLabel"] {
  if (!difficulty) return "进阶";
  return DIFFICULTY_TO_LABEL[difficulty] ?? "进阶";
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
      ? "活跃度较低"
      : engagement >= HIGH_THRESHOLD
        ? "活跃度高"
        : "活跃度中等";

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

  const preferredDiff = preferredDifficulty(knowledgeReserve);
  const count = countByEngagement(engagement);
  const preferredTypeSet = preferredTypes(engagement);

  // 资源与偏好难度、偏好类型越接近，权重越高；并叠加随机扰动避免结果过于固定。
  const weighted = pool.map((resource) => {
    const diffWeight = difficultyFitWeight(resource.difficulty, preferredDiff);
    const typeWeight = typeFitWeight(resource.type, preferredTypeSet);
    const jitter = 0.5 + Math.random();
    return { item: resource, weight: diffWeight * typeWeight * jitter };
  });

  const selected = weightedSampleWithoutReplacement(weighted, count);

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
