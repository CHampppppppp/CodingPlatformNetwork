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
