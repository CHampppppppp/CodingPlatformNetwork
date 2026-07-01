import {
  GraphData,
  Resource,
  ClassInfo,
  StudentProfile,
  StudentCognitiveTemplate,
  ClassroomAnalysis,
  NodeType,
  LearningScenarioOption,
} from "../types";
import {
  fetchScenarios as fetchScenariosFromApi,
  fetchGraphData as fetchGraphDataFromApi,
  fetchSchools,
  fetchGradesBySchool,
  fetchClassesBySchoolAndGrade,
  fetchStudentCognitiveTemplate as fetchStudentCognitiveTemplateFromApi,
  fetchResources as fetchResourcesFromApi,
  fetchResourceStudentRates,
  fetchClassroomAnalysis as fetchClassroomAnalysisFromApi,
} from "./apiService";
import { FALLBACK_SCENARIOS } from "../constants";
import {
  transformGraphData,
  validateClassInfo,
  validateScenario,
  sanitizeGraphData,
} from "./dataValidator";
import {
  withCache,
  generateCacheKey,
  graphDataCache,
} from "./performanceUtils";

function anonymizeStudentNames(data: GraphData, scenarioCode: string): GraphData {
  // 展示场景直接显示学生真实姓名，不做脱敏
  if (scenarioCode === "SHOW_CASE") {
    return data;
  }

  let studentIndex = 0;

  const nodes = data.nodes.map((node) => {
    if (node.type === NodeType.STUDENT) {
      studentIndex++;
      const anonymousName = `student_${String(studentIndex).padStart(2, "0")}`;
      return {
        ...node,
        name: anonymousName,
      };
    }
    return node;
  });

  return {
    ...data,
    nodes,
  };
}

export const getScenarios = async (): Promise<LearningScenarioOption[]> => {
  try {
    const scenarios = await fetchScenariosFromApi();
    return scenarios.length > 0 ? scenarios : [...FALLBACK_SCENARIOS];
  } catch (error) {
    console.error("获取场景列表失败，使用本地兜底场景:", error);
    return [...FALLBACK_SCENARIOS];
  }
};

/**
 * 获取可用的学校列表
 */
export const getSchools = async (scenarioCode?: string): Promise<string[]> => {
  try {
    return await fetchSchools(scenarioCode);
  } catch (error) {
    console.error("获取学校列表失败:", error);
    return [];
  }
};

/**
 * 根据学校获取年级列表
 */
export const getGradesBySchool = async (school: string, scenarioCode?: string): Promise<string[]> => {
  try {
    return await fetchGradesBySchool(school, scenarioCode);
  } catch (error) {
    console.error("获取年级列表失败:", error);
    return [];
  }
};

/**
 * 根据学校和年级获取班级列表
 */
export const getClassesBySchoolAndGrade = async (
  school: string,
  grade: string,
  scenarioCode?: string,
): Promise<string[]> => {
  try {
    return await fetchClassesBySchoolAndGrade(school, grade, scenarioCode);
  } catch (error) {
    console.error("获取班级列表失败:", error);
    return [];
  }
};

/**
 * 从API获取图谱数据
 */
export const fetchGraphData = async (
  scenarioCode: string,
  classInfo: ClassInfo,
): Promise<GraphData> => {
  console.log("从API获取图谱数据...", { scenarioCode, classInfo });

  try {
    // 验证输入参数
    validateScenario(scenarioCode);
    validateClassInfo(classInfo);

    // 生成缓存键
    const cacheKey = generateCacheKey("graphData", {
      scenarioCode,
      school: classInfo.school,
      grade: classInfo.grade,
      classId: classInfo.classId,
    });

    // 使用缓存
    const data = await withCache(cacheKey, async () => {
      // 调用API服务获取数据
      const rawData = await fetchGraphDataFromApi({
        scenarioCode,
        school: classInfo.school,
        grade: classInfo.grade,
        classId: classInfo.classId,
      });

      // 转换和验证数据
      const transformedData = transformGraphData(rawData);

      // 清理和规范化数据
      const sanitizedData = sanitizeGraphData(transformedData);

      const anonymizedData = anonymizeStudentNames(sanitizedData, scenarioCode);

      return anonymizedData;
    });

    // 验证数据内容
    if (data.nodes.length === 0) {
      console.warn("API返回空节点数据");
    }

    if (data.links.length === 0) {
      console.warn("API返回空链接数据");
    }

    console.log("API数据获取成功:", {
      nodeCount: data.nodes.length,
      linkCount: data.links.length,
      nodeTypes: Array.from(new Set(data.nodes.map((node) => node.type))),
      linkTypes: Array.from(new Set(data.links.map((link) => link.type))),
      cacheSize: graphDataCache.size(),
    });

    return data;
  } catch (error) {
    console.error("获取图谱数据失败:", error);

    // 增强错误信息
    if (error instanceof Error) {
      throw new Error(`获取图谱数据失败: ${error.message}`, { cause: error });
    }

    throw new Error("获取图谱数据失败: 未知错误");
  }
};

/**
 * 从API获取学习资源
 */
export const fetchResources = async (): Promise<Resource[]> => {
  try {
    const rawResources = await fetchResourcesFromApi();

    const resources: Resource[] = rawResources.map((r: any) => ({
      id: r.id,
      title: r.title,
      type: r.resourceType,
      relatedKnowledgeIds:
        r.knowledgeRelations?.map((rel: any) => rel.knowledgeNode?.id).filter(Boolean) || [],
      accuracy: r.acceptanceRate != null ? Math.round(r.acceptanceRate) : null,
      difficulty: r.difficulty ?? null,
      description: r.description || "",
      url: r.url || undefined,
    }));

    console.log("从API获取学习资源成功:", resources.length);
    return resources;
  } catch (error) {
    console.error("获取学习资源失败:", error);
    return [];
  }
};

