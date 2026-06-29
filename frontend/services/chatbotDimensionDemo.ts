import {
  ChatbotDimensionIncrementData,
  CognitiveAttributes,
} from "../types";
import {
  COGNITIVE_DIMENSION_KEYS,
  COGNITIVE_DIMENSION_LABELS,
} from "../constants";

const SCALE_MAX = 5;

/** 当未传入学生基线时使用的默认得分，仅作为兜底 */
export const FALLBACK_BASELINE_SCORES: Record<string, number> = {
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

const DIMENSION_IMPROVE_REASONS: Record<string, string> = {
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

const DIMENSION_DECLINE_REASONS: Record<string, string> = {
  knowledgeReserve:
    "近期在概念迁移与综合应用上遇到一定瓶颈，部分前置知识出现遗忘，需要回归基础、加强连接性复习。",
  learningEngagement:
    "受任务难度或外部情境影响，学生在课堂参与和任务坚持上有所减弱，建议调整活动设计、增强内在动机。",
  cognitiveLoad:
    "虽然压力感知短期上升，但这也可能反映学生正在面对更具挑战性的任务；可辅以分解步骤与情绪调节支持。",
  learningMotivation:
    "近期挫折体验或目标模糊导致学习动机略有下降，可通过小步成功与意义感重建来恢复动力。",
  computationalThinking:
    "在抽象建模与复杂问题拆解上出现波动，建议增加脚手架与可视化工具，降低思维跳跃难度。",
  humanAiTrust:
    "对工具输出可靠性产生疑虑，或遇到误用情境，需要强化人机协作反思与数字素养引导。",
  learningMethod:
    "学习策略使用不够稳定，部分任务中依赖被动接受，建议强化元认知提示与合作学习方法。",
  learningAttitude:
    "面对开放任务时出现畏难或回避倾向，可通过降低任务复杂度、提供正向反馈来改善态度。",
  selfRegulatedLearning:
    "目标设定与时间管理近期执行不佳，建议使用学习日志与阶段复盘培养自我调节习惯。",
  aiLiteracy:
    "在伦理思辨或工具应用上遇到认知冲突，可通过案例讨论与分层任务重新建立信心。",
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
 * 基于学生节点 ID 和维度编码计算稳定变化量。
 * 大多数维度变化落在 -0.5~0.9；约 20% 的维度下降，30% 提升较慢，50% 正常提升。
 * 方向与幅度均基于 nodeId + code 的独立哈希，确保同一学生不同维度有升有降。
 */
function computeStableDelta(
  nodeId: string,
  code: string,
): number {
  const directionHash = stableHashFromString(`${nodeId}:${code}:direction`);
  const magnitudeHash = stableHashFromString(`${nodeId}:${code}:magnitude`);

  if (directionHash < 0.2) {
    // 约 20% 维度下降 -0.5 ~ -0.1
    return roundOneDecimal(-0.5 + magnitudeHash * 0.4);
  }
  if (directionHash < 0.5) {
    // 约 30% 维度提升 0.1 ~ 0.3（较慢）
    return roundOneDecimal(0.1 + magnitudeHash * 0.2);
  }

  // 约 50% 维度提升 0.25 ~ 0.9
  return roundOneDecimal(0.25 + magnitudeHash * 0.65);
}

/** 根据变化幅度生成描述前缀 */
function changeWording(delta: number): string {
  if (delta === 0) return "保持稳定";
  if (delta < -0.3) return "明显下降";
  if (delta < 0) return "略有回落";
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

  if (delta > 0) {
    return `${wording}：${DIMENSION_IMPROVE_REASONS[code] ?? `${dimensionName}维度的针对性干预取得了阶段性进展。`}`;
  }

  return `${wording}：${DIMENSION_DECLINE_REASONS[code] ?? `${dimensionName}维度在近期出现回落，需要关注并调整干预策略。`}`;
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
    const delta = computeStableDelta(studentNodeId, code);
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
