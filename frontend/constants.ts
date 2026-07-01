/// <reference types="vite/client" />

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.MODE === "production"
    ? "http://interaction-network.mgsai.cn/api/v1"
    : "http://localhost:3334/api/v1");

export const BASE_DIMENSION_CODES = [
  "COG_READING",
  "COG_LANGUAGE",
  "COG_SCIENCE_KNOWLEDGE",
  "COG_SCIENCE_INQUIRY",
  "COG_COMPUTATIONAL",
  "COG_TECH_LITERACY",
  "PSY_ANXIETY",
  "PSY_DEPRESSION",
  "PSY_PRESSURE",
  "PSY_LIFE_SATISFACTION",
  "PSY_RESILIENCE",
  "PSY_INTEREST_STABILITY",
  "PRAC_INNOVATION",
  "PRAC_PROBLEM_SOLVING",
  "PRAC_COLLABORATION",
  "PRAC_PRACTICE",
] as const;

export const PORTRAIT_FEATURE_SCENARIOS = [
  "SHOW_CASE",
  "ONLINE_COURSE",
  "TEACHER_QA",
  "HOME_LEARNING",
  "COLLABORATIVE_LEARNING",
  "INFORMAL_LEARNING",
] as const;

export const FALLBACK_SCENARIOS = [
  { code: "SHOW_CASE", nameZh: "展示场景", sortOrder: 0, isActive: true },
  { code: "ONLINE_COURSE", nameZh: "学科课程在线学习", sortOrder: 1, isActive: true },
  { code: "TEACHER_QA", nameZh: "课后线上教师授课答疑", sortOrder: 2, isActive: true },
  { code: "HOME_LEARNING", nameZh: "家庭在线学习", sortOrder: 3, isActive: true },
  { code: "COLLABORATIVE_LEARNING", nameZh: "在线协作学习", sortOrder: 4, isActive: true },
  { code: "INFORMAL_LEARNING", nameZh: "社团课等非正式学习", sortOrder: 5, isActive: true },
] as const;

export const LIKERT_SCALE_MAP: Record<string, number> = {
  非常同意: 5,
  同意: 4,
  一般: 3,
  不同意: 2,
  非常不同意: 1,
};

export const COGNITIVE_DIMENSION_LABELS: Record<string, string> = {
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

export const COGNITIVE_DIMENSION_KEYS = [
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

export function buildSearchUrl(title: string, type: string): string {
  const encoded = encodeURIComponent(title);
  switch (type) {
    case "VIDEO":
    case "视频":
      return `https://search.bilibili.com/all?keyword=${encoded}`;
    case "ARTICLE":
    case "文章":
      return `https://www.zhihu.com/search?type=content&q=${encoded}`;
    case "DOCUMENT":
    case "文档":
      return `https://wenku.baidu.com/search?word=${encoded}`;
    case "PRACTICE":
    case "练习题":
    case "GAME":
    case "互动游戏":
    default:
      return `https://cn.bing.com/search?q=${encoded}`;
  }
}

export const VALID_NODE_TYPES = ["STUDENT", "TEACHER", "KNOWLEDGE"] as const;
