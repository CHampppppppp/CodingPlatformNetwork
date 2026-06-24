import { CognitiveAttributes, StudentTemplateDimension } from "../types";

export const BASE_DIMENSION_ORDER = new Map<string, number>([
  ["COG_READING", 1],
  ["COG_LANGUAGE", 2],
  ["COG_SCIENCE_KNOWLEDGE", 3],
  ["COG_SCIENCE_INQUIRY", 4],
  ["COG_COMPUTATIONAL", 5],
  ["COG_TECH_LITERACY", 6],
  ["PSY_ANXIETY", 7],
  ["PSY_DEPRESSION", 8],
  ["PSY_RESILIENCE", 9],
  ["PSY_INTEREST_STABILITY", 10],
  ["PSY_PRESSURE", 11],
  ["PSY_LIFE_SATISFACTION", 12],
  ["PRAC_INNOVATION", 13],
  ["PRAC_PROBLEM_SOLVING", 14],
  ["PRAC_COLLABORATION", 15],
  ["PRAC_PRACTICE", 16],
]);

export const BASE_DIMENSION_CATEGORY: Record<string, string> = {
  COG_READING: "认知能力",
  COG_LANGUAGE: "认知能力",
  COG_SCIENCE_KNOWLEDGE: "认知能力",
  COG_SCIENCE_INQUIRY: "认知能力",
  COG_COMPUTATIONAL: "认知能力",
  COG_TECH_LITERACY: "认知能力",
  PSY_ANXIETY: "心理健康",
  PSY_DEPRESSION: "心理健康",
  PSY_RESILIENCE: "心理健康",
  PSY_INTEREST_STABILITY: "心理健康",
  PSY_PRESSURE: "心理健康",
  PSY_LIFE_SATISFACTION: "心理健康",
  PRAC_INNOVATION: "实践能力",
  PRAC_PROBLEM_SOLVING: "实践能力",
  PRAC_COLLABORATION: "实践能力",
  PRAC_PRACTICE: "实践能力",
};

export const BASE_DIMENSION_NAME_ZH: Record<string, string> = {
  COG_READING: "阅读理解",
  COG_LANGUAGE: "语言表达",
  COG_SCIENCE_KNOWLEDGE: "科学知识",
  COG_SCIENCE_INQUIRY: "科学探究",
  COG_COMPUTATIONAL: "计算思维",
  COG_TECH_LITERACY: "技术素养",
  PSY_ANXIETY: "焦虑倾向",
  PSY_DEPRESSION: "抑郁倾向",
  PSY_RESILIENCE: "心理韧性",
  PSY_INTEREST_STABILITY: "兴趣稳定性",
  PSY_PRESSURE: "学业压力",
  PSY_LIFE_SATISFACTION: "生活满意度",
  PRAC_INNOVATION: "创新能力",
  PRAC_PROBLEM_SOLVING: "问题解决能力",
  PRAC_COLLABORATION: "协作能力",
  PRAC_PRACTICE: "实践能力",
};

export function computeAggregateDimensions(
  baseScores: Record<string, number>,
): CognitiveAttributes {
  const get = (code: string): number => baseScores[code] ?? 0;

  const average = (codes: string[]): number => {
    const values = codes.map(get).filter((v) => v > 0);
    return values.length > 0
      ? values.reduce((a, b) => a + b, 0) / values.length
      : 0;
  };

  return {
    knowledgeReserve: average(["COG_READING", "COG_LANGUAGE", "COG_SCIENCE_KNOWLEDGE"]) / 2,
    learningEngagement: average(["COG_SCIENCE_INQUIRY", "PRAC_PRACTICE", "PRAC_COLLABORATION"]) / 2,
    cognitiveLoad:
      average(["PSY_ANXIETY", "PSY_DEPRESSION", "PSY_PRESSURE", "PSY_LIFE_SATISFACTION"]) * 0.5,
    learningMotivation: get("PSY_RESILIENCE") / 2,
    computationalThinking: get("COG_COMPUTATIONAL") / 2,
    humanAiTrust: get("COG_TECH_LITERACY") / 2,
    learningMethod: average(["PRAC_PROBLEM_SOLVING", "PRAC_COLLABORATION"]) / 2,
    learningAttitude: get("PRAC_INNOVATION") / 2,
    selfRegulatedLearning: get("PRAC_PROBLEM_SOLVING") / 2,
    aiLiteracy: get("COG_TECH_LITERACY") / 2,
  };
}

export function buildTemplateDimensions(
  baseScores: Record<string, number>,
): StudentTemplateDimension[] {
  return Object.entries(baseScores)
    .filter(([code]) => BASE_DIMENSION_ORDER.has(code))
    .map(([code, score]) => ({
      code,
      name: BASE_DIMENSION_NAME_ZH[code] ?? code,
      category: BASE_DIMENSION_CATEGORY[code] ?? "其他",
      score,
      level: scoreToLevel(score),
    }))
    .sort(
      (a, b) =>
        (BASE_DIMENSION_ORDER.get(a.code) ?? 999) -
        (BASE_DIMENSION_ORDER.get(b.code) ?? 999),
    );
}

function scoreToLevel(score: number): string {
  if (score >= 8) return "高";
  if (score >= 6) return "中";
  if (score >= 4) return "较低";
  return "低";
}
