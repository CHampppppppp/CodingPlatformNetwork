import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaMssql } from '@prisma/adapter-mssql';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

let prisma: PrismaClient;
if (databaseUrl.startsWith('sqlserver://')) {
  const adapter = new PrismaMssql(databaseUrl);
  prisma = new PrismaClient({ adapter });
} else {
  const adapter = new PrismaMariaDb(databaseUrl);
  prisma = new PrismaClient({ adapter });
}

async function main() {
  const counts = await Promise.all([
    prisma.school.count(),
    prisma.grade.count(),
    prisma.class.count(),
    prisma.graphNode.count({ where: { nodeType: 'Student' } }),
    prisma.graphNode.count({ where: { nodeType: 'Teacher' } }),
    prisma.graphNode.count({ where: { nodeType: 'Knowledge' } }),
    prisma.graphNode.count(),
    prisma.interaction.count(),
    prisma.interactionSession.count(),
    prisma.learningScenario.count(),
    prisma.studentWork.count(),
    prisma.resource.count(),
    prisma.cognitiveDimensionDef.count(),
    prisma.studentCognitiveProfile.count(),
    prisma.sessionClassroomAnalysis.count(),
    prisma.studentResourceRate.count(),
    prisma.studentKnowledgeRelation.count(),
  ]);

  const [
    schoolCount,
    gradeCount,
    classCount,
    studentCount,
    teacherCount,
    knowledgeCount,
    totalNodeCount,
    interactionCount,
    sessionCount,
    scenarioCount,
    studentWorkCount,
    resourceCount,
    cognitiveDimCount,
    cognitiveProfileCount,
    classroomAnalysisCount,
    resourceRateCount,
    studentKnowledgeRelationCount,
  ] = counts;

  const nodeTypeDistribution = await prisma.graphNode.groupBy({
    by: ['nodeType'],
    _count: { id: true },
  });

  const topSchoolsByStudents = await prisma.school.findMany({
    take: 10,
    orderBy: { grades: { _count: 'desc' } },
    select: {
      name: true,
      _count: { select: { grades: true, teachers: true } },
      id: true,
    },
  });

  // 获取每个学校的学生数
  const schoolIds = topSchoolsByStudents.map((s) => s.id);
  const studentCounts = await prisma.graphNode.groupBy({
    by: ['schoolId'],
    where: {
      nodeType: 'Student',
      schoolId: { in: schoolIds },
    },
    _count: { id: true },
  });

  const studentCountMap = new Map(
    studentCounts.map((s) => [s.schoolId, s._count.id]),
  );

  const topSchoolsWithStudents = topSchoolsByStudents.map((s) => ({
    name: s.name,
    gradeCount: s._count.grades,
    teacherCount: s._count.teachers,
    studentCount: studentCountMap.get(s.id) || 0,
  }));

  const scenarioStats = await prisma.learningScenario.findMany({
    select: {
      nameZh: true,
      code: true,
      _count: { select: { nodes: true, sessions: true } },
    },
  });

  const interactionTypeStats = await prisma.interaction.groupBy({
    by: ['interactionType'],
    _count: { id: true },
  });

  const data = {
    generatedAt: new Date().toISOString(),
    databaseUrl: process.env.DATABASE_URL?.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@') || 'unknown',
    overview: {
      学校数量: schoolCount,
      年级数量: gradeCount,
      班级数量: classCount,
      学生数量: studentCount,
      教师数量: teacherCount,
      知识点数量: knowledgeCount,
      网络节点总数: totalNodeCount,
      交互记录数量: interactionCount,
      会话数量: sessionCount,
      学习场景数量: scenarioCount,
      学生作品数量: studentWorkCount,
      资源数量: resourceCount,
      认知维度定义数量: cognitiveDimCount,
      学生认知画像数量: cognitiveProfileCount,
      课堂分析数量: classroomAnalysisCount,
      学生资源评分数量: resourceRateCount,
      学生知识点关联数量: studentKnowledgeRelationCount,
    },
    nodeTypeDistribution,
    scenarioStats,
    interactionTypeStats,
    topSchoolsByStudents: topSchoolsWithStudents,
  };

  const reportsDir = path.resolve(__dirname, '../../reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  generateMarkdown(data, path.join(reportsDir, 'data-statistics.md'));
  generateHtml(data, path.join(reportsDir, 'data-statistics.html'));

  console.log('Reports generated in', reportsDir);
}

function generateMarkdown(data: any, filePath: string) {
  const overview = data.overview;
  let md = `# 数据概况统计报告\n\n`;
  md += `> 生成时间: ${new Date(data.generatedAt).toLocaleString('zh-CN')}\n\n`;
  md += `> 数据来源: ${data.databaseUrl}\n\n`;

  md += `## 核心数据概览\n\n`;
  md += `| 指标 | 数量 |\n`;
  md += `|------|------|\n`;
  for (const [key, value] of Object.entries(overview)) {
    md += `| ${key} | ${value} |\n`;
  }

  md += `\n## 节点类型分布\n\n`;
  md += `| 节点类型 | 数量 |\n`;
  md += `|----------|------|\n`;
  for (const item of data.nodeTypeDistribution) {
    md += `| ${item.nodeType} | ${item._count.id} |\n`;
  }

  md += `\n## 学习场景分布\n\n`;
  md += `| 场景名称 | 代码 | 节点数 | 会话数 |\n`;
  md += `|----------|------|--------|--------|\n`;
  for (const s of data.scenarioStats) {
    md += `| ${s.nameZh} | ${s.code} | ${s._count.nodes} | ${s._count.sessions} |\n`;
  }

  md += `\n## 交互类型分布\n\n`;
  md += `| 交互类型 | 数量 |\n`;
  md += `|----------|------|\n`;
  for (const item of data.interactionTypeStats) {
    md += `| ${item.interactionType} | ${item._count.id} |\n`;
  }

  md += `\n## 学校Top 10（按年级数）\n\n`;
  md += `| 学校名称 | 年级数 | 教师数 | 学生数 |\n`;
  md += `|----------|--------|--------|--------|\n`;
  for (const s of data.topSchoolsByStudents) {
    md += `| ${s.name} | ${s.gradeCount} | ${s.teacherCount} | ${s.studentCount} |\n`;
  }

  fs.writeFileSync(filePath, md, 'utf-8');
}

function generateHtml(data: any, filePath: string) {
  const overview = data.overview;
  const overviewRows = Object.entries(overview)
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
    .join('\n');

  const nodeTypeRows = data.nodeTypeDistribution
    .map((item: any) => `<tr><td>${item.nodeType}</td><td>${item._count.id}</td></tr>`)
    .join('\n');

  const scenarioRows = data.scenarioStats
    .map((s: any) => `<tr><td>${s.nameZh}</td><td>${s.code}</td><td>${s._count.nodes}</td><td>${s._count.sessions}</td></tr>`)
    .join('\n');

  const interactionRows = data.interactionTypeStats
    .map((item: any) => `<tr><td>${item.interactionType}</td><td>${item._count.id}</td></tr>`)
    .join('\n');

  const schoolRows = data.topSchoolsByStudents
    .map((s: any) => `<tr><td>${s.name}</td><td>${s.gradeCount}</td><td>${s.teacherCount}</td><td>${s.studentCount}</td></tr>`)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>数据概况统计报告</title>
<style>
  :root { --bg: #f6f7f9; --card: #fff; --text: #1f2328; --muted: #656d76; --border: #d1d9e0; --accent: #0969da; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0d1117; --card: #161b22; --text: #c9d1d9; --muted: #8b949e; --border: #30363d; --accent: #58a6ff; } }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 24px; }
  .container { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 28px; margin-bottom: 8px; }
  .meta { color: var(--muted); font-size: 14px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .card .label { font-size: 13px; color: var(--muted); margin-bottom: 6px; }
  .card .value { font-size: 28px; font-weight: 600; color: var(--accent); }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-bottom: 32px; }
  th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border); }
  th { background: var(--bg); font-weight: 600; font-size: 14px; color: var(--muted); }
  td { font-size: 14px; }
  tr:last-child td { border-bottom: none; }
  h2 { font-size: 20px; margin: 32px 0 12px; }
</style>
</head>
<body>
<div class="container">
  <h1>数据概况统计报告</h1>
  <div class="meta">生成时间: ${new Date(data.generatedAt).toLocaleString('zh-CN')} · 数据来源: ${data.databaseUrl}</div>

  <div class="grid">
    ${Object.entries(overview).map(([k, v]) => `<div class="card"><div class="label">${k}</div><div class="value">${v}</div></div>`).join('\n    ')}
  </div>

  <h2>节点类型分布</h2>
  <table>
    <thead><tr><th>节点类型</th><th>数量</th></tr></thead>
    <tbody>${nodeTypeRows}</tbody>
  </table>

  <h2>学习场景分布</h2>
  <table>
    <thead><tr><th>场景名称</th><th>代码</th><th>节点数</th><th>会话数</th></tr></thead>
    <tbody>${scenarioRows}</tbody>
  </table>

  <h2>交互类型分布</h2>
  <table>
    <thead><tr><th>交互类型</th><th>数量</th></tr></thead>
    <tbody>${interactionRows}</tbody>
  </table>

  <h2>学校Top 10（按年级数）</h2>
  <table>
    <thead><tr><th>学校名称</th><th>年级数</th><th>教师数</th><th>学生数</th></tr></thead>
    <tbody>${schoolRows}</tbody>
  </table>
</div>
</body>
</html>`;

  fs.writeFileSync(filePath, html, 'utf-8');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
