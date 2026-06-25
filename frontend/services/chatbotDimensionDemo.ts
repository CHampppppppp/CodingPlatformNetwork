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

/**
 * 生成以正向变化为主、但保留少量小幅负向变化的 delta，
 * 让 demo 既展示积极效果，又具备一定真实感。
 * - 5%  概率小幅下降（-0.3 ~ -0.1）
 * - 35% 概率保持不变
 * - 60% 概率正向变化（小幅或中幅）
 */
function randomDelta(): number {
  const r = Math.random();
  if (r < 0.05) {
    return roundOneDecimal(-0.3 + Math.random() * 0.2);
  }
  if (r < 0.4) {
    return 0;
  }

  const positive = Math.random();
  if (positive < 0.5) {
    return roundOneDecimal(0.1 + Math.random() * 0.4);
  }
  return roundOneDecimal(0.5 + Math.random() * 1.3);
}

/** 根据变化幅度生成描述前缀 */
function changeWording(delta: number): string {
  if (delta === 0) return "保持稳定";
  if (delta > 0 && delta < 0.3) return "略有提升";
  if (delta >= 0.3 && delta < 0.7) return "稳步改善";
  if (delta >= 0.7) return "明显提升";
  return "略有回落";
}

/** 每个维度对应“增量更新”的教学干预依据文案 */
function dimensionReason(code: string, delta: number): string {
  const category = BASE_DIMENSION_CATEGORY[code] ?? "其他";
  const dimensionName = BASE_DIMENSION_NAME_ZH[code] ?? code;
  const wording = changeWording(delta);

  if (delta === 0) {
    return `近期 ${dimensionName} 未观察到显著波动，继续保持当前学习节奏与干预策略即可。`;
  }

  if (delta < 0) {
    return `略有回落：受近期任务难度或学习节奏变化影响，${dimensionName} 出现短期波动，建议关注后续变化并及时调整支持策略。`;
  }

  const reasons: Record<string, string> = {
    COG_READING:
      "通过分层阅读任务与关键信息提取练习，学生对文本的理解深度有所增强。",
    COG_LANGUAGE:
      "借助表达支架与同伴互评，学生的语言组织与表达信心逐步建立。",
    COG_SCIENCE_KNOWLEDGE:
      "围绕核心概念开展的探究活动帮助学生巩固了科学知识网络。",
    COG_SCIENCE_INQUIRY:
      "基于问题的实验设计与数据记录训练促进了科学探究能力的发展。",
    COG_COMPUTATIONAL:
      "编程思维与算法拆解练习使学生在抽象问题求解上更加熟练。",
    COG_TECH_LITERACY:
      "数字工具使用与信息甄别任务提升了学生的技术素养水平。",
    PSY_ANXIETY:
      "通过情绪识别与放松策略指导，学生的考试焦虑有所缓解。",
    PSY_DEPRESSION:
      "支持性对话与积极目标设定帮助学生改善了情绪状态。",
    PSY_RESILIENCE:
      "挫折情境复盘与成功体验积累增强了学生的心理韧性。",
    PSY_INTEREST_STABILITY:
      "主题式项目学习让学生在较长时间内保持了较为稳定的学习兴趣。",
    PSY_PRESSURE:
      "任务拆解与时间管理支持有效降低了学生的学业压力感知。",
    PSY_LIFE_SATISFACTION:
      "学习成就感与同伴支持感的提升带动了生活满意度的改善。",
    PRAC_INNOVATION:
      "开放性设计任务激发了学生的创造性想法与方案迭代意愿。",
    PRAC_PROBLEM_SOLVING:
      "真实情境中的问题链训练提升了学生分析问题与提出对策的能力。",
    PRAC_COLLABORATION:
      "小组合作与角色分工练习使学生在团队中的沟通与协调能力增强。",
    PRAC_PRACTICE:
      "动手操作与反复应用环节帮助学生将知识转化为实践技能。",
  };

  return `${wording}：${reasons[code] ?? `${category}维度的针对性干预取得了阶段性进展。`}`;
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
      reason: dimensionReason(code, changeDelta),
      updatedAt: new Date().toISOString(),
    };
  });

  return { studentNodeId, baseDimensions };
}
