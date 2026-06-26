import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Settings,
  Users,
  Network,
  BookOpen,
  BarChart3,
  RefreshCw,
  X,
  User,
  Lightbulb,
  Book,
  Link as LinkIcon,
  ExternalLink,
  GraduationCap,
  PieChart,
  GitGraph,
  ChevronRight,
  LayoutDashboard,
  Layers,
  Activity,
  Loader2,
  AlertCircle,
  Stethoscope,
} from "lucide-react";
import NetworkGraph from "./components/NetworkGraph";
import AnalysisPanel from "./components/AnalysisPanel";
import StarRating from "./components/StarRating";
import {
  fetchGraphData,
  fetchResources,
  getScenarios,
  getSchools,
  getGradesBySchool,
  getClassesBySchoolAndGrade,
  fetchResourceStudentRates,
} from "./services/dataService";
import { fetchStudentCognitiveTemplate as fetchStudentCognitiveTemplateRaw, fetchStudentExpertIntervention, fetchChatbotDimensionIncrement } from "./services/apiService";
import { generateDemoChatbotIncrementData, FALLBACK_BASELINE_SCORES } from "./services/chatbotDimensionDemo";
import { getStrategy, getLearningStyleStrategies } from "./services/strategies";
import {
  recommendResources,
  RecommendedResource,
} from "./services/resourceRecommendation";
import {
  computeAggregateDimensions,
} from "./services/dimensionUtils";
import {
  GraphData,
  Resource,
  ClassInfo,
  NodeType,
  GraphNode,
  CognitiveAttributes,
  InteractionType,
  GraphLink,
  StudentProfile,
  LearningScenarioOption,
  ChatbotDimensionIncrementData,
} from "./types";
import {
  COGNITIVE_DIMENSION_LABELS,
  COGNITIVE_DIMENSION_KEYS,
  LIKERT_SCALE_MAP,
  buildSearchUrl,
  FALLBACK_SCENARIOS,
} from "./constants";

// 切换 chatbot 维度增量更新为演示模式（true=模拟数据，false=真实接口）
const DEMO_CHATBOT_INCREMENT = true;

const CHATBOT_INCREMENT_STORAGE_KEY = "chatbot-increment-scores";

