import {
  ChatbotDimensionIncrementData,
  CognitiveAttributes,
} from "../types";
import {
  COGNITIVE_DIMENSION_KEYS,
  COGNITIVE_DIMENSION_LABELS,
} from "../constants";

const SCALE_MAX = 5;

/** 当未传入学生基线时使用的内部默认得分，仅作为兜底 */
const FALLBACK_BASELINE_SCORES: Record<string, number> = {
  knowledgeReserve: 3.2,
  learningEngagement: 3.5,
  cognitiveLoad: 3.0,
  learningMotivation: 3.8,
  computationalThinking: 3.1,
  humanAiTrust: 3.6,
  learningMethod: 3.3,
  learningAttitude: 3.7,
  selfRegulatedLearning: 3.4,
  aiLiteracy: 3.0,
};

const DIMENSION_CATEGORY: Record<string, string> = {
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

const DIMENSION_REASONS: Record<string, string> = {
  knowledgeReserve:
    "通过分层阅读任务、语言表达支架与科学知识网络梳理，学生的知识储备得到巩固与扩展。",
  learningEngagement:
    "围绕科学探究、动手实践与小组协作开展的项目化学习，提升了学生的学习投入程度。",
  cognitiveLoad:
    "情绪识别、放松策略与压力管理支持有效缓解了学生的认知负荷与心理负担。",
  learningMotivation:
    "挫折情境复盘与成功体验积累帮助学生在较长时间内保持了较为稳定的学习动机。",
  computationalThinking:
    "编程思维与算法拆解练习使学生在抽象问题求解与逻辑推理上更加熟练。",
  humanAiTrust:
    "数字工具使用、信息甄别与人机协作任务提升了学生对人机交互的信任与掌控感。",
  learningMethod:
    "真实情境中的问题链训练与小组合作，使学生在学习方法倾向上更加注重策略与协作。",
  learningAttitude:
    "开放性设计任务与创造性方案迭代激发了学生积极的学习态度与创新意愿。",
  selfRegulatedLearning:
    "目标设定、时间管理反思与问题解决训练促进了学生自我调节学习能力的发展。",
  aiLiteracy:
    "人工智能工具使用与伦理思辨任务帮助学生在人工智能素养方面取得阶段性进步。",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 基于字符串生成稳定的 0~1 之间浮点数。
 * 使用类 DJB2 哈希并在 2147483647 上取模，保证相同输入永远得到相同输出。
 */
function stableHashFromString(input: string): number {
  const MOD = 2147483647;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33 + input.charCodeAt(i)) % MOD;
  }
  return hash / MOD;
}

/**
 * 基于学生节点 ID 和维度编码计算稳定增量。
 * 大多数维度落在 0.25~0.9；约 15% 的维度提升较慢（0.1~0.2），避免全部维度同步大幅增长。
 */
function computeStableDelta(
  nodeId: string,
  code: string,
  index: number,
): number {
  const base = stableHashFromString(`${nodeId}:${code}`);
  const jitterHash = stableHashFromString(`${nodeId}:jitter:${index}`);

  if (jitterHash < 0.15) {
    return roundOneDecimal(0.1 + jitterHash * 0.7);
  }

  return roundOneDecimal(0.25 + base * 0.65);
}

/** 根据变化幅度生成描述前缀（增量始终非负） */
function changeWording(delta: number): string {
  if (delta === 0) return "保持稳定";
  if (delta < 0.3) return "略有提升";
  if (delta < 0.7) return "稳步改善";
  return "明显提升";
}

/** 每个个人维度分析维度对应“增量更新”的教学干预依据文案 */
function dimensionReason(code: string, delta: number): string {
  const dimensionName = COGNITIVE_DIMENSION_LABELS[code] ?? code;
  const wording = changeWording(delta);

  if (delta === 0) {
    return `近期 ${dimensionName} 未观察到显著波动，继续保持当前学习节奏与干预策略即可。`;
  }

  return `${wording}：${DIMENSION_REASONS[code] ?? `${dimensionName}维度的针对性干预取得了阶段性进展。`}`;
}

export function generateDemoChatbotIncrementData(
  studentNodeId: string,
  baseline?: Partial<CognitiveAttributes>,
): ChatbotDimensionIncrementData {
  const aggregateDimensions = COGNITIVE_DIMENSION_KEYS.map((code, index) => {
    const previousValue = clamp(
      roundOneDecimal(
        baseline?.[code] ?? FALLBACK_BASELINE_SCORES[code] ?? 0,
      ),
      0,
      SCALE_MAX,
    );
    const delta = computeStableDelta(studentNodeId, code, index);
    const newValue = clamp(
      roundOneDecimal(previousValue + delta),
      0,
      SCALE_MAX,
    );
    const changeDelta = roundOneDecimal(newValue - previousValue);

    return {
      dimensionCode: code,
      dimensionNameZh: COGNITIVE_DIMENSION_LABELS[code] ?? code,
      category: DIMENSION_CATEGORY[code] ?? "其他",
      previousValue,
      newValue,
      changeDelta,
      reason: dimensionReason(code, changeDelta),
      updatedAt: null,
    };
  });

  return { studentNodeId, aggregateDimensions };
}
