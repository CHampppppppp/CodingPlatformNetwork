export const AGGREGATE_DIMENSION_KEYS = [
  "knowledgeReserve",
  "learningEngagement",
  "cognitiveLoad",
  "learningMotivation",
  "computationalThinking",
  "humanAiTrust",
  "learningMethod",
  "learningAttitude",
  "selfRegulatedLearning",
  "aiLiteracy",
] as const;

export type AggregateDimensionKey = (typeof AGGREGATE_DIMENSION_KEYS)[number];

export const AGGREGATE_DIMENSION_NAME_ZH: Record<AggregateDimensionKey, string> = {
  knowledgeReserve: "知识储备",
  learningEngagement: "学习投入",
  cognitiveLoad: "认知负荷",
  learningMotivation: "学习动机",
  computationalThinking: "计算思维",
  humanAiTrust: "人机信任度",
  learningMethod: "学习方法倾向",
  learningAttitude: "学习态度",
  selfRegulatedLearning: "自我调节学习",
  aiLiteracy: "人工智能素养",
};

export const AGGREGATE_DIMENSION_CATEGORY: Record<AggregateDimensionKey, string> = {
  knowledgeReserve: "认知能力",
  learningEngagement: "实践能力",
  cognitiveLoad: "心理健康",
  learningMotivation: "心理健康",
  computationalThinking: "认知能力",
  humanAiTrust: "认知能力",
  learningMethod: "实践能力",
  learningAttitude: "实践能力",
  selfRegulatedLearning: "实践能力",
  aiLiteracy: "认知能力",
};

export const AGGREGATE_DIMENSION_CODE_TO_BASE_CODES: Record<
  AggregateDimensionKey,
  string[]
> = {
  knowledgeReserve: ["COG_READING", "COG_LANGUAGE", "COG_SCIENCE_KNOWLEDGE"],
  learningEngagement: [
    "COG_SCIENCE_INQUIRY",
    "PRAC_PRACTICE",
    "PRAC_COLLABORATION",
  ],
  cognitiveLoad: [
    "PSY_ANXIETY",
    "PSY_DEPRESSION",
    "PSY_PRESSURE",
    "PSY_LIFE_SATISFACTION",
  ],
  learningMotivation: ["PSY_RESILIENCE", "PSY_INTEREST_STABILITY"],
  computationalThinking: ["COG_COMPUTATIONAL"],
  humanAiTrust: ["COG_TECH_LITERACY"],
  learningMethod: ["PRAC_PROBLEM_SOLVING", "PRAC_COLLABORATION"],
  learningAttitude: ["PRAC_INNOVATION"],
  selfRegulatedLearning: ["PRAC_PROBLEM_SOLVING"],
  aiLiteracy: ["COG_TECH_LITERACY"],
};

export const BASE_DIMENSION_CODES = [
  ...new Set(
    AGGREGATE_DIMENSION_KEYS.flatMap(
      (key) => AGGREGATE_DIMENSION_CODE_TO_BASE_CODES[key],
    ),
  ),
] as const;

export type BaseDimensionCode = (typeof BASE_DIMENSION_CODES)[number];

export const AGGREGATE_TO_BASE_CODES: Record<
  AggregateDimensionKey,
  readonly string[]
> = Object.fromEntries(
  AGGREGATE_DIMENSION_KEYS.map((key) => [
    key,
    AGGREGATE_DIMENSION_CODE_TO_BASE_CODES[key],
  ]),
) as unknown as Record<AggregateDimensionKey, readonly string[]>;

export const AGGREGATE_DIMENSION_MULTIPLIERS: Record<AggregateDimensionKey, number> = {
  knowledgeReserve: 1 / 2,
  learningEngagement: 1 / 2,
  cognitiveLoad: 0.5,
  learningMotivation: 1 / 2,
  computationalThinking: 1 / 2,
  humanAiTrust: 1 / 2,
  learningMethod: 1 / 2,
  learningAttitude: 1 / 2,
  selfRegulatedLearning: 1 / 2,
  aiLiteracy: 1 / 2,
};

export interface AggregateDimensionScores {
  knowledgeReserve: number;
  learningEngagement: number;
  cognitiveLoad: number;
  learningMotivation: number;
  computationalThinking: number;
  humanAiTrust: number;
  learningMethod: number;
  learningAttitude: number;
  selfRegulatedLearning: number;
  aiLiteracy: number;
}

function computeDimension(
  baseScoreMap: Map<string, number>,
  baseCodes: string[],
  multiplier: number,
): number {
  const values = baseCodes
    .map((code) => baseScoreMap.get(code) ?? 0)
    .filter((value) => value > 0);
  if (values.length === 0) return 0;
  return (values.reduce((a, b) => a + b, 0) / values.length) * multiplier;
}

