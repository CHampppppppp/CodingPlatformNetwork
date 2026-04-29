import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL!;
let prisma: PrismaClient;
if (dbUrl.startsWith('sqlserver://')) {
  prisma = new PrismaClient({ adapter: new PrismaMssql(dbUrl) });
} else {
  prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbUrl) });
}

interface ResourceTemplate {
  title: string;
  type: string;
  description: string;
}

interface DimensionDef {
  dimensionCode: string;
  dimensionName: string;
  strategyKey: string;
  isGeneric: boolean;
  lowScoreResources: ResourceTemplate[];
  highScoreResources: ResourceTemplate[];
}

const DIMENSION_RESOURCE_DEFS: DimensionDef[] = [
  {
    dimensionCode: 'COG_READING',
    dimensionName: '阅读理解',
    strategyKey: 'knowledgeReserve',
    isGeneric: false,
    lowScoreResources: [
      { title: '阅读理解基础训练册', type: 'DOCUMENT', description: '从句子理解到段落分析的分层练习，配备详细的解题思路和答题模板，帮助夯实阅读基础。' },
      { title: '名著导读与精读视频', type: 'VIDEO', description: '名师带领精读经典篇章，逐句解析写作手法和深层含义，培养文本细读能力。' },
      { title: '阅读策略入门：抓主旨、找细节', type: 'ARTICLE', description: '系统讲解阅读理解的核心策略，配合实例演示如何快速定位关键信息和归纳中心思想。' },
    ],
    highScoreResources: [
      { title: '批判性阅读与文学批评', type: 'ARTICLE', description: '引导从接受式阅读转向批判性阅读，学习文学批评的基本方法和理论视角。' },
      { title: '跨学科深度阅读项目', type: 'PRACTICE', description: '选取涉及历史、哲学、科学的复杂文本，训练高难度材料的分析和综合能力。' },
      { title: '创意写作与文本改写挑战', type: 'GAME', description: '基于经典文本进行改写、续写、视角转换等创意写作练习，深化对文本结构的理解。' },
    ],
  },
  {
    dimensionCode: 'COG_LANGUAGE',
    dimensionName: '语言表达',
    strategyKey: 'knowledgeReserve',
    isGeneric: false,
    lowScoreResources: [
      { title: '语言表达基础：从句子到段落', type: 'DOCUMENT', description: '系统讲解句子结构、修辞手法、段落组织等基础知识，配合大量仿写练习。' },
      { title: '口语表达训练视频课程', type: 'VIDEO', description: '从发音、语速、逻辑组织到肢体语言的全方位口语表达训练，提升表达自信。' },
      { title: '写作模板与范例库', type: 'DOCUMENT', description: '提供各类文体的写作模板和优秀范例，帮助学生快速掌握基本写作规范和技巧。' },
    ],
    highScoreResources: [
      { title: '演讲与辩论进阶训练', type: 'VIDEO', description: '学习高级演讲技巧和辩论策略，包括即兴演讲、质询应对、结辩陈词等。' },
      { title: '学术写作规范与实践', type: 'DOCUMENT', description: '掌握学术论文、研究报告的写作规范，学习文献引用、逻辑论证、数据分析呈现。' },
      { title: '创意叙事与多媒体表达', type: 'GAME', description: '结合图文、音频、视频等多媒体形式进行创意叙事，探索表达方式的边界。' },
    ],
  },
  {
    dimensionCode: 'COG_SCIENCE_KNOWLEDGE',
    dimensionName: '科学知识',
    strategyKey: 'knowledgeReserve',
    isGeneric: false,
    lowScoreResources: [
      { title: '科学概念可视化图解手册', type: 'DOCUMENT', description: '将抽象科学概念转化为直观的图解和动画，降低理解门槛，建立基础认知。' },
      { title: '基础科学实验视频合集', type: 'VIDEO', description: '展示基础科学实验的操作过程和现象解释，通过观察学习建立科学直觉。' },
      { title: '科学知识趣味问答闯关', type: 'GAME', description: '游戏化科学知识问答，即时反馈和趣味解释，在轻松氛围中巩固基础概念。' },
    ],
    highScoreResources: [
      { title: '前沿科学研究论文导读', type: 'ARTICLE', description: '精选Nature、Science等顶刊论文，学习如何阅读和理解前沿科学研究。' },
      { title: '开放性探究实验设计', type: 'PRACTICE', description: '只提供研究问题和基础材料，学生自主设计实验方案、预测结果、分析数据。' },
      { title: '科学建模与仿真项目', type: 'GAME', description: '使用科学建模工具对复杂现象进行仿真，探索参数变化对系统行为的影响。' },
    ],
  },
  {
    dimensionCode: 'COG_SCIENCE_INQUIRY',
    dimensionName: '科学探究',
    strategyKey: 'learningEngagement',
    isGeneric: false,
    lowScoreResources: [
      { title: '探究式学习入门指南', type: 'DOCUMENT', description: '讲解科学探究的基本步骤：提出问题、猜想假设、设计方案、收集证据、得出结论。' },
      { title: '引导式探究实验视频', type: 'VIDEO', description: '教师逐步引导完成一个完整的探究实验，示范如何观察、记录、分析实验现象。' },
      { title: '虚拟实验室：安全探索', type: 'GAME', description: '在虚拟环境中自由操作实验器材，无安全顾虑地探索各种实验条件和结果。' },
    ],
    highScoreResources: [
      { title: '自主探究项目：从选题到发表', type: 'PRACTICE', description: '独立完成一个完整的科学探究项目，包括文献综述、实验设计、数据分析、论文撰写。' },
      { title: '跨学科综合探究挑战', type: 'GAME', description: '解决需要融合物理、化学、生物等多学科知识的复杂真实问题。' },
      { title: '科学探究方法论高级课程', type: 'VIDEO', description: '深入学习控制变量、对照实验、样本选择、误差分析等高级实验设计方法。' },
    ],
  },
  {
    dimensionCode: 'COG_COMPUTATIONAL',
    dimensionName: '计算思维',
    strategyKey: 'computationalThinking',
    isGeneric: false,
    lowScoreResources: [
      { title: '计算思维启蒙：不插电编程', type: 'GAME', description: '通过实体卡片、棋盘游戏等方式学习算法基本概念，无需编程基础。' },
      { title: '图形化编程入门（Scratch）', type: 'VIDEO', description: '使用拖拽式积木编程完成趣味项目，培养逻辑思维和问题分解能力。' },
      { title: '算法思维基础练习题库', type: 'PRACTICE', description: '从顺序、分支、循环三种基本结构入手，通过大量练习建立算法直觉。' },
    ],
    highScoreResources: [
      { title: '高级算法设计与分析', type: 'DOCUMENT', description: '深入学习贪心、动态规划、图算法等高级算法，分析时间复杂度和空间复杂度。' },
      { title: '编程竞赛训练题库', type: 'PRACTICE', description: 'NOI/ACM风格的算法竞赛题目，训练在压力下快速设计高效算法的能力。' },
      { title: '开源项目代码阅读与重构', type: 'GAME', description: '阅读真实开源项目的代码，理解设计模式，并进行功能扩展或性能优化。' },
    ],
  },
  {
    dimensionCode: 'COG_TECH_LITERACY',
    dimensionName: '技术素养',
    strategyKey: 'aiLiteracy',
    isGeneric: false,
    lowScoreResources: [
      { title: '信息技术基础操作手册', type: 'DOCUMENT', description: '系统讲解常用软件、网络工具、信息安全基础操作，建立基本技术素养。' },
      { title: '数字公民与网络安全课程', type: 'VIDEO', description: '学习网络礼仪、隐私保护、信息甄别、数字版权等数字公民核心素养。' },
      { title: '常用办公工具实战练习', type: 'PRACTICE', description: '通过实际任务掌握文档处理、数据分析、演示制作等常用办公技能。' },
    ],
    highScoreResources: [
      { title: '系统架构设计与技术选型', type: 'DOCUMENT', description: '学习如何根据需求选择合适的技术栈，设计可扩展的系统架构。' },
      { title: '前沿技术趋势深度解读', type: 'ARTICLE', description: '跟踪云计算、边缘计算、区块链、量子计算等前沿技术的发展动态和应用场景。' },
      { title: '技术项目全栈开发实战', type: 'PRACTICE', description: '独立完成从需求分析、数据库设计、API开发到前端实现的完整技术项目。' },
    ],
  },
  {
    dimensionCode: 'PSY_ANXIETY',
    dimensionName: '焦虑倾向',
    strategyKey: 'cognitiveLoad',
    isGeneric: true,
    lowScoreResources: [
      { title: '焦虑情绪识别与管理指南', type: 'DOCUMENT', description: '科学解释焦虑的成因和表现，教授深呼吸、渐进式肌肉放松等即时缓解技巧。' },
      { title: '正念冥想入门音频课程', type: 'VIDEO', description: '引导式正念冥想练习，帮助学生觉察当下、接纳情绪、减少对未来的过度担忧。' },
      { title: '考试焦虑专项辅导', type: 'ARTICLE', description: '针对考试场景提供系统脱敏、认知重构、积极自我对话等专项焦虑管理策略。' },
    ],
    highScoreResources: [
      { title: '情绪智力高级训练', type: 'VIDEO', description: '深入学习情绪的神经科学基础，掌握高级情绪调节策略，培养心理韧性。' },
      { title: '助人技能培训：成为同伴支持者', type: 'DOCUMENT', description: '学习基本的倾听技巧、危机识别和转介方法，在帮助他人的过程中提升自身情绪管理能力。' },
      { title: '积极心理学实践项目', type: 'GAME', description: '通过感恩日记、优势识别、意义探索等积极心理学练习，培养乐观心态和抗逆力。' },
    ],
  },
  {
    dimensionCode: 'PSY_DEPRESSION',
    dimensionName: '抑郁倾向',
    strategyKey: 'cognitiveLoad',
    isGeneric: true,
    lowScoreResources: [
      { title: '抑郁情绪自助手册', type: 'DOCUMENT', description: '基于认知行为疗法（CBT）的自助指南，教授识别负面思维模式、行为激活等技巧。' },
      { title: '心理健康专业援助指南', type: 'ARTICLE', description: '介绍学校心理咨询资源、专业求助渠道，消除求助污名，鼓励学生及时寻求专业帮助。' },
      { title: '日常愉悦感培养视频课程', type: 'VIDEO', description: '通过艺术欣赏、自然接触、社交互动等活动设计，帮助学生重新发现生活中的美好。' },
    ],
    highScoreResources: [
      { title: '心理弹性与创伤后成长', type: 'VIDEO', description: '学习心理弹性的构建方法，理解创伤后成长的概念，将逆境转化为个人发展的契机。' },
      { title: '朋辈心理辅导技能培训', type: 'DOCUMENT', description: '系统学习朋辈辅导的理论和技巧，在帮助同伴的过程中深化对自身心理状态的理解。' },
      { title: '意义疗法与生命价值探索', type: 'ARTICLE', description: '基于弗兰克尔意义疗法，引导学生探索个人价值观、人生目标和存在的意义。' },
    ],
  },
  {
    dimensionCode: 'PSY_PRESSURE',
    dimensionName: '学业压力',
    strategyKey: 'cognitiveLoad',
    isGeneric: true,
    lowScoreResources: [
      { title: '学业压力管理与时间规划', type: 'DOCUMENT', description: '教授优先级管理、任务分解、时间块规划等技巧，帮助学生从混乱中找到掌控感。' },
      { title: '高效学习方法减轻压力', type: 'VIDEO', description: '学习费曼技巧、间隔重复、主动回忆等高效学习方法，用更少时间获得更好效果。' },
      { title: '压力下的自我照顾清单', type: 'ARTICLE', description: '提供睡眠、运动、饮食、社交等方面的自我照顾建议，维护身心健康以应对学业挑战。' },
    ],
    highScoreResources: [
      { title: '领导力与团队管理入门', type: 'VIDEO', description: '学习如何在高压环境下带领团队、分配任务、激励成员，将压力转化为团队动力。' },
      { title: '复杂项目规划与风险管理', type: 'DOCUMENT', description: '掌握大型项目的规划方法，学习风险识别和应对策略，提升在复杂情境下的掌控力。' },
      { title: '压力情境模拟与角色扮演', type: 'GAME', description: '在模拟的高压情境中练习决策和应对，通过反思和反馈提升压力管理能力。' },
    ],
  },
  {
    dimensionCode: 'PSY_RESILIENCE',
    dimensionName: '兴趣稳定性',
    strategyKey: 'learningMotivation',
    isGeneric: true,
    lowScoreResources: [
      { title: '兴趣探索与职业启蒙课程', type: 'VIDEO', description: '通过多元智能测评、职业体验、榜样访谈等方式，帮助学生发现感兴趣的领域。' },
      { title: '微习惯养成与坚持策略', type: 'DOCUMENT', description: '教授微习惯理论，从每天5分钟的小习惯开始，用低门槛启动维持学习兴趣。' },
      { title: '趣味入门项目集', type: 'GAME', description: '设计多个低门槛、高趣味的入门项目，让学生在快速成功中建立持续学习的兴趣。' },
    ],
    highScoreResources: [
      { title: '深度学习与专业方向探索', type: 'ARTICLE', description: '引导学生在感兴趣的领域进行深度学习，接触前沿研究，建立专业认同感。' },
      { title: '长期项目规划与执行', type: 'PRACTICE', description: '制定并执行一个为期数月的长期项目，在持续投入中深化兴趣、提升专业能力。' },
      { title: '跨领域兴趣融合创新', type: 'GAME', description: '鼓励将兴趣与其他学科融合，创造跨领域的创新项目，拓展兴趣的广度和深度。' },
    ],
  },
  {
    dimensionCode: 'PRAC_INNOVATION',
    dimensionName: '创新能力',
    strategyKey: 'learningAttitude',
    isGeneric: true,
    lowScoreResources: [
      { title: '创新思维启蒙：打破思维定式', type: 'VIDEO', description: '通过趣味案例和游戏，讲解逆向思维、联想思维、发散思维等创新思维的基本方法。' },
      { title: '创意激发工具箱', type: 'DOCUMENT', description: '提供头脑风暴、SCAMPER、思维导图等创意激发工具的使用指南和模板。' },
      { title: '模仿与改良练习', type: 'PRACTICE', description: '从模仿优秀作品开始，逐步加入个人改进，在熟悉的框架中培养创新信心。' },
    ],
    highScoreResources: [
      { title: '设计思维方法论与实践', type: 'DOCUMENT', description: '系统学习斯坦福设计思维五步法，通过真实项目实践掌握以人为本的创新方法。' },
      { title: '创新创业项目孵化', type: 'GAME', description: '从创意构思、市场调研、原型设计到商业计划，完整体验创新创业的全过程。' },
      { title: '前沿科技与创新趋势研究', type: 'ARTICLE', description: '跟踪AI、生物工程、新能源等领域的最新突破，思考技术创新的社会价值和未来方向。' },
    ],
  },
  {
    dimensionCode: 'PRAC_PROBLEM_SOLVING',
    dimensionName: '问题解决能力',
    strategyKey: 'selfRegulatedLearning',
    isGeneric: true,
    lowScoreResources: [
      { title: '问题解决四步法入门', type: 'DOCUMENT', description: '系统讲解理解问题、制定计划、执行方案、回顾反思的基本问题解决流程。' },
      { title: '典型问题类型与解题策略', type: 'VIDEO', description: '分类讲解常见问题的特征和对应策略，帮助学生建立问题类型识别的直觉。' },
      { title: '阶梯式难度练习题库', type: 'PRACTICE', description: '从简单到复杂的问题序列，逐步提升难度，让学生在成功体验中建立解题信心。' },
    ],
    highScoreResources: [
      { title: '复杂系统问题分析与建模', type: 'DOCUMENT', description: '学习如何分析涉及多个变量、多个层级的复杂系统问题，建立系统思维模型。' },
      { title: '真实世界问题挑战项目', type: 'GAME', description: '选取联合国可持续发展目标等真实世界问题，设计并实施解决方案。' },
      { title: '跨学科问题解决工作坊', type: 'PRACTICE', description: '组队解决需要融合多学科知识的复杂问题，在实践中提升协作和创新能力。' },
    ],
  },
  {
    dimensionCode: 'PRAC_COLLABORATION',
    dimensionName: '协作能力',
    strategyKey: 'learningMethod',
    isGeneric: true,
    lowScoreResources: [
      { title: '团队协作基础：角色与规则', type: 'DOCUMENT', description: '讲解团队角色分工（组织者、记录者、时间管理者等）和基本协作规范。' },
      { title: '有效沟通技巧视频课程', type: 'VIDEO', description: '学习倾听、表达、反馈、非暴力沟通等基本沟通技巧，提升团队协作效率。' },
      { title: '低压力协作游戏', type: 'GAME', description: '通过趣味团队游戏建立信任感和合作默契，在轻松氛围中体验协作的乐趣。' },
    ],
    highScoreResources: [
      { title: '高级项目管理与团队协作', type: 'DOCUMENT', description: '学习敏捷开发、Scrum等项目管理方法，掌握大型团队高效协作的组织技巧。' },
      { title: '跨文化协作与冲突解决', type: 'VIDEO', description: '在全球化背景下学习跨文化沟通、远程协作、团队冲突识别与解决策略。' },
      { title: '复杂协作项目领导力挑战', type: 'GAME', description: '在模拟的复杂项目中担任团队领导，练习任务分配、进度把控、团队激励等领导力。' },
    ],
  },
  {
    dimensionCode: 'PRAC_PRACTICE',
    dimensionName: '实践能力',
    strategyKey: 'learningEngagement',
    isGeneric: false,
    lowScoreResources: [
      { title: '实验操作规范与安全指南', type: 'DOCUMENT', description: '系统讲解实验室安全规范、仪器使用方法、数据记录格式等基础操作知识。' },
      { title: '分步操作演示视频', type: 'VIDEO', description: '将复杂操作分解为简单步骤，每个步骤配有详细演示和常见错误提醒。' },
      { title: '虚拟仿真练习平台', type: 'GAME', description: '在虚拟环境中反复练习操作技能，无材料损耗风险，即时反馈操作正误。' },
    ],
    highScoreResources: [
      { title: '开放性实验设计与实施', type: 'PRACTICE', description: '自主设计实验方案、选择器材、分析数据，在开放情境中提升实践创新能力。' },
      { title: '工程实践项目：从设计到制作', type: 'GAME', description: '完成一个完整的工程设计项目，包括需求分析、方案设计、原型制作、测试优化。' },
      { title: '行业专家实践工作坊', type: 'VIDEO', description: '邀请行业专家分享真实工作场景中的实践经验和问题解决策略。' },
    ],
  },
  {
    dimensionCode: 'knowledgeReserve',
    dimensionName: '知识储备',
    strategyKey: 'knowledgeReserve',
    isGeneric: false,
    lowScoreResources: [
      { title: '知识点梳理与体系构建手册', type: 'DOCUMENT', description: '系统梳理核心知识点，建立完整的知识框架，帮助夯实基础、查漏补缺。' },
      { title: '核心概念精讲微课', type: 'VIDEO', description: '名师15分钟精讲核心概念，图文并茂、深入浅出，帮助快速理解和记忆关键知识点。' },
      { title: '基础知识闯关练习', type: 'PRACTICE', description: '由易到难的分层练习，覆盖所有基础知识点，即时反馈错题解析，巩固知识储备。' },
    ],
    highScoreResources: [
      { title: '知识图谱交互式导学', type: 'GAME', description: '通过可视化的知识图谱探索知识点之间的关联，游戏化闯关模式激发学习兴趣，构建系统认知。' },
      { title: '拓展阅读：前沿应用案例集', type: 'ARTICLE', description: '精选知识点在实际工程和科研中的应用案例，帮助理解知识的实用价值，拓宽知识视野。' },
    ],
  },
  {
    dimensionCode: 'learningEngagement',
    dimensionName: '学习投入',
    strategyKey: 'learningEngagement',
    isGeneric: true,
    lowScoreResources: [
      { title: '互动式学习挑战游戏', type: 'GAME', description: '将知识点融入趣味闯关游戏，通过即时奖励和排行榜激发学习动力，提升课堂参与度和专注度。' },
      { title: '小组协作项目任务卡', type: 'DOCUMENT', description: '设计需要团队合作完成的项目任务，明确分工和角色，通过协作学习提升参与感和投入度。' },
      { title: '趣味实验操作视频', type: 'VIDEO', description: '展示生动有趣的实验操作过程，降低理解门槛，通过视觉刺激提升学习兴趣和注意力。' },
    ],
    highScoreResources: [
      { title: '学习投入度自评与改进工具', type: 'PRACTICE', description: '科学的学习投入度测评量表，帮助学生认识自身学习状态，提供个性化的投入度提升建议。' },
      { title: '学习打卡与成就系统', type: 'GAME', description: '每日学习任务打卡，累积成就徽章，培养持续学习的习惯，通过正向反馈维持学习投入。' },
    ],
  },
  {
    dimensionCode: 'cognitiveLoad',
    dimensionName: '认知负荷',
    strategyKey: 'cognitiveLoad',
    isGeneric: true,
    lowScoreResources: [
      { title: '思维导图与概念地图工具', type: 'DOCUMENT', description: '提供结构化的思维导图模板，帮助学生将复杂知识可视化，降低工作记忆负担，理清知识脉络。' },
      { title: '复杂任务分解指南', type: 'DOCUMENT', description: '教授任务分解技巧，将复杂问题拆解为可管理的小步骤，逐步完成，有效降低认知负荷。' },
      { title: '碎片化学习视频系列', type: 'VIDEO', description: '每节5-8分钟的短视频，专注单一知识点，避免信息过载，适合认知负荷较高的学生循序渐进学习。' },
    ],
    highScoreResources: [
      { title: '认知负荷自测与调节策略', type: 'PRACTICE', description: '科学测评当前认知负荷水平，提供针对性的调节策略：休息间隔、信息分块、注意力管理等。' },
      { title: '学习环境优化建议手册', type: 'ARTICLE', description: '从物理环境、数字工具、时间管理三个维度，提供降低外部认知负荷的实用建议和工具推荐。' },
    ],
  },
  {
    dimensionCode: 'learningMotivation',
    dimensionName: '学习动机',
    strategyKey: 'learningMotivation',
    isGeneric: true,
    lowScoreResources: [
      { title: '学习目标设定与愿景规划工具', type: 'DOCUMENT', description: 'SMART原则目标设定模板，帮助学生将远大愿景分解为可达成的阶段性目标，激发内在动机。' },
      { title: '成就激励与正向反馈系统', type: 'GAME', description: '游戏化的成就系统，完成任务获得积分和徽章，即时正向反馈强化学习行为，提升学习动机。' },
      { title: '学科兴趣探索视频', type: 'VIDEO', description: '展示学科知识在现实生活、前沿科技中的酷炫应用，激发好奇心和探索欲，建立学习意义感。' },
    ],
    highScoreResources: [
      { title: '学习动机提升策略指南', type: 'ARTICLE', description: '基于自我决定理论，提供提升自主感、胜任感、归属感的方法，帮助学生找到学习的内在动力。' },
      { title: '同伴学习挑战赛', type: 'GAME', description: '与同伴组队参与知识竞赛，通过社交互动和竞争激发学习动力，体验协作学习的乐趣。' },
    ],
  },
  {
    dimensionCode: 'computationalThinking',
    dimensionName: '计算思维',
    strategyKey: 'computationalThinking',
    isGeneric: false,
    lowScoreResources: [
      { title: '算法思维训练题库', type: 'PRACTICE', description: '从基础逻辑到复杂算法的分层练习，每道题附带详细的思路解析和多种解法，培养计算思维。' },
      { title: '逻辑推理与模式识别游戏', type: 'GAME', description: '通过数独、逻辑谜题、模式识别等游戏化训练，潜移默化地培养抽象思维和问题分解能力。' },
      { title: '计算思维培养手册', type: 'DOCUMENT', description: '系统讲解计算思维的四大核心（分解、模式识别、抽象、算法），配合案例分析和练习。' },
    ],
    highScoreResources: [
      { title: '编程挑战赛实战视频', type: 'VIDEO', description: '记录真实编程挑战赛的解题过程，展示如何运用计算思维分析问题、设计算法、调试优化。' },
      { title: '伪代码与流程图设计工具', type: 'DOCUMENT', description: '提供伪代码编写规范和流程图绘制工具，帮助学生在编码前先进行逻辑设计，培养结构化思维。' },
    ],
  },
  {
    dimensionCode: 'humanAiTrust',
    dimensionName: '人机信任度',
    strategyKey: 'humanAiTrust',
    isGeneric: true,
    lowScoreResources: [
      { title: 'AI伦理与批判性思维案例集', type: 'ARTICLE', description: '精选AI应用中的伦理争议案例，引导学生批判性分析AI输出的可靠性，建立合理的人机信任边界。' },
      { title: 'AI工具透明性与可解释性指南', type: 'DOCUMENT', description: '介绍主流AI工具的工作原理、局限性和使用边界，帮助学生理解AI的能力范围和不确定性。' },
      { title: 'AI输出验证与事实核查练习', type: 'PRACTICE', description: '提供AI生成的内容，要求学生进行事实核查和逻辑验证，培养对AI输出的审慎态度。' },
    ],
    highScoreResources: [
      { title: '人机协作项目实战教程', type: 'VIDEO', description: '演示如何将AI作为辅助工具而非替代方案，通过实际项目展示人机协作的最佳实践。' },
      { title: 'AI发展历史与成功案例纪录片', type: 'VIDEO', description: '展示AI技术的发展历程和成功应用案例，建立对AI技术潜力的客观认知，增强合理信任。' },
    ],
  },
  {
    dimensionCode: 'learningMethod',
    dimensionName: '学习方法倾向',
    strategyKey: 'learningMethod',
    isGeneric: true,
    lowScoreResources: [
      { title: '高效学习方法论与工具箱', type: 'DOCUMENT', description: '费曼学习法、番茄工作法、康奈尔笔记法等经典学习方法的详细指南，帮助学生找到适合自己的学习方式。' },
      { title: '小组协作与沟通技巧手册', type: 'DOCUMENT', description: '教授小组讨论、头脑风暴、角色分工、冲突解决等协作技能，提升团队合作学习效率。' },
      { title: '协作式学习项目模板', type: 'GAME', description: '提供结构化的协作项目框架，包含任务分配、进度追踪、成果展示等环节，在实践中锻炼协作能力。' },
    ],
    highScoreResources: [
      { title: '学习方法案例分享视频', type: 'VIDEO', description: '优秀学生分享各自的学习方法和经验，涵盖时间管理、笔记整理、复习策略等多个方面。' },
      { title: '知识整理与输出技巧', type: 'ARTICLE', description: '讲解如何通过思维导图、概念图、学习日志等方式整理知识，以及如何通过教授他人巩固学习成果。' },
    ],
  },
  {
    dimensionCode: 'learningAttitude',
    dimensionName: '学习态度',
    strategyKey: 'learningAttitude',
    isGeneric: true,
    lowScoreResources: [
      { title: '成长型思维培养课程', type: 'VIDEO', description: '通过生动的故事和案例，讲解成长型思维与固定型思维的区别，帮助学生建立积极的学习态度。' },
      { title: '学习态度自评与转变工具', type: 'PRACTICE', description: '科学的学习态度量表，帮助学生认识自己的学习态度现状，提供针对性的转变策略和行动方案。' },
      { title: '正向激励与自信心建设游戏', type: 'GAME', description: '通过游戏化的挑战和成就系统，让学生在成功体验中建立自信，培养积极主动的学习态度。' },
    ],
    highScoreResources: [
      { title: '学习心态调整指南', type: 'DOCUMENT', description: '针对学习焦虑、畏难情绪、拖延行为等常见问题，提供科学的心理调适方法和应对策略。' },
      { title: '榜样力量：学霸成长故事集', type: 'ARTICLE', description: '收集整理从学困生到优秀生的真实转变故事，通过榜样的力量激励学生改变学习态度。' },
    ],
  },
  {
    dimensionCode: 'selfRegulatedLearning',
    dimensionName: '自我调节学习',
    strategyKey: 'selfRegulatedLearning',
    isGeneric: true,
    lowScoreResources: [
      { title: '学习计划制定与执行手册', type: 'DOCUMENT', description: '从目标设定、任务分解、时间规划到执行监控的完整指南，帮助学生建立科学的学习管理体系。' },
      { title: '学习进度追踪与反思日志模板', type: 'PRACTICE', description: '提供每日/每周学习记录模板，帮助学生追踪学习进度、反思学习效果、及时调整学习策略。' },
      { title: '时间管理四象限工作法指南', type: 'DOCUMENT', description: '教授优先级管理、时间块分配、番茄工作法等时间管理技巧，提升学习效率和自律性。' },
    ],
    highScoreResources: [
      { title: '元认知能力训练视频课程', type: 'VIDEO', description: '讲解元认知的概念和作用，教授计划、监控、评估三个阶段的元认知策略，提升学习自主性。' },
      { title: '自我检测与错题分析工具', type: 'PRACTICE', description: '定期自我测验，自动生成错题分析报告，帮助学生识别薄弱环节，有针对性地调整学习计划。' },
    ],
  },
  {
    dimensionCode: 'aiLiteracy',
    dimensionName: '人工智能素养',
    strategyKey: 'aiLiteracy',
    isGeneric: true,
    lowScoreResources: [
      { title: 'AI基础概念科普系列文章', type: 'ARTICLE', description: '用通俗易懂的语言讲解AI的基本概念、发展历程和应用领域，帮助学生建立对AI的初步认知。' },
      { title: 'AI工具实操入门视频教程', type: 'VIDEO', description: '手把手教学主流AI工具的使用方法，包括提示词工程、输出优化、结果验证等实用技巧。' },
      { title: 'AI伦理与 Responsible AI 指南', type: 'DOCUMENT', description: '系统讲解AI伦理问题：偏见、隐私、安全、版权等，培养负责任的AI使用意识和批判性思维。' },
    ],
    highScoreResources: [
      { title: 'AI项目实践：从零开始', type: 'PRACTICE', description: '通过完成一个完整的AI辅助项目（如数据分析、内容创作），在实践中掌握AI工具的应用能力。' },
      { title: 'AI前沿技术解读专栏', type: 'ARTICLE', description: '跟踪解读最新的AI技术进展和应用案例，帮助学生了解AI发展趋势，激发深入学习的兴趣。' },
    ],
  },
];

