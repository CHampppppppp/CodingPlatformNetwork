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
  Sparkles,
} from "lucide-react";
import NetworkGraph from "./components/NetworkGraph";
import AnalysisPanel from "./components/AnalysisPanel";
import {
  fetchGraphData,
  fetchResources,
  getSchools,
  getGradesBySchool,
  getClassesBySchoolAndGrade,
  fetchResourceStudentRates,
} from "./services/dataService";
import { fetchStudentCognitiveTemplate as fetchStudentCognitiveTemplateRaw, fetchStudentExpertIntervention } from "./services/apiService";
import { getStrategy } from "./services/strategies";
import {
  Scenario,
  GraphData,
  Resource,
  ClassInfo,
  NodeType,
  GraphNode,
  CognitiveAttributes,
  InteractionType,
  GraphLink,
} from "./types";


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

const App: React.FC = () => {
  // State
  const [scenario, setScenario] = useState<Scenario>(Object.values(Scenario)[0]);
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

  // Constants
  const scenarios = Object.values(Scenario);

  // Cognitive attribute labels
  const cognitiveLabels: Record<keyof CognitiveAttributes, string> = {
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

  const likertScaleMap: Record<string, number> = {
    '非常同意': 5,
    '同意': 4,
    '一般': 3,
    '不同意': 2,
    '非常不同意': 1,
  };

  const formatProfileValue = (val?: string | null): string => {
    if (!val) return "未知";
    const score = likertScaleMap[val];
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
    setScenario(Object.values(Scenario)[0]);
  }, [classOptions.schools]);

  useEffect(() => {
    const loadSchools = async () => {
      setOptionsLoading((prev) => ({ ...prev, schools: true }));
      try {
        const schools = await getSchools(scenario);
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
  }, [scenario]);

  // Load grades when school changes
  useEffect(() => {
    if (!classInfo.school) return;

    const loadGrades = async () => {
      setOptionsLoading((prev) => ({ ...prev, grades: true }));
      try {
        const grades = await getGradesBySchool(classInfo.school, scenario);
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
  }, [classInfo.school, scenario]);

  // Load classes when school or grade changes
  useEffect(() => {
    console.log("班级加载 useEffect 触发:", { 
      school: classInfo.school, 
      grade: classInfo.grade 
    });
    if (!classInfo.school || !classInfo.grade) {
      console.log("缺少学校或年级，跳过加载班级");
      return;
    }

    const loadClasses = async () => {
      setOptionsLoading((prev) => ({ ...prev, classes: true }));
      try {
        const classes = await getClassesBySchoolAndGrade(
          classInfo.school,
          classInfo.grade,
          scenario,
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
  }, [classInfo.school, classInfo.grade, scenario]);

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
      const data = await fetchGraphData(scenario, classInfo);

      const teacherStudentThreshold = 75;
      const existingLinkKeys = new Set(
        data.links.map((l) => {
          const s = typeof l.source === "object" ? l.source.id : l.source;
          const t = typeof l.target === "object" ? l.target.id : l.target;
          return `${s}#${t}`;
        }),
      );
      const studentNodes = data.nodes.filter((n) => n.type === NodeType.STUDENT);
      const teacherNodes = data.nodes.filter((n) => n.type === NodeType.TEACHER);
      for (const teacher of teacherNodes) {
        for (const student of studentNodes) {
          const sameSchool =
            teacher.teacherProfile?.school &&
            student.studentProfile?.school &&
            teacher.teacherProfile.school === student.studentProfile.school;
          if (!sameSchool) continue;
          const key1 = `${teacher.id}#${student.id}`;
          const key2 = `${student.id}#${teacher.id}`;
          if (existingLinkKeys.has(key1) || existingLinkKeys.has(key2)) {
            continue;
          }
          if (Math.random() * 100 <= teacherStudentThreshold) {
            const syntheticLink: GraphLink = {
              source: teacher.id,
              target: student.id,
              value: 1,
              type: InteractionType.PHYSICAL,
            };
            data.links.push(syntheticLink);
            existingLinkKeys.add(key1);
          }
        }
      }

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
  }, [scenario, classInfo]);

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
  }, [classInfo.school, classInfo.grade, classInfo.classId, scenario]);

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
        const sourceId =
          typeof link.source === "object"
            ? (link.source as any).id
            : link.source;
        const targetId =
          typeof link.target === "object"
            ? (link.target as any).id
            : link.target;

        if (kIds.includes(sourceId)) {
          if (studentIdSet.has(targetId)) connectedStudentIds.push(targetId);
        } else if (kIds.includes(targetId)) {
          if (studentIdSet.has(sourceId)) connectedStudentIds.push(sourceId);
        }
      });

      try {
        const rawRates = await fetchResourceStudentRates(resource.id);
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
    setSelectedResource(null);
    setStudentRates({});

    if (node.type === NodeType.KNOWLEDGE) {
      const connectedStudentIds: string[] = [];
      const studentIdSet = new Set(
        graphData.nodes.filter((n) => n.type === NodeType.STUDENT).map((n) => n.id),
      );

      graphData.links.forEach((link) => {
        const sourceId =
          typeof link.source === "object"
            ? (link.source as any).id
            : link.source;
        const targetId =
          typeof link.target === "object"
            ? (link.target as any).id
            : link.target;

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
        const sourceId =
          typeof link.source === "object"
            ? (link.source as any).id
            : link.source;
        const targetId =
          typeof link.target === "object"
            ? (link.target as any).id
            : link.target;

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

      const newProfileData = {
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
        template: {
          profileMeta: templateProfile.profile
            ? {
                version: templateProfile.profile.version,
                generatedAt: templateProfile.profile.generatedAt,
                totalScore: templateProfile.profile.totalScore,
              }
            : undefined,
          dimensions: templateProfile.dimensions.map((d) => ({
            code: d.dimensionCode,
            name: d.dimensionNameZh,
            category: d.category,
            score: d.scoreValue,
            level: d.scoreLevel,
          })),
        },
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

        return {
          ...prev,
          studentProfile: {
            ...baseProfile,
            ...newProfileData,
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
                {scenarios.map((s) => (
                  <button
                    key={s}
                    onClick={() => setScenario(s)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all duration-200 flex items-center justify-between group ${
                      scenario === s
                        ? "bg-indigo-50 text-indigo-700 font-medium ring-1 ring-indigo-200"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                    }`}
                  >
                    <span>{s}</span>
                    {scenario === s && (
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
                  场景: <span className="text-indigo-600">{scenario}</span>
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

              {/* Floating Node Detail Card */}
              {selectedNode && (
                <div className="absolute top-5 right-5 w-80 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 ring-1 ring-slate-900/10 overflow-hidden animate-in fade-in slide-in-from-right-8 duration-300 z-20">
                  {/* Header based on Node Type */}
                  <div
                    className={`p-5 flex justify-between items-start text-white bg-gradient-to-br ${
                      selectedNode.type === NodeType.STUDENT
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
                      {selectedNode.type === NodeType.STUDENT && (
                        <button
                          onClick={handleOpenExpertIntervention}
                          className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg transition-colors text-xs font-medium backdrop-blur-sm"
                        >
                          <Stethoscope className="w-3.5 h-3.5" />
                          <span>专家干预</span>
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
                          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                            <Activity className="w-4 h-4 text-indigo-500" />
                            <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                              个人维度分析
                            </h5>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {Object.entries(cognitiveLabels).map(
                              ([key, label]) => {
                                const attributeKey =
                                  key as keyof CognitiveAttributes;
                                const valueRaw =
                                  selectedNode.studentProfile![attributeKey];
                                const value =
                                  typeof valueRaw === "number" ? valueRaw : 0;
                                const canShowStrategy =
                                  typeof dimensionCodeToStrategyKey[key] !==
                                  "undefined";
                                return (
                                  <div
                                    key={key}
                                    className={`space-y-1 group relative p-2 bg-slate-50 rounded-lg border border-slate-100 ${
                                      canShowStrategy
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
                                        className={`h-full rounded-full transition-all duration-500 ease-out ${
                                          value >= 4
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

                          {selectedNode.studentProfile.template?.dimensions
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
                                        className={`space-y-1 group relative p-2 bg-slate-50 rounded-lg border border-slate-100 ${
                                          canShowStrategy
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
                                            className={`h-full rounded-full transition-all duration-500 ease-out ${
                                              value >= 8
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
                                      if (res.url) {
                                        window.open(res.url, '_blank', 'noopener,noreferrer');
                                      } else {
                                        handleResourceClick(res);
                                      }
                                    }}
                                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 cursor-pointer transition-all group shadow-sm hover:shadow-md bg-white"
                                  >
                                    <div className="p-1.5 rounded-md bg-slate-100 text-slate-400 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                                      <LinkIcon className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="text-xs font-medium text-slate-700 group-hover:text-emerald-800 truncate flex-1">
                                      {res.title}
                                    </span>
                                    {res.url && (
                                      <ExternalLink className="w-3 h-3 text-slate-300" />
                                    )}
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
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${
                      hoveredAttribute.score >= 4
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
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
              {hoveredAttribute.key
                ? getStrategy(
                    scenario,
                    hoveredAttribute.key,
                    hoveredAttribute.score,
                  )
                : "该维度暂无对应的干预策略模板。"}
            </p>
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
                className={`group cursor-pointer rounded-xl border p-4 transition-all duration-300 relative overflow-hidden ${
                  selectedResource === res.id
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
        scenario={scenario}
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
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      <h3 className="text-base font-bold text-slate-800">专家诊断与建议</h3>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-4">
                      <h4 className="text-sm font-semibold text-slate-700 mb-2">学情综合诊断</h4>
                      {expertInterventionData.weakDimensions.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-sm text-slate-600 leading-relaxed">
                            该学生在
                            <span className="font-semibold text-amber-600">
                              {expertInterventionData.weakDimensions.map(d => d.dimensionNameZh).join("、")}
                            </span>
                            等维度表现较弱，需要重点关注和干预。建议根据以下针对性策略进行辅导：
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {expertInterventionData.weakDimensions.map((dim) => (
                              <span
                                key={dim.dimensionCode}
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200"
                              >
                                {dim.dimensionNameZh} · {dim.scoreValue.toFixed(1)}分
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-600 leading-relaxed">
                          该学生各维度表现良好，无明显薄弱环节。建议继续保持，可适当挑战更高难度的学习任务。
                        </p>
                      )}
                    </div>

                    {expertInterventionData.weakDimensions.length > 0 && (
                      <div className="space-y-3">
                        {expertInterventionData.weakDimensions.map((dim) => {
                          const suggestion = dim.strategyKey
                            ? getStrategy(scenario, dim.strategyKey as keyof CognitiveAttributes, dim.scoreValue)
                            : "该维度暂无具体干预策略数据。";
                          return (
                            <div
                              key={dim.dimensionCode}
                              className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="text-sm font-bold text-slate-800">
                                  {dim.dimensionNameZh}
                                </h5>
                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                                  dim.scoreValue <= 2
                                    ? "bg-red-50 text-red-600"
                                    : dim.scoreValue <= 3
                                    ? "bg-amber-50 text-amber-600"
                                    : "bg-emerald-50 text-emerald-600"
                                }`}>
                                  {dim.scoreValue.toFixed(1)}/5
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mb-2">{dim.category}</p>
                              <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 rounded-lg p-3">
                                {suggestion}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {expertInterventionData.resources.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <BookOpen className="w-5 h-5 text-emerald-500" />
                        <h3 className="text-base font-bold text-slate-800">专家推荐资源</h3>
                        <span className="text-xs text-slate-400">
                          共 {expertInterventionData.resources.length} 个
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {expertInterventionData.resources.map((resource) => (
                          <div
                            key={resource.id}
                            className="bg-white rounded-xl border border-slate-200 p-4 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
                            onClick={() => {
                              if (resource.url) {
                                window.open(resource.url, '_blank', 'noopener,noreferrer');
                              }
                            }}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                {resource.resourceType}
                              </span>
                              {resource.acceptanceRate != null && (
                                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                  接受度 {Math.round(resource.acceptanceRate)}%
                                </span>
                              )}
                            </div>
                            <h4 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 mb-1 transition-colors line-clamp-1">
                              {resource.title}
                            </h4>
                            {resource.recommendReason && (
                              <p className="text-[10px] text-indigo-600 font-medium bg-indigo-50 px-2 py-1 rounded mb-2">
                                {resource.recommendReason}
                              </p>
                            )}
                            {resource.description && (
                              <p className="text-xs text-slate-500 line-clamp-2 mb-2">
                                {resource.description}
                              </p>
                            )}
                            {resource.knowledgeNodes.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {resource.knowledgeNodes.slice(0, 2).map((node) => (
                                  <span
                                    key={node.id}
                                    className="text-[10px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100"
                                  >
                                    {node.name}
                                  </span>
                                ))}
                                {resource.knowledgeNodes.length > 2 && (
                                  <span className="text-[10px] text-slate-400 px-1.5 py-0.5">
                                    +{resource.knowledgeNodes.length - 2}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {expertInterventionData.resources.length === 0 && (
                    <div className="bg-slate-50 rounded-xl p-6 text-center border border-dashed border-slate-200">
                      <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">暂无针对该学生的推荐资源</p>
                    </div>
                  )}
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
    </div>
  );
};

export default App;