export function computeAggregateDimensionScores(
  baseScoreMap: Map<string, number>,
): AggregateDimensionScores {
  return {
    knowledgeReserve: computeDimension(
      baseScoreMap,
      AGGREGATE_DIMENSION_CODE_TO_BASE_CODES.knowledgeReserve,
      AGGREGATE_DIMENSION_MULTIPLIERS.knowledgeReserve,
    ),
    learningEngagement: computeDimension(
      baseScoreMap,
      AGGREGATE_DIMENSION_CODE_TO_BASE_CODES.learningEngagement,
      AGGREGATE_DIMENSION_MULTIPLIERS.learningEngagement,
    ),
    cognitiveLoad: computeDimension(
      baseScoreMap,
      AGGREGATE_DIMENSION_CODE_TO_BASE_CODES.cognitiveLoad,
      AGGREGATE_DIMENSION_MULTIPLIERS.cognitiveLoad,
    ),
    learningMotivation: computeDimension(
      baseScoreMap,
      AGGREGATE_DIMENSION_CODE_TO_BASE_CODES.learningMotivation,
      AGGREGATE_DIMENSION_MULTIPLIERS.learningMotivation,
    ),
    computationalThinking: computeDimension(
      baseScoreMap,
      AGGREGATE_DIMENSION_CODE_TO_BASE_CODES.computationalThinking,
      AGGREGATE_DIMENSION_MULTIPLIERS.computationalThinking,
    ),
    humanAiTrust: computeDimension(
      baseScoreMap,
      AGGREGATE_DIMENSION_CODE_TO_BASE_CODES.humanAiTrust,
      AGGREGATE_DIMENSION_MULTIPLIERS.humanAiTrust,
    ),
    learningMethod: computeDimension(
      baseScoreMap,
      AGGREGATE_DIMENSION_CODE_TO_BASE_CODES.learningMethod,
      AGGREGATE_DIMENSION_MULTIPLIERS.learningMethod,
    ),
    learningAttitude: computeDimension(
      baseScoreMap,
      AGGREGATE_DIMENSION_CODE_TO_BASE_CODES.learningAttitude,
      AGGREGATE_DIMENSION_MULTIPLIERS.learningAttitude,
    ),
    selfRegulatedLearning: computeDimension(
      baseScoreMap,
      AGGREGATE_DIMENSION_CODE_TO_BASE_CODES.selfRegulatedLearning,
      AGGREGATE_DIMENSION_MULTIPLIERS.selfRegulatedLearning,
    ),
    aiLiteracy: computeDimension(
      baseScoreMap,
      AGGREGATE_DIMENSION_CODE_TO_BASE_CODES.aiLiteracy,
      AGGREGATE_DIMENSION_MULTIPLIERS.aiLiteracy,
    ),
  };
}

export function hasAnyAggregateDimensionScore(
  scoreMap: Map<string, number>,
): boolean {
  return AGGREGATE_DIMENSION_KEYS.some(
    (key) => scoreMap.has(key) && (scoreMap.get(key) ?? 0) > 0,
  );
}

export function emptyAggregateDimensionScores(): AggregateDimensionScores {
  return {
    knowledgeReserve: 0,
    learningEngagement: 0,
    cognitiveLoad: 0,
    learningMotivation: 0,
    computationalThinking: 0,
    humanAiTrust: 0,
    learningMethod: 0,
    learningAttitude: 0,
    selfRegulatedLearning: 0,
    aiLiteracy: 0,
  };
}

export function scoreLevel(
  score: number,
  minScore: number,
  maxScore: number,
): string {
  if (maxScore <= minScore) return "低";
  const ratio = (score - minScore) / (maxScore - minScore);
  if (ratio >= 0.8) return "高";
  if (ratio >= 0.6) return "中";
  return "低";
}

function seededRandom(seed: string): () => number {
  let s = 0;
  for (let i = 0; i < seed.length; i++) {
    s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function generateMockBaseDimensionScores(
  aggregateScores: Partial<AggregateDimensionScores>,
  seed: string,
): Map<string, number> {
  const rand = seededRandom(seed);
  const baseScores = new Map<string, number>();

  for (const key of AGGREGATE_DIMENSION_KEYS) {
    const aggregateScore = aggregateScores[key];
    if (typeof aggregateScore !== "number" || aggregateScore <= 0) {
      continue;
    }
    const baseCodes = AGGREGATE_TO_BASE_CODES[key];
    for (const code of baseCodes) {
      const noise = rand() * 2 - 1; // [-1, 1]
      const score = Math.max(0, Math.min(10, aggregateScore * 2 + noise));
      baseScores.set(code, Number(score.toFixed(2)));
    }
  }

  return baseScores;
}
