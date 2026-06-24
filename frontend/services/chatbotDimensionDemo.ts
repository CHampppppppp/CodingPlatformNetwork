import { ChatbotDimensionIncrementData } from "../types";
import {
  BASE_DIMENSION_NAME_ZH,
  BASE_DIMENSION_CATEGORY,
} from "./dimensionUtils";

const DEMO_DIMENSION_CODES = [
  "COG_READING",
  "COG_LANGUAGE",
  "COG_SCIENCE_KNOWLEDGE",
  "COG_SCIENCE_INQUIRY",
  "COG_COMPUTATIONAL",
  "COG_TECH_LITERACY",
  "PSY_ANXIETY",
  "PSY_DEPRESSION",
  "PSY_RESILIENCE",
  "PSY_INTEREST_STABILITY",
  "PSY_PRESSURE",
  "PSY_LIFE_SATISFACTION",
  "PRAC_INNOVATION",
  "PRAC_PROBLEM_SOLVING",
  "PRAC_COLLABORATION",
  "PRAC_PRACTICE",
];

interface DemoCognitiveAttributes {
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function randomDelta(): number {
  let delta = roundOneDecimal((Math.random() - 0.5) * 3);
  if (Math.abs(delta) < 0.1) {
    delta = delta >= 0 ? 0.1 : -0.1;
  }
  return delta;
}

export function generateDemoChatbotIncrementData(
  studentNodeId: string,
  profile: DemoCognitiveAttributes,
): ChatbotDimensionIncrementData {
  const base = (val: number) => clamp(val * 2, 1, 9);

  const previousScores: Record<string, number> = {
    COG_READING: base(profile.knowledgeReserve),
    COG_LANGUAGE: base(profile.knowledgeReserve),
    COG_SCIENCE_KNOWLEDGE: base(profile.knowledgeReserve),
    COG_SCIENCE_INQUIRY: base(profile.learningEngagement),
    COG_COMPUTATIONAL: base(profile.computationalThinking),
    COG_TECH_LITERACY: base(profile.humanAiTrust || profile.aiLiteracy),
    PSY_ANXIETY: base(profile.cognitiveLoad),
    PSY_DEPRESSION: base(profile.cognitiveLoad),
    PSY_RESILIENCE: base(profile.learningMotivation),
    PSY_INTEREST_STABILITY: base(profile.cognitiveLoad),
    PSY_PRESSURE: base(profile.cognitiveLoad),
    PSY_LIFE_SATISFACTION: base(profile.cognitiveLoad),
    PRAC_INNOVATION: base(profile.learningAttitude),
    PRAC_PROBLEM_SOLVING: base(profile.learningMethod || profile.selfRegulatedLearning),
    PRAC_COLLABORATION: base(profile.learningMethod || profile.learningEngagement),
    PRAC_PRACTICE: base(profile.learningEngagement),
  };

  const baseDimensions = DEMO_DIMENSION_CODES.map((code) => {
    const previousValue = roundOneDecimal(previousScores[code]);
    const delta = randomDelta();
    const newValue = clamp(roundOneDecimal(previousValue + delta), 0, 10);
    const changeDelta = roundOneDecimal(newValue - previousValue);

    return {
      dimensionCode: code,
      dimensionNameZh: BASE_DIMENSION_NAME_ZH[code] ?? code,
      category: BASE_DIMENSION_CATEGORY[code] ?? "其他",
      previousValue,
      newValue,
      changeDelta,
      reason: "基于 chatbot 历史维度记录的得分变化",
      updatedAt: new Date().toISOString(),
    };
  });

  return { studentNodeId, baseDimensions };
}