function readStoredIncrementScores(): Record<string, Partial<CognitiveAttributes>> {
  try {
    const raw = localStorage.getItem(CHATBOT_INCREMENT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredIncrementScores(
  scores: Record<string, Partial<CognitiveAttributes>>,
): void {
  try {
    localStorage.setItem(CHATBOT_INCREMENT_STORAGE_KEY, JSON.stringify(scores));
  } catch (err) {
    console.warn("保存增量得分到 localStorage 失败:", err);
  }
}

function storeIncrementScore(
  nodeId: string,
  scores: Partial<CognitiveAttributes>,
): void {
  const all = readStoredIncrementScores();
  all[nodeId] = scores;
  writeStoredIncrementScores(all);
}

function getStoredIncrementScore(
  nodeId: string,
): Partial<CognitiveAttributes> | null {
  return readStoredIncrementScores()[nodeId] ?? null;
}

const dimensionCodeToStrategyKey: Record<string, keyof CognitiveAttributes> = {
  knowledgeReserve: "knowledgeReserve",
  priorKnowledge: "knowledgeReserve",
  learningEngagement: "learningEngagement",
  cognitiveLoad: "cognitiveLoad",
  learningMotivation: "learningMotivation",
  computationalThinking: "computationalThinking",
  humanAiTrust: "humanAiTrust",
  humanMachineTrust: "humanAiTrust",
  learningMethod: "learningMethod",
  learningApproach: "learningMethod",
  learningAttitude: "learningAttitude",
  selfRegulatedLearning: "selfRegulatedLearning",
  aiLiteracy: "aiLiteracy",
};

function isRealUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith('http') && !url.includes('example.com');
}

function isGraphNode(value: string | GraphNode): value is GraphNode {
  return typeof value === "object" && value !== null && "id" in value;
}

function hasCognitiveProfileValues(profile: Partial<StudentProfile> | undefined): boolean {
  if (!profile) return false;
  return Object.keys(COGNITIVE_DIMENSION_LABELS).some((key) => {
    const value = profile[key as keyof CognitiveAttributes];
    return typeof value === "number" && value > 0;
  });
}

const App: React.FC = () => {
  // State
  const [scenarioOptions, setScenarioOptions] = useState<LearningScenarioOption[]>(
    [...FALLBACK_SCENARIOS],
  );
  const [scenarioCode, setScenarioCode] = useState<string>(
    FALLBACK_SCENARIOS[0].code,
  );
  const [classInfo, setClassInfo] = useState<ClassInfo>({
    school: "",
    grade: "",
    classId: "",
  });

  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [],
    links: [],
  });
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);
  const [studentRates, setStudentRates] = useState<
    Record<string, number>
  >({});

  // Loading and Error State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Analysis Panel State
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [analysisDefaultTab, setAnalysisDefaultTab] = useState<
    "overview" | "subgraph"
  >("overview");

  // Tooltip State
  const [hoveredAttribute, setHoveredAttribute] = useState<{
    key?: keyof CognitiveAttributes;
    label: string;
    score: number;
  } | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [templateLoadingStudentId, setTemplateLoadingStudentId] = useState<
    string | null
  >(null);

  const [isExpertInterventionOpen, setIsExpertInterventionOpen] = useState(false);
  const [expertInterventionData, setExpertInterventionData] = useState<
    Awaited<ReturnType<typeof fetchStudentExpertIntervention>> | null
  >(null);
  const [expertInterventionLoading, setExpertInterventionLoading] = useState(false);

  const [isRecommendOpen, setIsRecommendOpen] = useState(false);
  const [recommendedResources, setRecommendedResources] = useState<
    RecommendedResource[]
  >([]);
  const [resourceRatings, setResourceRatings] = useState<Record<string, number>>({});

  const interventionAnalysis = useMemo(() => {
    if (!expertInterventionData) return null;
    const baseScoreMap = expertInterventionData.dimensions.reduce<
      Record<string, number>
    >((acc, item) => {
      acc[item.dimensionCode] = item.scoreValue;
      return acc;
    }, {});
    const aggregateScores = computeAggregateDimensions(baseScoreMap);
    const learningStyle = getLearningStyleStrategies(aggregateScores);
    return { aggregateScores, learningStyle };
  }, [expertInterventionData]);

  const [isChatbotIncrementOpen, setIsChatbotIncrementOpen] = useState(false);
  const [chatbotIncrementData, setChatbotIncrementData] = useState<
    ChatbotDimensionIncrementData | null
  >(null);
  const [chatbotIncrementLoading, setChatbotIncrementLoading] = useState(false);
  const [isIncrementApplied, setIsIncrementApplied] = useState(false);

  // Class options state (loaded async)
  const [classOptions, setClassOptions] = useState<{
    schools: string[];
    grades: string[];
    classes: string[];
  }>({
    schools: [],
    grades: [],
    classes: [],
  });

  // Options loading state
  const [optionsLoading, setOptionsLoading] = useState({
    schools: false,
    grades: false,
    classes: false,
  });

  const selectedScenarioOption = useMemo(
    () => scenarioOptions.find((item) => item.code === scenarioCode),
    [scenarioOptions, scenarioCode],
  );

  useEffect(() => {
    let isMounted = true;

    getScenarios().then((items) => {
      if (!isMounted) return;
      setScenarioOptions(items);
      setScenarioCode((prev) => {
        const exists = items.some((item) => item.code === prev);
        return exists ? prev : items[0]?.code ?? FALLBACK_SCENARIOS[0].code;
      });
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const formatProfileValue = (val?: string | null): string => {
    if (!val) return "未知";
    const score = LIKERT_SCALE_MAP[val];
    return score !== undefined ? `${val} (${score}/5)` : val;
  };

  // Reset filters function - clears all selection states
  const resetFilters = useCallback(() => {
    if (classOptions.schools.length > 0) {
      setClassInfo({
        school: classOptions.schools[0],
        grade: "",
        classId: "",
      });
    }
    setScenarioCode(scenarioOptions[0]?.code ?? FALLBACK_SCENARIOS[0].code);
  }, [classOptions.schools, scenarioOptions]);

  useEffect(() => {
    const loadSchools = async () => {
      setOptionsLoading((prev) => ({ ...prev, schools: true }));
      try {
        const schools = await getSchools(scenarioCode);
        setClassOptions((prev) => ({ ...prev, schools }));

        if (schools.length > 0) {
          setClassInfo((prev) => ({
            ...prev,
            school: schools[0],
            grade: "",
            classId: "",
          }));
        } else {
          setClassInfo((prev) => ({
            ...prev,
            school: "",
            grade: "",
            classId: "",
          }));
        }
      } catch (error) {
        console.error("加载学校列表失败:", error);
      } finally {
        setOptionsLoading((prev) => ({ ...prev, schools: false }));
      }
    };

    loadSchools();
  }, [scenarioCode]);

  // Load grades when school changes
  useEffect(() => {
    if (!classInfo.school) return;

    const loadGrades = async () => {
      setOptionsLoading((prev) => ({ ...prev, grades: true }));
      try {
        const grades = await getGradesBySchool(classInfo.school, scenarioCode);
        setClassOptions((prev) => ({ ...prev, grades }));

        setClassInfo((prev) => ({
          ...prev,
          grade: grades.length > 0 ? grades[0] : "",
          classId: "",
        }));
      } catch (error) {
        console.error("加载年级列表失败:", error);
        setClassOptions((prev) => ({ ...prev, grades: [] }));
      } finally {
        setOptionsLoading((prev) => ({ ...prev, grades: false }));
      }
    };

    loadGrades();
  }, [classInfo.school, scenarioCode]);

  // Load classes when school or grade changes
  useEffect(() => {
    if (!classInfo.school || !classInfo.grade) {
      return;
    }

    const loadClasses = async () => {
      setOptionsLoading((prev) => ({ ...prev, classes: true }));
      try {
        const classes = await getClassesBySchoolAndGrade(
          classInfo.school,
          classInfo.grade,
          scenarioCode,
        );
        setClassOptions((prev) => ({ ...prev, classes }));

        // Set initial class if available
        if (classes.length > 0) {
          setClassInfo((prev) => ({
            ...prev,
            classId: classes[0],
          }));
        } else {
          setClassInfo((prev) => ({
            ...prev,
            classId: "",
          }));
        }
      } catch (error) {
        console.error("加载班级列表失败:", error);
        setClassOptions((prev) => ({ ...prev, classes: [] }));
      } finally {
        setOptionsLoading((prev) => ({ ...prev, classes: false }));
      }
    };

    loadClasses();
  }, [classInfo.school, classInfo.grade, scenarioCode]);

  const requestIdRef = useRef(0);
  const loadDataTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback(async () => {
    if (!classInfo.school || !classInfo.grade || !classInfo.classId) return;

    const currentRequestId = ++requestIdRef.current;

    setLoading(true);
    setError(null);
    setSelectedResource(null);
    setSelectedNode(null);
    setHighlightedNodeIds([]);
    setStudentRates({});
    setHoveredAttribute(null);

    try {
      const data = await fetchGraphData(scenarioCode, classInfo);

      setGraphData(data);

      const allResources = await fetchResources();
      const knowledgeNodeIds = new Set(
        data.nodes.filter((n) => n.type === NodeType.KNOWLEDGE).map((n) => n.id),
      );
      const connectedResources = allResources.filter((r) =>
        r.relatedKnowledgeIds.some((id) => knowledgeNodeIds.has(id)),
      );
      setResources(connectedResources);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "加载数据失败，请重试";
      setError(errorMessage);
      console.error("加载数据失败:", err);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [scenarioCode, classInfo]);

  useEffect(() => {
    if (loadDataTimeoutRef.current) {
      clearTimeout(loadDataTimeoutRef.current);
      loadDataTimeoutRef.current = null;
    }

    if (!classInfo.school || !classInfo.grade || !classInfo.classId) {
      return;
    }

    loadDataTimeoutRef.current = setTimeout(() => {
      loadData();
    }, 300);

    return () => {
      if (loadDataTimeoutRef.current) {
        clearTimeout(loadDataTimeoutRef.current);
        loadDataTimeoutRef.current = null;
      }
    };
  }, [classInfo.school, classInfo.grade, classInfo.classId, scenarioCode]);

  const openAnalysis = (tab: "overview" | "subgraph") => {
    setAnalysisDefaultTab(tab);
    setIsAnalysisOpen(true);
  };

  const handleResourceClick = async (resource: Resource) => {
    if (selectedResource === resource.id) {
      setSelectedResource(null);
      setHighlightedNodeIds([]);
      setStudentRates({});
    } else {
      setSelectedResource(resource.id);
      setSelectedNode(null);

      const kIds = resource.relatedKnowledgeIds;
      const connectedStudentIds: string[] = [];
      const studentIdSet = new Set(
        graphData.nodes
          .filter((n) => n.type === NodeType.STUDENT)
          .map((n) => n.id),
      );

      graphData.links.forEach((link) => {
        const sourceId = isGraphNode(link.source) ? link.source.id : link.source;
        const targetId = isGraphNode(link.target) ? link.target.id : link.target;

        if (kIds.includes(sourceId)) {
          if (studentIdSet.has(targetId)) connectedStudentIds.push(targetId);
        } else if (kIds.includes(targetId)) {
          if (studentIdSet.has(sourceId)) connectedStudentIds.push(sourceId);
        }
      });

      try {
        const studentIdsInGraph = Array.from(studentIdSet);
        const rawRates = await fetchResourceStudentRates(resource.id, studentIdsInGraph);
        const ratedStudentIds = Object.keys(rawRates).filter((id) =>
          studentIdSet.has(id),
        );
        const highlightSet = new Set([...kIds, ...connectedStudentIds, ...ratedStudentIds]);
        setHighlightedNodeIds(Array.from(highlightSet));
        setStudentRates(rawRates);
      } catch {
        setHighlightedNodeIds([...kIds, ...connectedStudentIds]);
        setStudentRates({});
      }
    }
  };

  const handleNodeClick = async (node: GraphNode) => {
    setSelectedNode(node);
    setIsIncrementApplied(false);
    setSelectedResource(null);
    setStudentRates({});

    // 在个人画板展开时，console.log 当前学生的学习投入（learningEngagement）原始值。
    if (node.type === NodeType.STUDENT) {
      console.log(
        `[learningEngagement] ${node.name} (${node.id}):`,
        node.studentProfile?.learningEngagement ?? 0,
      );
    }

    if (node.type === NodeType.KNOWLEDGE) {
      const connectedStudentIds: string[] = [];
      const studentIdSet = new Set(
        graphData.nodes.filter((n) => n.type === NodeType.STUDENT).map((n) => n.id),
      );

      graphData.links.forEach((link) => {
        const sourceId = isGraphNode(link.source) ? link.source.id : link.source;
        const targetId = isGraphNode(link.target) ? link.target.id : link.target;

        if (sourceId === node.id && studentIdSet.has(targetId)) {
          connectedStudentIds.push(targetId);
        } else if (targetId === node.id && studentIdSet.has(sourceId)) {
          connectedStudentIds.push(sourceId);
        }
      });

      setHighlightedNodeIds([node.id, ...connectedStudentIds]);
      return;
    }

    if (node.type === NodeType.STUDENT) {
      const connectedKnowledgeIds: string[] = [];
      const knowledgeIdSet = new Set(
        graphData.nodes.filter((n) => n.type === NodeType.KNOWLEDGE).map((n) => n.id),
      );

      graphData.links.forEach((link) => {
        const sourceId = isGraphNode(link.source) ? link.source.id : link.source;
        const targetId = isGraphNode(link.target) ? link.target.id : link.target;

        if (sourceId === node.id && knowledgeIdSet.has(targetId)) {
          connectedKnowledgeIds.push(targetId);
        } else if (targetId === node.id && knowledgeIdSet.has(sourceId)) {
          connectedKnowledgeIds.push(sourceId);
        }
      });

      setHighlightedNodeIds([node.id, ...connectedKnowledgeIds]);
    } else {
      setHighlightedNodeIds([node.id]);
    }

    if (node.type !== NodeType.STUDENT) {
      return;
    }

    try {
      setTemplateLoadingStudentId(node.id);
      const templateProfile = await fetchStudentCognitiveTemplateRaw(node.id);

      const dimMap = new Map<string, number>(
        templateProfile.dimensions.map((d) => [d.dimensionCode, d.scoreValue]),
      );

      const getDim = (code: string): number => dimMap.get(code) ?? 0;

      const precomputedKeys = [
        'knowledgeReserve',
        'learningEngagement',
        'cognitiveLoad',
        'learningMotivation',
        'computationalThinking',
        'humanAiTrust',
        'learningMethod',
        'learningAttitude',
        'selfRegulatedLearning',
        'aiLiteracy',
      ];
      const hasPrecomputedDimensions = precomputedKeys.some(
        (key) => dimMap.has(key) && (dimMap.get(key) ?? 0) > 0,
      );

      let newProfileData: Partial<StudentProfile>;

      if (hasPrecomputedDimensions) {
        newProfileData = {
          knowledgeReserve: getDim('knowledgeReserve'),
          learningEngagement: getDim('learningEngagement'),
          cognitiveLoad: getDim('cognitiveLoad'),
          learningMotivation: getDim('learningMotivation'),
          computationalThinking: getDim('computationalThinking'),
          humanAiTrust: getDim('humanAiTrust'),
          learningMethod: getDim('learningMethod'),
          learningAttitude: getDim('learningAttitude'),
          selfRegulatedLearning: getDim('selfRegulatedLearning'),
          aiLiteracy: getDim('aiLiteracy'),
        };
      } else {
        const knowledgeReserve =
          ((getDim("COG_READING") + getDim("COG_LANGUAGE") + getDim("COG_SCIENCE_KNOWLEDGE")) / 3) / 2;
        const learningEngagement =
          ((getDim("COG_SCIENCE_INQUIRY") + getDim("PRAC_PRACTICE") + getDim("PRAC_COLLABORATION")) / 3) / 2;
        const cognitiveLoad =
          ((getDim("PSY_ANXIETY") + getDim("PSY_DEPRESSION") + getDim("PSY_PRESSURE")) / 3) * 0.5;
        const learningMotivation = getDim("PSY_RESILIENCE") / 2;
        const computationalThinking = getDim("COG_COMPUTATIONAL") / 2;
        const humanAiTrust = getDim("COG_TECH_LITERACY") / 2;
        const learningMethod =
          ((getDim("PRAC_PROBLEM_SOLVING") + getDim("PRAC_COLLABORATION")) / 2) / 2;
        const learningAttitude = getDim("PRAC_INNOVATION") / 2;
        const selfRegulatedLearning = getDim("PRAC_PROBLEM_SOLVING") / 2;
        const aiLiteracy = getDim("COG_TECH_LITERACY") / 2;

        newProfileData = {
          knowledgeReserve,
          learningEngagement,
          cognitiveLoad,
          learningMotivation,
          computationalThinking,
          humanAiTrust,
          learningMethod,
          learningAttitude,
          selfRegulatedLearning,
          aiLiteracy,
        };
      }

      const DIMENSION_ORDER = new Map([
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

      const sortedDimensions = [...templateProfile.dimensions].sort(
        (a, b) =>
          (DIMENSION_ORDER.get(a.dimensionCode) ?? 999) -
          (DIMENSION_ORDER.get(b.dimensionCode) ?? 999),
      );

      newProfileData.template = {
        profileMeta: templateProfile.profile
          ? {
            version: templateProfile.profile.version,
            generatedAt: templateProfile.profile.generatedAt,
            totalScore: templateProfile.profile.totalScore,
          }
          : undefined,
        dimensions: sortedDimensions.map((d) => ({
          code: d.dimensionCode,
          name: d.dimensionNameZh,
          category: d.category,
          score: d.scoreValue,
          level: d.scoreLevel,
        })),
      };

      setSelectedNode((prev) => {
        if (!prev || prev.id !== node.id || prev.type !== NodeType.STUDENT) {
          return prev;
        }

        const baseProfile = prev.studentProfile || {
          school: "",
          grade: "",
          classId: "",
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

        const storedScores = getStoredIncrementScore(node.id);
        const hasStoredIncrement = storedScores !== null;
        setIsIncrementApplied(hasStoredIncrement);

        return {
          ...prev,
          studentProfile: {
            ...baseProfile,
            ...newProfileData,
            ...storedScores,
          },
        };
      });
    } catch (err) {
      console.error("加载学生认知模板失败:", err);
    } finally {
      setTemplateLoadingStudentId(null);
    }
  };

  const closeNodeDetail = () => {
    setSelectedNode(null);
    setHighlightedNodeIds([]);
    setStudentRates({});
    setHoveredAttribute(null);
    setIsExpertInterventionOpen(false);
    setExpertInterventionData(null);
    setIsRecommendOpen(false);
    setRecommendedResources([]);
    setIsChatbotIncrementOpen(false);
    setChatbotIncrementData(null);
  };

  const handleOpenExpertIntervention = async () => {
    if (!selectedNode || selectedNode.type !== NodeType.STUDENT) return;

    setIsExpertInterventionOpen(true);
    setExpertInterventionLoading(true);
    try {
      const data = await fetchStudentExpertIntervention(selectedNode.id);
      setExpertInterventionData(data);
    } catch (err) {
      console.error("加载专家干预数据失败:", err);
    } finally {
      setExpertInterventionLoading(false);
    }
  };

  const handleCloseExpertIntervention = () => {
    setIsExpertInterventionOpen(false);
    setExpertInterventionData(null);
  };

  const handleOpenRecommend = () => {
    if (!selectedNode || selectedNode.type !== NodeType.STUDENT) return;
    const profile = selectedNode.studentProfile;
    if (!profile) return;

    // 学习投入（learningEngagement）由后端 CognitiveProfileService 统一从
    // StudentProfile.totalDegree 计算并下发，前端直接使用，保证前后端口径一致。
    const engagement =
      typeof profile.learningEngagement === "number" ? profile.learningEngagement : 0;

    // 如果刚完成 AI 辅导维度增量，优先使用增量后的最新知识储备得分；
    // 否则使用个人画板中当前展示的学生画像数据。
    const incrementData =
      chatbotIncrementData?.studentNodeId === selectedNode.id
        ? chatbotIncrementData
        : null;
    const knowledgeReserveDim = incrementData?.aggregateDimensions.find(
      (d) => d.dimensionCode === "knowledgeReserve",
    );

    const knowledgeReserve =
      typeof knowledgeReserveDim?.newValue === "number"
        ? knowledgeReserveDim.newValue
        : typeof profile.knowledgeReserve === "number"
          ? profile.knowledgeReserve
          : 0;

    console.log(
      `[Recommend Input] ${selectedNode.name} (${selectedNode.id}):`,
      { knowledgeReserve, engagement },
    );

    setRecommendedResources(
      recommendResources(resources, knowledgeReserve, engagement),
    );
    setIsRecommendOpen(true);
  };

  const handleCloseRecommend = () => {
    setIsRecommendOpen(false);
    setRecommendedResources([]);
    setResourceRatings({});
  };

  // 资格判断绑定到「选中的学生节点自身」的班级，而非全局下拉框的 classInfo.classId。
  // 后端已将 studentProfile.classId 解析为班级显示名（含 "801"），且节点一旦选中即稳定，
  // 不受 school/grade/class 三级级联异步重置与竞态影响，避免按钮间歇性消失。
  const isChatbotIncrementEligible = useMemo(() => {
    if (scenarioCode !== "SHOW_CASE") return false;
    if (!selectedNode || selectedNode.type !== NodeType.STUDENT) return false;
    const studentClassId = selectedNode.studentProfile?.classId ?? "";
    return studentClassId.includes("801");
  }, [scenarioCode, selectedNode]);

  const handleChatbotIncrement = async () => {
    if (!selectedNode || selectedNode.type !== NodeType.STUDENT) return;

    setChatbotIncrementLoading(true);
    try {
      const baselineProfile = selectedNode.studentProfile;
      const data = DEMO_CHATBOT_INCREMENT
        ? generateDemoChatbotIncrementData(selectedNode.id, baselineProfile)
        : await fetchChatbotDimensionIncrement(selectedNode.id);
      setChatbotIncrementData(data);

      const aggregateScores = data.aggregateDimensions.reduce<
        Partial<CognitiveAttributes>
      >((acc, item) => {
        (acc as Record<string, number>)[item.dimensionCode] = item.newValue;
        return acc;
      }, {});

      setSelectedNode((prev) => {
        if (!prev || prev.id !== selectedNode.id || prev.type !== NodeType.STUDENT) {
          return prev;
        }

        const baseProfile = prev.studentProfile || {
          school: "",
          grade: "",
          classId: "",
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

        const updatedProfile = {
          ...baseProfile,
          ...aggregateScores,
        };

        storeIncrementScore(prev.id, aggregateScores);

        return {
          ...prev,
          studentProfile: updatedProfile,
        };
      });

      setIsIncrementApplied(true);
      setTimeout(() => {
        setIsChatbotIncrementOpen(true);
      }, 600);
    } catch (err) {
      console.error("加载 chatbot 维度增量数据失败:", err);
    } finally {
      setChatbotIncrementLoading(false);
    }
  };

  const handleCloseChatbotIncrement = () => {
    setIsChatbotIncrementOpen(false);
  };

  const handleAttributeEnter = (
    e: React.MouseEvent,
    label: string,
    score: number,
    key?: keyof CognitiveAttributes,
  ) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltipPosition({ x: rect.left - 340, y: rect.top }); // Position to the left of the bar
    setHoveredAttribute({ key, label, score });
  };

  const handleAttributeLeave = () => {
    setHoveredAttribute(null);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 overflow-hidden relative font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header */}
      <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-6 z-30 shrink-0 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl shadow-lg shadow-indigo-200">
            <Network className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">
              教育交互网络
            </h1>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">
              交互式学习网络可视化
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => openAnalysis("overview")}
            className="group flex items-center gap-2 bg-white text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 transition-all border border-slate-200 shadow-sm hover:shadow text-sm font-medium active:scale-95"
          >
            <PieChart className="w-4 h-4 text-indigo-500 group-hover:scale-110 transition-transform" />
            <span>统计分析</span>
          </button>
          <button
            onClick={() => openAnalysis("subgraph")}
            className="group flex items-center gap-2 bg-white text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 transition-all border border-slate-200 shadow-sm hover:shadow text-sm font-medium active:scale-95"
          >
            <GitGraph className="w-4 h-4 text-violet-500 group-hover:scale-110 transition-transform" />
            <span>子图透视</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Control Panel */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col z-20 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.05)]">
          <div className="p-5 border-b border-slate-100 flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-2 mb-6">
              <Settings className="w-4 h-4 text-slate-400" />
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                控制面板
              </h2>
            </div>

            {/* Scenario Selection */}
            <div className="mb-8">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">
                <LayoutDashboard className="w-3 h-3" /> 学习场景
              </label>
              <div className="space-y-1">
                {scenarioOptions.map((item) => (
                  <button
                    key={item.code}
                    onClick={() => setScenarioCode(item.code)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all duration-200 flex items-center justify-between group ${scenarioCode === item.code
                        ? "bg-indigo-50 text-indigo-700 font-medium ring-1 ring-indigo-200"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                      }`}
                  >
                    <span>{item.nameZh}</span>
                    {scenarioCode === item.code && (
                      <ChevronRight className="w-3 h-3 text-indigo-500" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Class Selection */}
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">
                <Users className="w-3 h-3" /> 班级设置
              </label>
              <div className="space-y-3">
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg py-2 pl-3 pr-8 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer hover:border-slate-300"
                    value={classInfo.school}
                    onChange={(e) =>
                      setClassInfo({
                        ...classInfo,
                        school: e.target.value,
                        grade: "",
                        classId: ""
                      })
                    }
                    disabled={optionsLoading.schools}
                  >
                    {optionsLoading.schools ? (
                      <option value="">加载中...</option>
                    ) : classOptions.schools.length > 0 ? (
                      classOptions.schools.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))
                    ) : (
                      <option value="">暂无学校数据</option>
                    )}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                    {optionsLoading.schools ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ChevronRight className="w-3 h-3 rotate-90" />
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="relative w-1/2">
                    <select
                      className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg py-2 pl-3 pr-8 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer hover:border-slate-300"
                      value={classInfo.grade}
                      onChange={(e) =>
                        setClassInfo({
                          ...classInfo,
                          grade: e.target.value,
                          classId: ""
                        })
                      }
                      disabled={optionsLoading.grades || !classInfo.school}
                    >
                      {optionsLoading.grades ? (
                        <option value="">加载中...</option>
                      ) : classOptions.grades.length > 0 ? (
                        classOptions.grades.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))
                      ) : classInfo.school ? (
                        <option value="">暂无年级数据</option>
                      ) : (
                        <option value="">请选择学校</option>
                      )}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                      {optionsLoading.grades ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ChevronRight className="w-3 h-3 rotate-90" />
                      )}
                    </div>
                  </div>
                  <div className="relative w-1/2">
                    <select
                      className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg py-2 pl-3 pr-8 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer hover:border-slate-300"
                      value={classInfo.classId}
                      onChange={(e) =>
                        setClassInfo({ ...classInfo, classId: e.target.value })
                      }
                      disabled={
                        optionsLoading.classes ||
                        !classInfo.school ||
                        !classInfo.grade
                      }
                    >
                      {optionsLoading.classes ? (
                        <option value="">加载中...</option>
                      ) : classOptions.classes.length > 0 ? (
                        classOptions.classes.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))
                      ) : classInfo.school && classInfo.grade ? (
                        <option value="">暂无班级数据</option>
                      ) : (
                        <option value="">请选择班级</option>
                      )}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                      {optionsLoading.classes ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ChevronRight className="w-3 h-3 rotate-90" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 mt-auto bg-slate-50 border-t border-slate-200">
            <button
              onClick={resetFilters}
              className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-600 px-4 py-2.5 rounded-lg shadow-sm hover:bg-white hover:text-indigo-600 hover:border-indigo-300 hover:shadow transition-all text-xs font-semibold active:translate-y-0.5"
            >
              <RefreshCw className="w-3 h-3" /> 重置筛选条件
            </button>
          </div>
        </aside>

        {/* Center Visualization */}
        <main className="flex-1 bg-slate-100/50 p-4 relative flex flex-col">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 relative flex flex-col overflow-hidden ring-1 ring-slate-900/5">
            {/* Canvas Header overlay */}
            <div className="absolute top-5 left-5 z-10 pointer-events-none">
              <h3 className="text-xl font-bold text-slate-800 tracking-tight">
                {classInfo.school} {classInfo.classId}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                <p className="text-xs font-medium text-slate-500">
                  场景: <span className="text-indigo-600">{selectedScenarioOption?.nameZh ?? scenarioCode}</span>
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-hidden p-0 relative bg-slate-50/30">
              {/* Loading Indicator */}
              {loading && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    <p className="text-sm font-medium text-slate-600">
                      加载数据中...
                    </p>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="absolute inset-0 bg-red-50/50 backdrop-blur-sm flex items-center justify-center z-50 p-8">
                  <div className="bg-white rounded-xl shadow-lg p-6 max-w-md text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-slate-800 mb-2">
                      加载失败
                    </h3>
                    <p className="text-sm text-slate-600 mb-4">{error}</p>
                    <button
                      onClick={loadData}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                    >
                      重试
                    </button>
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!loading && !error && graphData.nodes.length === 0 && (
                <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-40">
                  <div className="flex flex-col items-center gap-3 max-w-md px-6 text-center">
                    <Network className="w-16 h-16 text-slate-300" />
                    <h3 className="text-lg font-bold text-slate-700">
                      暂无数据
                    </h3>
                    <p className="text-sm text-slate-500 mb-4">
                      未找到符合当前筛选条件的数据，请尝试调整筛选选项或联系管理员确认数据是否存在。
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={loadData}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                      >
                        重新加载
                      </button>
                      <button
                        onClick={resetFilters}
                        className="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors text-sm font-medium"
                      >
                        重置筛选
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <NetworkGraph
                data={graphData}
                highlightedNodeIds={highlightedNodeIds}
                studentRates={studentRates}
                selectedNode={selectedNode}
                selectedResource={selectedResource}
                onNodeClick={handleNodeClick}
              />

              {/* Chatbot Dimension Increment Popover */}
              {isChatbotIncrementOpen && chatbotIncrementData && (
                <div className="absolute top-5 right-[340px] w-72 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-30 animate-in fade-in slide-in-from-right-4 duration-200">
                  <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-700">维度得分依据</h3>
                    <button
                      onClick={handleCloseChatbotIncrement}
                      className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full p-1 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                    {chatbotIncrementData.aggregateDimensions.map((item) => {
                      const previousValue = item.previousValue ?? 0;
                      const newValue = item.newValue;
                      return (
                        <div
                          key={item.dimensionCode}
                          className="text-xs border-b border-slate-50 last:border-0 pb-3 last:pb-0"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-slate-700 truncate pr-2">
                              {item.dimensionNameZh}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-slate-400">{previousValue.toFixed(1)}</span>
                              <span className="text-slate-300">→</span>
                              <span className="font-medium text-slate-800">{newValue.toFixed(1)}</span>
                              <span
                                className={
                                  item.changeDelta >= 0
                                    ? "text-emerald-600"
                                    : "text-rose-600"
                                }
                              >
                                {item.changeDelta >= 0 ? "+" : ""}
                                {item.changeDelta.toFixed(1)}
                              </span>
                            </div>
                          </div>
                          {item.reason && (
                            <div className="text-[11px] text-slate-500 leading-relaxed">
                              {item.reason}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Floating Node Detail Card */}
              {selectedNode && (
                <div className="absolute top-5 right-5 w-80 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 ring-1 ring-slate-900/10 overflow-hidden animate-in fade-in slide-in-from-right-8 duration-300 z-20">
                  {/* Header based on Node Type */}
                  <div
                    className={`p-5 flex justify-between items-start text-white bg-gradient-to-br ${selectedNode.type === NodeType.STUDENT
                        ? "from-indigo-500 to-blue-600"
                        : selectedNode.type === NodeType.KNOWLEDGE
                          ? "from-emerald-500 to-teal-600"
                          : "from-violet-500 to-purple-600"
                      }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 opacity-90 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-1.5 py-0.5 rounded">
                          {selectedNode.type === NodeType.STUDENT
                            ? "STUDENT"
                            : selectedNode.type === NodeType.KNOWLEDGE
                              ? "KNOWLEDGE"
                              : "TEACHER"}
                        </span>
                      </div>
                      <h4 className="font-bold text-lg flex items-center gap-2 drop-shadow-sm">
                        {selectedNode.type === NodeType.STUDENT && (
                          <User className="w-5 h-5" />
                        )}
                        {selectedNode.type === NodeType.KNOWLEDGE && (
                          <Book className="w-5 h-5" />
                        )}
                        {selectedNode.type === NodeType.TEACHER && (
                          <GraduationCap className="w-5 h-5" />
                        )}
                        {selectedNode.name}
                      </h4>
                      <p className="text-white/80 text-xs mt-1 font-medium">
                        {selectedNode.type === NodeType.STUDENT &&
                          (() => {
                            const profile = selectedNode.studentProfile;
                            if (!profile) return "学生";
                            const isIdLike = (val?: string) =>
                              !val || val.length > 15 || /[a-z0-9]{10,}/i.test(val);
                            const parts: string[] = [];
                            if (!isIdLike(profile.school)) parts.push(profile.school);
                            if (!isIdLike(profile.grade)) parts.push(profile.grade);
                            if (!isIdLike(profile.classId)) parts.push(profile.classId);
                            return parts.join(" · ") || "学生";
                          })()}
                        {selectedNode.type === NodeType.KNOWLEDGE &&
                          selectedNode.knowledgeProfile?.category}
                        {selectedNode.type === NodeType.TEACHER && "授课教师"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isChatbotIncrementEligible && (
                        <button
                          onClick={() => {
                            if (isIncrementApplied) return;
                            handleChatbotIncrement();
                          }}
                          title={isIncrementApplied ? "已更新" : "增量更新"}
                          className="flex items-center justify-center w-7 h-7 bg-transparent text-white rounded-lg transition-colors backdrop-blur-sm"
                        >
                          {chatbotIncrementLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={closeNodeDetail}
                        className="text-white/60 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-1 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="p-5 max-h-[calc(100vh-280px)] overflow-y-auto custom-scrollbar">
                    {/* Student Profile Content */}
                    {selectedNode.type === NodeType.STUDENT &&
                      selectedNode.studentProfile && (
                        <>
                          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <Activity className="w-4 h-4 text-indigo-500" />
                              <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                个人维度分析
                              </h5>
                            </div>
                            {scenarioCode === "SHOW_CASE" && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={handleOpenRecommend}
                                  className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-1 rounded-md transition-colors text-[10px] font-medium whitespace-nowrap"
                                >
                                  <BookOpen className="w-3 h-3 shrink-0" />
                                  <span>推荐资源</span>
                                </button>
                                <button
                                  onClick={handleOpenExpertIntervention}
                                  className="flex items-center gap-1 bg-indigo-500 hover:bg-indigo-600 text-white px-2 py-1 rounded-md transition-colors text-[10px] font-medium whitespace-nowrap"
                                >
                                  <Stethoscope className="w-3 h-3 shrink-0" />
                                  <span>专家干预</span>
                                </button>
                              </div>
                            )}
                          </div>
                          {hasCognitiveProfileValues(selectedNode.studentProfile) ? (
                            <div className="grid grid-cols-2 gap-3">
                              {Object.entries(COGNITIVE_DIMENSION_LABELS).map(
                                ([key, label]) => {
                                  const attributeKey =
                                    key as keyof CognitiveAttributes;

                                  const displayValueRaw =
                                    selectedNode.studentProfile![attributeKey] ??
                                    FALLBACK_BASELINE_SCORES[key];

                                  if (
                                    typeof displayValueRaw !== "number" ||
                                    displayValueRaw <= 0
                                  ) {
                                    return null;
                                  }
                                  const value = displayValueRaw;
                                  const canShowStrategy =
                                    typeof dimensionCodeToStrategyKey[key] !==
                                    "undefined";
                                  return (
                                    <div
                                      key={key}
                                      className={`space-y-1 group relative p-2 bg-slate-50 rounded-lg border border-slate-100 transition-colors duration-300 ${canShowStrategy
                                          ? "cursor-help"
                                          : "cursor-default"
                                        }`}
                                      onMouseEnter={(e) => {
                                        if (dimensionCodeToStrategyKey[key]) {
                                          handleAttributeEnter(
                                            e,
                                            label,
                                            value,
                                            dimensionCodeToStrategyKey[key],
                                          );
                                        }
                                      }}
                                      onMouseLeave={() => {
                                        if (canShowStrategy) {
                                          handleAttributeLeave();
                                        }
                                      }}
                                    >
                                      <div className="flex justify-between text-[11px] text-slate-600">
                                        <span className="font-medium">{label}</span>
                                        <span className="font-bold text-slate-800">
                                          {value.toFixed(1)}/5
                                        </span>
                                      </div>
                                      <div className="h-1 w-full bg-slate-200 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-all duration-500 ease-out ${value >= 4
                                              ? "bg-emerald-500"
                                              : value >= 3
                                                ? "bg-indigo-500"
                                                : "bg-amber-500"
                                            } group-hover:brightness-95`}
                                          style={{
                                            width: `${(value / 5) * 100}%`,
                                          }}
                                        ></div>
                                      </div>
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">
                              暂无认知画像数据
                            </div>
                          )}

                          {scenarioCode === "SHOW_CASE" &&
                            selectedNode.studentProfile.template?.dimensions
                              ?.length > 0 && (
                              <>
                                <div className="flex items-center gap-2 mt-5 mb-3 pb-2 border-b border-slate-100">
                                  <Activity className="w-4 h-4 text-indigo-500" />
                                  <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    个人学情画像
                                  </h5>
                                </div>
                                {templateLoadingStudentId === selectedNode.id && (
                                  <div className="mb-4 flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    正在加载认知模板...
                                  </div>
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                  {selectedNode.studentProfile.template.dimensions.map(
                                    (item) => {
                                      const rawValue =
                                        typeof item.score === "number"
                                          ? item.score
                                          : 0;
                                      const value = rawValue;
                                      const canShowStrategy =
                                        typeof dimensionCodeToStrategyKey[
                                        item.code
                                        ] !== "undefined";
                                      return (
                                        <div
                                          key={item.code}
                                          className={`space-y-1 group relative p-2 bg-slate-50 rounded-lg border border-slate-100 transition-colors duration-300 ${canShowStrategy
                                              ? "cursor-help"
                                              : "cursor-default"
                                            }`}
                                          onMouseEnter={(e) => {
                                            if (
                                              dimensionCodeToStrategyKey[item.code]
                                            ) {
                                              handleAttributeEnter(
                                                e,
                                                item.name,
                                                value,
                                                dimensionCodeToStrategyKey[
                                                item.code
                                                ],
                                              );
                                            }
                                          }}
                                          onMouseLeave={() => {
                                            if (canShowStrategy) {
                                              handleAttributeLeave();
                                            }
                                          }}
                                        >
                                          <div className="flex justify-between text-[11px] text-slate-600">
                                            <span className="font-medium">
                                              {item.name}
                                            </span>
                                            <span className="font-bold text-slate-800">
                                              {value.toFixed(1)}/10
                                            </span>
                                          </div>
                                          <div className="text-[9px] text-slate-400 truncate">
                                            {item.category}
                                          </div>
                                          <div className="h-1 w-full bg-slate-200 rounded-full overflow-hidden">
                                            <div
                                              className={`h-full rounded-full transition-all duration-500 ease-out ${value >= 8
                                                  ? "bg-emerald-500"
                                                  : value >= 6
                                                    ? "bg-indigo-500"
                                                    : "bg-amber-500"
                                                } group-hover:brightness-95`}
                                              style={{
                                                width: `${Math.min((value / 10) * 100, 100)}%`,
                                              }}
                                            ></div>
                                          </div>
                                        </div>
                                      );
                                    },
                                  )}
                                </div>
                              </>
                            )}
                          <div className="mt-5 p-3 bg-indigo-50 rounded-lg border border-indigo-100 flex gap-2 items-start">
                            <Lightbulb className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-indigo-700 leading-relaxed">
                              提示：悬停在支持策略解释的维度上，可查看对应的专家干预建议。
                            </p>
                          </div>
                        </>
                      )}

                    {/* Knowledge Profile Content */}
                    {selectedNode.type === NodeType.KNOWLEDGE &&
                      selectedNode.knowledgeProfile && (
                        <div className="space-y-5">
                          <div>
                            <h5 className="text-xs font-bold text-slate-400 uppercase mb-2 tracking-wider">
                              知识点内容
                            </h5>
                            <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 shadow-sm">
                              {selectedNode.knowledgeProfile.content}
                            </p>
                          </div>

                          <div>
                            <h5 className="text-xs font-bold text-slate-400 uppercase mb-2 tracking-wider">
                              关联推荐资源
                            </h5>
                            <div className="space-y-2">
                              {resources
                                .filter((r) =>
                                  r.relatedKnowledgeIds.includes(
                                    selectedNode.id,
                                  ),
                                )
                                .map((res) => (
                                  <div
                                    key={res.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const url = isRealUrl(res.url) ? res.url : buildSearchUrl(res.title, res.type);
                                      window.open(url, '_blank', 'noopener,noreferrer');
                                    }}
                                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 cursor-pointer transition-all group shadow-sm hover:shadow-md bg-white"
                                  >
                                    <div className="p-1.5 rounded-md bg-slate-100 text-slate-400 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                                      <LinkIcon className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="text-xs font-medium text-slate-700 group-hover:text-emerald-800 truncate flex-1">
                                      {res.title}
                                    </span>
                                    <ExternalLink className="w-3 h-3 text-slate-300" />
                                  </div>
                                ))}
                              {resources.filter((r) =>
                                r.relatedKnowledgeIds.includes(selectedNode.id),
                              ).length === 0 && (
                                  <p className="text-xs text-slate-400 italic text-center py-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                    暂无相关资源
                                  </p>
                                )}
                            </div>
                          </div>
                        </div>
                      )}

                    {/* Teacher Profile Content */}
                    {selectedNode.type === NodeType.TEACHER &&
                      selectedNode.teacherProfile && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                              <span className="text-slate-400 block mb-1 scale-90 origin-top-left">
                                学科
                              </span>
                              <span className="font-semibold text-slate-700">
                                {selectedNode.teacherProfile.subject || "-"}
                              </span>
                            </div>
                            <div className="col-span-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                              <span className="text-slate-400 block mb-1 scale-90 origin-top-left">
                                学校/班级
                              </span>
                              <span className="font-semibold text-slate-700">
                                {selectedNode.teacherProfile.school}{" "}
                                {selectedNode.teacherProfile.teachingGrade}{" "}
                                {selectedNode.teacherProfile.teachingClass}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Tooltip Portal */}
        {hoveredAttribute && tooltipPosition && (
          <div
            className="absolute z-50 w-80 bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] border border-slate-100 ring-1 ring-slate-900/5 animate-in fade-in zoom-in-95 duration-200 pointer-events-none"
            style={{
              left: `${tooltipPosition.x}px`,
              top: `${tooltipPosition.y}px`,
              transform: "translateY(-20%)",
            }}
          >
            <div className="flex items-start gap-3 mb-3 pb-3 border-b border-slate-100">
              <div className="p-1.5 bg-amber-50 rounded-lg text-amber-500">
                <Lightbulb className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">
                  {hoveredAttribute.label}
                </h4>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${hoveredAttribute.score >= 4
                        ? "bg-emerald-500"
                        : hoveredAttribute.score >= 3
                          ? "bg-indigo-500"
                          : "bg-amber-500"
                      }`}
                  >
                    {hoveredAttribute.score >= 4
                      ? "高水平"
                      : hoveredAttribute.score >= 3
                        ? "中等水平"
                        : "低水平"}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    专家干预策略
                  </span>
                </div>
              </div>
            </div>
            {hoveredAttribute.key ? (
              <ol className="space-y-1.5">
                {getStrategy(hoveredAttribute.key, hoveredAttribute.score).map(
                  (strategy, index) => (
                    <li
                      key={index}
                      className="flex gap-1.5 text-xs text-slate-600 leading-relaxed"
                    >
                      <span className="flex-shrink-0 text-slate-400 font-bold">
                        {index + 1}.
                      </span>
                      <span>{strategy}</span>
                    </li>
                  ),
                )}
              </ol>
            ) : (
              <p className="text-xs text-slate-600 leading-relaxed">
                该维度暂无对应的干预策略模板。
              </p>
            )}
          </div>
        )}

        {/* Right Resource Panel */}
        <aside className="w-80 bg-white border-l border-slate-200 flex flex-col shadow-[-4px_0_24px_-12px_rgba(0,0,0,0.05)] z-20">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-slate-400" />
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                资源中心
              </h2>
            </div>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-50/50">
            {resources.map((res) => (
              <div
                key={res.id}
                onClick={() => handleResourceClick(res)}
                className={`group cursor-pointer rounded-xl border p-4 transition-all duration-300 relative overflow-hidden ${selectedResource === res.id
                    ? "border-indigo-500 bg-white shadow-lg shadow-indigo-100 scale-[1.02] ring-1 ring-indigo-500/20"
                    : "border-slate-200 hover:border-indigo-300 hover:shadow-md bg-white hover:-translate-y-0.5"
                  }`}
              >
                {selectedResource === res.id && (
                  <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                )}
                <div className="flex justify-between items-start mb-2.5">
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                    {res.type}
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                    <BarChart3 className="w-3 h-3" />
                    {res.accuracy != null ? (
                      <span
                        className={
                          res.accuracy > 90
                            ? "text-emerald-600"
                            : "text-amber-600"
                        }
                      >
                        接受度 {res.accuracy}%
                      </span>
                    ) : (
                      <span className="text-slate-400">暂无数据</span>
                    )}
                  </div>
                </div>
                <h3 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 mb-1.5 leading-tight transition-colors">
                  {res.title}
                </h3>
                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-2">
                  {res.description}
                </p>
                {selectedResource === res.id && (
                  <div className="mt-3 pt-3 border-t border-indigo-50 animate-in fade-in duration-300">
                    <div className="flex items-center gap-1 text-[10px] text-indigo-600 font-medium bg-indigo-50/50 p-1.5 rounded">
                      <Layers className="w-3 h-3" />
                      关联知识点: {res.relatedKnowledgeIds.join(", ")}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Analysis Modal */}
      <AnalysisPanel
        isOpen={isAnalysisOpen}
        onClose={() => setIsAnalysisOpen(false)}
        data={graphData}
        resources={resources}
        scenarioCode={scenarioCode}
        classInfo={classInfo}
        defaultTab={analysisDefaultTab}
      />

      {/* Expert Intervention Modal */}
      {isExpertInterventionOpen && selectedNode?.type === NodeType.STUDENT && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-[800px] max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-blue-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500 rounded-lg">
                  <Stethoscope className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">专家干预方案</h2>
                  <p className="text-xs text-slate-500">
                    {selectedNode.name} · 基于认知维度分析与学情画像的个性化建议
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseExpertIntervention}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full p-2 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {expertInterventionLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
                  <p className="text-sm text-slate-500">正在生成专家干预方案...</p>
                </div>
              ) : expertInterventionData ? (
                <>
                  <div>

                    {interventionAnalysis && (
                      <div className="space-y-3">
                        <h5 className="text-sm font-bold text-slate-800">
                          各维度干预策略
                        </h5>
                        {COGNITIVE_DIMENSION_KEYS.map((key) => {
                          const score =
                            interventionAnalysis.aggregateScores[key] ?? 0;
                          const strategies = getStrategy(key, score);
                          const isReverse = key === "cognitiveLoad";
                          const isLow = isReverse ? score >= 4 : score <= 2;
                          const isHigh = isReverse ? score <= 2 : score >= 4;
                          const levelLabel = isLow ? "低" : isHigh ? "高" : "中";
                          return (
                            <div
                              key={key}
                              className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <h5 className="text-sm font-bold text-slate-800">
                                  {COGNITIVE_DIMENSION_LABELS[key] ?? key}
                                </h5>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-xs font-bold px-2 py-1 rounded-full ${isLow
                                        ? "bg-red-50 text-red-600"
                                        : isHigh
                                          ? "bg-emerald-50 text-emerald-600"
                                          : "bg-amber-50 text-amber-600"
                                      }`}
                                  >
                                    {levelLabel}水平 · {score.toFixed(1)}/5
                                  </span>
                                </div>
                              </div>
                              <ol className="space-y-2">
                                {strategies.map((strategy, index) => (
                                  <li
                                    key={index}
                                    className="flex gap-2 text-sm text-slate-700 leading-relaxed"
                                  >
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center mt-0.5">
                                      {index + 1}
                                    </span>
                                    <span>{strategy}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          );
                        })}

                        {interventionAnalysis && (
                          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                              <h5 className="text-sm font-bold text-slate-800">
                                学习风格干预策略
                              </h5>
                              <span className="text-xs font-medium text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
                                {interventionAnalysis.learningStyle.styleName}
                              </span>
                            </div>
                            <ol className="space-y-2">
                              {interventionAnalysis.learningStyle.strategies.map(
                                (strategy, index) => (
                                  <li
                                    key={index}
                                    className="flex gap-2 text-sm text-slate-700 leading-relaxed"
                                  >
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold flex items-center justify-center mt-0.5">
                                      {index + 1}
                                    </span>
                                    <span>{strategy}</span>
                                  </li>
                                ),
                              )}
                            </ol>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
                  <p className="text-sm text-slate-500">加载专家干预数据失败，请重试</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recommended Resources Modal */}
      {isRecommendOpen && selectedNode?.type === NodeType.STUDENT && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-[800px] max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500 rounded-lg">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">推荐资源</h2>
                  <p className="text-xs text-slate-500">
                    {selectedNode.name} · 基于知识储备与学习投入的个性化资源推荐
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseRecommend}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full p-2 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {recommendedResources.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      共推荐 {recommendedResources.length} 个资源
                    </span>
                    <button
                      onClick={handleOpenRecommend}
                      className="hidden items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>换一批</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {recommendedResources.map((resource) => (
                      <div
                        key={resource.id}
                        className="bg-white rounded-xl border border-slate-200 p-4 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group"
                        onClick={() => {
                          const url = isRealUrl(resource.url)
                            ? resource.url
                            : buildSearchUrl(resource.title, resource.type);
                          window.open(url, "_blank", "noopener,noreferrer");
                        }}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                            {resource.type}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${resource.difficultyLabel === "基础"
                                ? "text-emerald-600 bg-emerald-50"
                                : resource.difficultyLabel === "进阶"
                                  ? "text-amber-600 bg-amber-50"
                                  : "text-red-600 bg-red-50"
                              }`}
                          >
                            {resource.difficultyLabel}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 group-hover:text-emerald-600 mb-1 transition-colors line-clamp-1">
                          {resource.title}
                        </h4>
                        <p className="text-[10px] text-emerald-600 font-medium bg-emerald-50 px-2 py-1 rounded mb-2">
                          {resource.recommendReason}
                        </p>
                        {resource.description && (
                          <p className="text-xs text-slate-500 line-clamp-2 mb-2">
                            {resource.description}
                          </p>
                        )}
                        {resource.accuracy != null && (
                          <span className="text-[10px] text-slate-400">
                            资源接受度 {Math.round(resource.accuracy)}%
                          </span>
                        )}
                        <div className="mt-2 pt-2 border-t border-slate-100">
                          <StarRating
                            label="教师反馈："
                            value={resourceRatings[resource.id] ?? 0}
                            onChange={(score) => {
                              setResourceRatings((prev) => ({
                                ...prev,
                                [resource.id]: score,
                              }));
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="bg-slate-50 rounded-xl p-6 text-center border border-dashed border-slate-200">
                  <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">
                    当前场景暂无可推荐的关联资源
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