function buildSearchUrl(title: string, type: string): string {
  const encoded = encodeURIComponent(title);
  switch (type) {
    case 'VIDEO':
      return `https://search.bilibili.com/all?keyword=${encoded}`;
    case 'ARTICLE':
      return `https://www.zhihu.com/search?type=content&q=${encoded}`;
    case 'DOCUMENT':
      return `https://wenku.baidu.com/search?word=${encoded}`;
    case 'PRACTICE':
    case 'GAME':
    default:
      return `https://cn.bing.com/search?q=${encoded}`;
  }
}

async function main() {
  try {
    console.log('🚀 开始创建维度专属教学资源...\n');

    const scenarios = await prisma.learningScenario.findMany({
      where: { isActive: true },
    });
    console.log(`📊 活跃场景数: ${scenarios.length}`);

    let totalCreated = 0;
    let totalRates = 0;

    for (const scenario of scenarios) {
      console.log(`\n📌 场景: ${scenario.nameZh}`);

      const students = await prisma.graphNode.findMany({
        where: { scenarioId: scenario.id, nodeType: 'STUDENT' },
        select: { id: true },
      });

      const knowledgeNodes = await prisma.graphNode.findMany({
        where: { scenarioId: scenario.id, nodeType: 'KNOWLEDGE' },
        select: { id: true, displayName: true },
      });

      if (knowledgeNodes.length === 0) {
        console.log(`  ⚠️ 无知识点，跳过`);
        continue;
      }

      console.log(`  👥 ${students.length} 学生 | 📚 ${knowledgeNodes.length} 知识点`);

      const genericKnowledgeNode = knowledgeNodes[0];

      for (const dim of DIMENSION_RESOURCE_DEFS) {
        const allTemplates = [...dim.lowScoreResources, ...dim.highScoreResources];

        for (const template of allTemplates) {
          const selectedNodes = dim.isGeneric
            ? [genericKnowledgeNode]
            : [...knowledgeNodes].sort(() => 0.5 - Math.random()).slice(0, Math.min(2, knowledgeNodes.length));

          for (const knowledge of selectedNodes) {
            const title = dim.isGeneric
              ? template.title
              : `${knowledge.displayName} · ${template.title}`;

            const existing = await prisma.resource.findFirst({ where: { title } });
            if (existing) continue;

            const resource = await prisma.resource.create({
              data: {
                title,
                description: `[${dim.dimensionName}] ${template.description}`,
                resourceType: template.type,
                url: `https://example.com/r/${dim.dimensionCode}/${template.type}`,
                knowledgeRelations: {
                  create: { knowledgeNodeId: knowledge.id },
                },
              },
            });

            totalCreated++;

            const numRates = Math.floor(students.length * (0.3 + Math.random() * 0.3));
            const shuffledStudents = [...students].sort(() => 0.5 - Math.random());
            const selectedStudents = shuffledStudents.slice(0, numRates);

            for (const student of selectedStudents) {
              const rate = Number((3.0 + Math.random() * 1.5).toFixed(2));
              try {
                await prisma.studentResourceRate.create({
                  data: { studentId: student.id, resourceId: resource.id, rate },
                });
                totalRates++;
              } catch (e: any) {
                if (e?.code !== 'P2002') throw e;
              }
            }
          }
        }
      }
    }

    console.log(`\n✅ 创建资源: ${totalCreated} 个`);
    console.log(`✅ 创建评分: ${totalRates} 条`);

    const totalResources = await prisma.resource.count();
    console.log(`\n📊 数据库资源总数: ${totalResources}`);
    console.log('\n✅ 全部完成!');

  } catch (error) {
    console.error('\n❌ 失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
