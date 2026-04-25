import { GraphData, GraphNode, GraphLink, NodeType, InteractionType } from '../types';

const KNOWLEDGE_NODES_TO_KEEP = [
  'html语言',
  'html标签',
  '超链接',
  '基本标签',
  '文档整体属性',
  '文本标签',
  '格式排版',
  '多媒体',
  '表格',
  'html网页添加CSS',
];

type GraphDataAssertion = (data: any) => asserts data is GraphData;
type GraphNodeAssertion = (node: any, index: number) => asserts node is GraphNode;
type GraphLinkAssertion = (link: any, index: number) => asserts link is GraphLink;
type ClassInfoAssertion = (classInfo: any) => asserts classInfo is { school: string; grade: string; classId: string };
type ScenarioAssertion = (scenario: any) => asserts scenario is string;

export const validateGraphData: GraphDataAssertion = (data) => {
  if (!data) {
    throw new Error('数据为空');
  }

  if (!data.nodes || !Array.isArray(data.nodes)) {
    throw new Error('nodes必须是数组');
  }

  if (!data.links || !Array.isArray(data.links)) {
    throw new Error('links必须是数组');
  }

  // 验证每个节点
  data.nodes.forEach((node, index) => {
    validateGraphNode(node, index);
  });

  // 如果nodes为空，links也应该为空
  if (data.nodes.length === 0) {
    if (data.links.length > 0) {
      console.warn('nodes为空时，links也应该为空，已自动过滤无效链接');
      data.links = [];
    }
    return;
  }

  // 创建节点ID集合用于快速查找
  const nodeIds = new Set(data.nodes.map((node: any) => node.id));

  // 验证每个链接
  data.links.forEach((link, index) => {
    validateGraphLink(link, index);
    
    // 额外验证：确保链接的source和target都在节点集合中
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    
    if (!nodeIds.has(sourceId)) {
      throw new Error(`链接 ${index} 缺少有效的source`);
    }
    
    if (!nodeIds.has(targetId)) {
      throw new Error(`链接 ${index} 缺少有效的target`);
    }
  });
};

export const validateGraphNode: GraphNodeAssertion = (node, index) => {
  if (!node) {
    throw new Error(`节点 ${index} 为空`);
  }

  if (!node.id || typeof node.id !== 'string') {
    throw new Error(`节点 ${index} 缺少有效的id`);
  }

  if (!node.type || !Object.values(NodeType).includes(node.type)) {
    throw new Error(`节点 ${index} 缺少有效的type`);
  }

  if (!node.name || typeof node.name !== 'string') {
    throw new Error(`节点 ${index} 缺少有效的name`);
  }

  if (node.val === undefined || typeof node.val !== 'number' || node.val <= 0) {
    throw new Error(`节点 ${index} 缺少有效的val`);
  }

  if (node.group === undefined || typeof node.group !== 'number') {
    throw new Error(`节点 ${index} 缺少有效的group`);
  }
};

export const validateGraphLink: GraphLinkAssertion = (link, index) => {
  if (!link) {
    throw new Error(`链接 ${index} 为空`);
  }

  if (!link.source) {
    throw new Error(`链接 ${index} 缺少有效的source`);
  }

  if (!link.target) {
    throw new Error(`链接 ${index} 缺少有效的target`);
  }

  if (link.value === undefined || typeof link.value !== 'number' || link.value < 0) {
    throw new Error(`链接 ${index} 缺少有效的value`);
  }

  if (!link.type || !Object.values(InteractionType).includes(link.type)) {
    throw new Error(`链接 ${index} 缺少有效的type`);
  }
};

export const transformGraphData = (data: any): GraphData => {
  try {
    validateGraphData(data);

    return {
      nodes: data.nodes.map((node: any) => ({
        id: node.id,
        type: node.type,
        name: node.name,
        group: node.group || 0,
        val: node.val || 10,
        studentProfile: node.studentProfile,
        teacherProfile: node.teacherProfile,
        knowledgeProfile: node.knowledgeProfile
      })),
      links: data.links.map((link: any) => ({
        source: link.source,
        target: link.target,
        value: link.value,
        type: link.type
      })),
      meta: data.meta
    };
  } catch (error) {
    console.error('转换数据失败:', error);
    throw error;
  }
};

export const validateClassInfo: ClassInfoAssertion = (classInfo) => {
  if (!classInfo) {
    throw new Error('班级信息为空');
  }

  if (!classInfo.school || typeof classInfo.school !== 'string' || classInfo.school.trim() === '') {
    throw new Error('学校名称不能为空');
  }

  if (!classInfo.grade || typeof classInfo.grade !== 'string' || classInfo.grade.trim() === '') {
    throw new Error('年级不能为空');
  }

  if (!classInfo.classId || typeof classInfo.classId !== 'string' || classInfo.classId.trim() === '') {
    throw new Error('班级不能为空');
  }
};

export const validateScenario: ScenarioAssertion = (scenario) => {
  if (!scenario || typeof scenario !== 'string') {
    throw new Error('场景类型必须是字符串');
  }
};

export const sanitizeGraphData = (data: GraphData): GraphData => {
  const filteredNodes = data.nodes.filter(node => {
    if (node.type !== NodeType.KNOWLEDGE) return true;
    return KNOWLEDGE_NODES_TO_KEEP.includes(node.name.trim());
  });

  const validNodeIds = new Set(filteredNodes.map(node => node.id.trim()));

  const filteredLinks = data.links.filter(link => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    return validNodeIds.has(sourceId.trim()) && validNodeIds.has(targetId.trim());
  });

  return {
    nodes: filteredNodes.map(node => ({
      ...node,
      id: node.id.trim(),
      name: node.name.trim(),
      type: node.type
    })),
    links: filteredLinks.map(link => ({
      ...link,
      source: typeof link.source === 'object' ? link.source : link.source.trim(),
      target: typeof link.target === 'object' ? link.target : link.target.trim(),
      type: link.type
    })),
    meta: data.meta
  };
};
