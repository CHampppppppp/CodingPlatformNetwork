import { CognitiveAttributes } from "../types";
import {
  DIMENSION_STRATEGIES,
  LEARNING_STYLE_STRATEGIES,
  LearningStyle,
  StrategyLevel,
  inferLearningStyle,
} from "./strategyData";

export type { StrategyLevel, LearningStyle } from "./strategyData";

const REVERSE_DIMENSIONS = new Set<keyof CognitiveAttributes>(["cognitiveLoad"]);

function scoreToLevel(score: number, isReverse: boolean): StrategyLevel {
  if (isReverse) {
    // 认知负荷越高，负荷越重，水平越低
    if (score >= 4) return "low";
    if (score <= 2) return "high";
    return "medium";
  }
  if (score <= 2) return "low";
  if (score >= 4) return "high";
  return "medium";
}

/**
 * 获取指定聚合维度的教师干预策略（3 条）。
 * - 认知负荷为反向指标，分值越高，返回越低水平策略。
 * - 学习风格由调用方通过 `getLearningStyleStrategies` 单独获取。
 */
export function getStrategy(
  attribute: keyof CognitiveAttributes,
  score: number,
): string[] {
  const strategies = DIMENSION_STRATEGIES[attribute];
  if (!strategies) {
    return ["该维度暂无具体干预策略数据。"];
  }

  const level = scoreToLevel(score, REVERSE_DIMENSIONS.has(attribute));
  return strategies[level];
}

/**
 * 获取学习风格对应的教师干预策略（2 条）。
 * 学习风格由学习投入、学习方法倾向、学习态度三个维度综合推断。
 */
export function getLearningStyleStrategies(
  attributes: CognitiveAttributes,
): { style: LearningStyle; styleName: string; strategies: string[] } {
  const style = inferLearningStyle(attributes);
  const styleNameMap: Record<LearningStyle, string> = {
    active: "活跃风格",
    reflective: "沉思风格",
    balanced: "两者兼备",
  };

  return {
    style,
    styleName: styleNameMap[style],
    strategies: LEARNING_STYLE_STRATEGIES[style],
  };
}

/** @deprecated 旧版单字符串策略查询，保留以避免破坏潜在引用。请改用 getStrategy(attribute, score)。 */
export function getStrategyLegacy(
  _scenario: string,
  attribute: keyof CognitiveAttributes,
  score: number,
): string {
  return getStrategy(attribute, score).join("\n");
}