export { fetchResourceStudentRates };

export const fetchClassroomAnalysis = async (
  scenarioCode: string,
  classInfo: ClassInfo,
): Promise<ClassroomAnalysis | null> => {
  try {
    const data = await fetchClassroomAnalysisFromApi({
      scenarioCode,
      school: classInfo.school,
      grade: classInfo.grade,
      classId: classInfo.classId,
    });

    return data as ClassroomAnalysis | null;
  } catch (error) {
    console.error("获取课堂视频分析数据失败:", error);
    return null;
  }
};

const dimensionCodeToKey: Record<string, keyof StudentProfile> = {
  knowledgeReserve: "knowledgeReserve",
  learningEngagement: "learningEngagement",
  cognitiveLoad: "cognitiveLoad",
  learningMotivation: "learningMotivation",
  computationalThinking: "computationalThinking",
  humanAiTrust: "humanAiTrust",
  humanMachineTrust: "humanAiTrust",
  learningMethod: "learningMethod",
  learningApproach: "learningMethod",
  learningAttitude: "learningAttitude",
  priorKnowledge: "knowledgeReserve",
  selfRegulatedLearning: "selfRegulatedLearning",
  aiLiteracy: "aiLiteracy",
};

export const fetchStudentCognitiveTemplate = async (
  studentNodeId: string,
): Promise<Partial<StudentProfile>> => {
  const result = await fetchStudentCognitiveTemplateFromApi(studentNodeId);

  const mappedScores: Partial<StudentProfile> = {
    school: result.student.school || "",
    grade: result.student.grade || "",
    classId: result.student.classId || "",
  };

  result.dimensions.forEach((dimension) => {
    const key = dimensionCodeToKey[dimension.dimensionCode];
    if (!key) {
      return;
    }

    (mappedScores as any)[key] = dimension.scoreValue;
  });

  const findScore = (codes: string[]): number | undefined => {
    const match = result.dimensions.find((item) =>
      codes.includes(item.dimensionCode),
    );
    return typeof match?.scoreValue === "number" ? match.scoreValue : undefined;
  };

  const learningMotivationScore = findScore(["learningMotivation"]);
  const learningAttitudeScore = findScore(["learningAttitude"]);
  const learningEngagementScore = findScore(["learningEngagement"]);
  const selfRegulatedLearningScore = findScore(["selfRegulatedLearning"]);
  const computationalThinkingScore = findScore(["computationalThinking"]);
  const learningApproachScore = findScore([
    "learningApproach",
    "learningMethod",
  ]);
  const cognitiveLoadScore = findScore(["cognitiveLoad"]);
  const humanMachineTrustScore = findScore([
    "humanMachineTrust",
    "humanAiTrust",
  ]);
  const aiLiteracyScore = findScore(["aiLiteracy"]);
  const knowledgeReserveScore = findScore([
    "priorKnowledge",
    "knowledgeReserve",
  ]);

  const template: StudentCognitiveTemplate = {
    profileMeta: {
      version: result.profile?.version,
      generatedAt: result.profile?.generatedAt,
      totalScore: result.profile?.totalScore,
    },
    dimensions: result.dimensions.map((dimension) => ({
      code: dimension.dimensionCode,
      name: dimension.dimensionNameZh,
      category: dimension.category,
      score: dimension.scoreValue,
      level: dimension.scoreLevel,
    })),
    learningStyle: {
      preference: undefined,
      personality: undefined,
      groupBehavior: undefined,
    },
    learningMotivation:
      typeof learningMotivationScore === "number"
        ? {
            interest: learningMotivationScore,
            usefulness: learningMotivationScore,
            expectation: learningMotivationScore,
          }
        : undefined,
    learningAttitude:
      typeof learningAttitudeScore === "number"
        ? {
            enjoyment: learningAttitudeScore,
            confidence: learningAttitudeScore,
            interest: learningAttitudeScore,
          }
        : undefined,
    learningEngagement:
      typeof learningEngagementScore === "number"
        ? {
            cognitiveEngagement: [learningEngagementScore],
          }
        : undefined,
    selfRegulatedLearning:
      typeof selfRegulatedLearningScore === "number"
        ? [selfRegulatedLearningScore]
        : undefined,
    computationalThinking:
      typeof computationalThinkingScore === "number"
        ? {
            evaluation: [computationalThinkingScore],
          }
        : undefined,
    learningApproach:
      typeof learningApproachScore === "number"
        ? {
            deepLearning: [learningApproachScore],
          }
        : undefined,
    cognitiveLoad:
      typeof cognitiveLoadScore === "number"
        ? {
            internalLoad: [cognitiveLoadScore],
          }
        : undefined,
    humanMachineTrust:
      typeof humanMachineTrustScore === "number"
        ? [humanMachineTrustScore]
        : undefined,
    aiLiteracy:
      typeof aiLiteracyScore === "number" ? [aiLiteracyScore] : undefined,
    knowledgeReserve:
      typeof knowledgeReserveScore === "number"
        ? {
            dataConcept: knowledgeReserveScore,
            algorithmConcept: knowledgeReserveScore,
            networkConcept: knowledgeReserveScore,
            informationProcessing: knowledgeReserveScore,
            informationSecurity: knowledgeReserveScore,
            aiConcept: knowledgeReserveScore,
          }
        : undefined,
  };

  mappedScores.template = template;
  return mappedScores;
};
