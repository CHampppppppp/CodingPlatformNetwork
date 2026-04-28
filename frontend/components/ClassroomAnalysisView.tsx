import React from 'react';
import { ClassroomAnalysis } from '../types';
import { BookOpen, Users, Brain, Heart, MessageSquare, UserCheck, Award, Shield } from 'lucide-react';

interface ClassroomAnalysisViewProps {
  data: ClassroomAnalysis | null;
}

const LevelBadge: React.FC<{ level: string | null; type?: 'rating' | 'achievement' }> = ({ level, type = 'rating' }) => {
  if (!level) return <span className="text-gray-400">暂无数据</span>;

  const colors = type === 'achievement'
    ? {
        '优秀': 'bg-emerald-100 text-emerald-700',
        '良好': 'bg-blue-100 text-blue-700',
        '中等': 'bg-amber-100 text-amber-700',
        '待提升': 'bg-red-100 text-red-700',
      }
    : {
        '高': 'bg-emerald-100 text-emerald-700',
        '中': 'bg-amber-100 text-amber-700',
        '低': 'bg-red-100 text-red-700',
      };

  const colorClass = colors[level as keyof typeof colors] || 'bg-gray-100 text-gray-700';

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {level}
    </span>
  );
};

const CountDisplay: React.FC<{ value: number | null; suffix?: string; decimals?: number }> = ({ value, suffix = '', decimals }) => {
  if (value === null || value === undefined || Number.isNaN(value)) return <span className="text-gray-400">-</span>;
  const displayValue = decimals !== undefined ? value.toFixed(decimals) : value;
  return <span className="text-lg font-bold text-gray-800">{displayValue}{suffix}</span>;
};

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
    <div className="flex items-center gap-2 mb-4">
      {icon}
      <h3 className="text-sm font-bold text-gray-700">{title}</h3>
    </div>
    {children}
  </div>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
    <span className="text-sm text-gray-600">{label}</span>
    <div className="text-right">{children}</div>
  </div>
);

export const ClassroomAnalysisView: React.FC<ClassroomAnalysisViewProps> = ({ data }) => {
  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        暂无课堂视频分析数据
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 items-start animate-in slide-in-from-bottom-2 duration-300">
      <SectionCard
        title="知识点激活"
        icon={<BookOpen className="w-5 h-5 text-emerald-500" />}
      >
        <Row label="激活率"><CountDisplay value={data.knowledgeActivationRate} suffix="%" decimals={1} /></Row>
        <Row label="已激活知识点"><CountDisplay value={data.activatedKnowledgeCount} /></Row>
        <Row label="总知识点数"><CountDisplay value={data.totalKnowledgeCount} /></Row>
      </SectionCard>

      <SectionCard
        title="行为投入度"
        icon={<Users className="w-5 h-5 text-blue-500" />}
      >
        <Row label="投入等级"><LevelBadge level={data.behavioralEngagementLevel} /></Row>
        <Row label="师生互动次数"><CountDisplay value={data.teacherStudentInteractionCount} suffix="次" /></Row>
        <Row label="同伴合作次数"><CountDisplay value={data.peerCollaborationCount} suffix="次" /></Row>
      </SectionCard>

      <SectionCard
        title="认知投入度"
        icon={<Brain className="w-5 h-5 text-violet-500" />}
      >
        <Row label="投入等级"><LevelBadge level={data.cognitiveEngagementLevel} /></Row>
        <Row label="建构层级发言"><CountDisplay value={data.constructiveUtteranceCount} suffix="次" /></Row>
      </SectionCard>

      <SectionCard
        title="情感投入度"
        icon={<Heart className="w-5 h-5 text-rose-500" />}
      >
        <Row label="倦怠情绪">
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
            data.hasBurnout ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {data.hasBurnout ? '有' : '无'}
          </span>
        </Row>
        <Row label="沮丧情绪">
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
            data.hasFrustration ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {data.hasFrustration ? '有' : '无'}
          </span>
        </Row>
      </SectionCard>

      <SectionCard
        title="教学支持"
        icon={<Award className="w-5 h-5 text-amber-500" />}
      >
        <Row label="概念发展"><LevelBadge level={data.conceptDevelopmentLevel} type="achievement" /></Row>
        <Row label="反馈质量"><LevelBadge level={data.feedbackQualityLevel} type="achievement" /></Row>
        <Row label="学业期望"><LevelBadge level={data.academicExpectationLevel} type="achievement" /></Row>
      </SectionCard>

      <SectionCard
        title="课堂互动"
        icon={<MessageSquare className="w-5 h-5 text-indigo-500" />}
      >
        <Row label="封闭式提问"><CountDisplay value={data.closedQuestionCount} suffix="次" /></Row>
        <Row label="理解应用型提问"><CountDisplay value={data.applicationQuestionCount} suffix="次" /></Row>
        <Row label="开放探究型提问"><CountDisplay value={data.openQuestionCount} suffix="次" /></Row>
        <div className="mt-3 pt-3 border-t border-gray-100">
          <Row label="接受/采纳反馈"><CountDisplay value={data.acceptFeedbackCount} suffix="次" /></Row>
          <Row label="表扬/鼓励反馈"><CountDisplay value={data.praiseFeedbackCount} suffix="次" /></Row>
          <Row label="拓展性反馈"><CountDisplay value={data.extendFeedbackCount} suffix="次" /></Row>
          <Row label="纠正性反馈"><CountDisplay value={data.correctFeedbackCount} suffix="次" /></Row>
        </div>
      </SectionCard>

      <SectionCard
        title="课堂参与"
        icon={<UserCheck className="w-5 h-5 text-cyan-500" />}
      >
        <Row label="学生发言人次"><CountDisplay value={data.studentUtteranceCount} suffix="次" /></Row>
        <Row label="教师语言流利度"><LevelBadge level={data.teacherFluencyLevel} type="achievement" /></Row>
        <Row label="使用工具种类"><CountDisplay value={data.toolVarietyCount} suffix="种" /></Row>
      </SectionCard>

      <SectionCard
        title="教师情感能力"
        icon={<Users className="w-5 h-5 text-pink-500" />}
      >
        <Row label="自我认知"><LevelBadge level={data.selfAwarenessLevel} type="achievement" /></Row>
        <Row label="自我管理"><LevelBadge level={data.selfManagementLevel} type="achievement" /></Row>
        <Row label="集体认知与管理"><LevelBadge level={data.collectiveManagementLevel} type="achievement" /></Row>
      </SectionCard>

      <SectionCard
        title="课堂组织管理"
        icon={<Shield className="w-5 h-5 text-orange-500" />}
      >
        <Row label="明确课堂规则"><LevelBadge level={data.ruleClarityLevel} type="achievement" /></Row>
        <Row label="强化积极行为"><LevelBadge level={data.positiveReinforcementLevel} type="achievement" /></Row>
        <Row label="弱化消极行为"><LevelBadge level={data.negativeReductionLevel} type="achievement" /></Row>
      </SectionCard>
    </div>
  );
};
