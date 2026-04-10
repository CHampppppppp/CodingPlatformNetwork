#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import * as dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaMssql(databaseUrl);
const prisma = new PrismaClient({ adapter });

async function listAllTables() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                        📊 数据库表结构及数据清单                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════╝\n');

  await showTable('LearningScenario', async () => {
    const data = await prisma.learningScenario.findMany({
      orderBy: { sortOrder: 'asc' }
    });
    return data.map(s => ({
      id: truncateId(s.id),
      code: s.code,
      nameZh: s.nameZh,
      isActive: s.isActive,
      sortOrder: s.sortOrder
    }));
  });

  await showTable('School', async () => {
    const data = await prisma.school.findMany({
      include: {
        _count: {
          select: { grades: true }
        }
      }
    });
    return data.map(s => ({
      id: truncateId(s.id),
      name: s.name,
      gradesCount: s._count.grades
    }));
  });

  await showTable('Grade', async () => {
    const data = await prisma.grade.findMany({
      include: {
        school: { select: { name: true } },
        _count: { select: { classes: true } }
      }
    });
    return data.map(g => ({
      id: truncateId(g.id),
      school: g.school.name,
      gradeName: g.gradeName,
      classesCount: g._count.classes
    }));
  });

  await showTable('SchoolClass', async () => {
    const data = await prisma.schoolClass.findMany({
      include: {
        grade: {
          include: {
            school: { select: { name: true } }
          }
        }
      }
    });
    return data.map(c => ({
      id: truncateId(c.id),
      school: c.grade.school.name,
      grade: c.grade.gradeName,
      className: c.className
    }));
  });

  await showTable('GraphNode (所有节点)', async () => {
    const data = await prisma.graphNode.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        scenario: { select: { nameZh: true } }
      }
    });
    return data.map(n => ({
      id: truncateId(n.id),
      type: n.nodeType,
      name: truncateString(n.displayName, 15),
      scenario: n.scenario.nameZh,
      schoolId: n.schoolId ? truncateId(n.schoolId) : 'null',
      createdAt: formatDate(n.createdAt)
    }));
  });

  await showTable('GraphNode - Student (学生节点)', async () => {
    const data = await prisma.graphNode.findMany({
      where: { nodeType: 'Student' },
      take: 10,
      include: {
        scenario: { select: { nameZh: true } },
        studentProfile: true
      }
    });
    return data.map(n => ({
      id: truncateId(n.id),
      name: n.displayName,
      scenario: n.scenario.nameZh,
      learningStyle: n.studentProfile?.learningStylePreference || '-',
      personality: n.studentProfile?.personality || '-'
    }));
  });

  await showTable('GraphNode - Teacher (教师节点)', async () => {
    const data = await prisma.graphNode.findMany({
      where: { nodeType: 'Teacher' },
      include: {
        scenario: { select: { nameZh: true } },
        teacherProfile: true
      }
    });
    return data.map(n => ({
      id: truncateId(n.id),
      name: n.displayName,
      scenario: n.scenario.nameZh,
      subject: n.teacherProfile?.subject || '-',
      teachingClass: n.teacherProfile?.teachingClass || '-'
    }));
  });

  await showTable('GraphNode - Knowledge (知识点节点)', async () => {
    const data = await prisma.graphNode.findMany({
      where: { nodeType: 'Knowledge' },
      include: {
        scenario: { select: { nameZh: true } },
        knowledgeProfile: true
      }
    });
    return data.map(n => ({
      id: truncateId(n.id),
      name: n.displayName,
      scenario: n.scenario.nameZh,
      category: n.knowledgeProfile?.category || '-',
      type: n.knowledgeProfile?.knowledgeType || '-',
      content: truncateString(n.knowledgeProfile?.content || '-', 30)
    }));
  });

  await showTable('InteractionSession (交互会话)', async () => {
    const data = await prisma.interactionSession.findMany({
      take: 10,
      orderBy: { occurredAt: 'desc' },
      include: {
        scenario: { select: { nameZh: true } },
        _count: { select: { interactions: true } }
      }
    });
    return data.map(s => ({
      id: truncateId(s.id),
      name: s.sessionName || '-',
      scenario: s.scenario.nameZh,
      occurredAt: formatDate(s.occurredAt),
      interactions: s._count.interactions
    }));
  });

  await showTable('Interaction (交互关系)', async () => {
    const data = await prisma.interaction.findMany({
      take: 10,
      include: {
        sourceNode: { select: { displayName: true, nodeType: true } },
        targetNode: { select: { displayName: true, nodeType: true } }
      }
    });
    return data.map(i => ({
      id: truncateId(i.id),
      source: `${truncateString(i.sourceNode.displayName, 10)}(${i.sourceNode.nodeType[0]})`,
      arrow: '→',
      target: `${truncateString(i.targetNode.displayName, 10)}(${i.targetNode.nodeType[0]})`,
      type: i.interactionType,
      strength: i.strength.toString()
    }));
  });

  await showTable('CognitiveDimensionDef (认知维度定义)', async () => {
    const data = await prisma.cognitiveDimensionDef.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });
    return data.map(d => ({
      code: d.dimensionCode,
      name: d.dimensionNameZh,
      category: d.category,
      scoreRange: `${d.minScore}-${d.maxScore}`,
      order: d.sortOrder
    }));
  });

  await showTable('StudentCognitiveProfile (学生认知画像)', async () => {
    const data = await prisma.studentCognitiveProfile.findMany({
      take: 10,
      orderBy: { generatedAt: 'desc' },
      include: {
        studentNode: { select: { displayName: true } },
        _count: { select: { dimensionScores: true } }
      }
    });
    return data.map(p => ({
      id: truncateId(p.id),
      student: p.studentNode.displayName,
      version: p.profileVersion,
      totalScore: p.totalScore.toString(),
      generatedAt: formatDate(p.generatedAt),
      dimensions: p._count.dimensionScores
    }));
  });

  await showSummary();

  await prisma.$disconnect();
}

async function showTable(tableName: string, fetchData: () => Promise<any[]>) {
  console.log(`\n${'─'.repeat(84)}`);
  console.log(`📋 表名: ${tableName}`);
  console.log(`${'─'.repeat(84)}`);
  
  try {
    const data = await fetchData();
    
    if (data.length === 0) {
      console.log('   (空表 - 暂无数据)');
      return;
    }

    const columns = Object.keys(data[0]);
    
    const colWidths: Record<string, number> = {};
    columns.forEach(col => {
      const headerWidth = col.length;
      const maxDataWidth = Math.max(...data.map(row => String(row[col] || '').length));
      colWidths[col] = Math.max(headerWidth, maxDataWidth, 8) + 2;
    });

    let headerRow = '│ ';
    let separator = '├─';
    columns.forEach(col => {
      const width = colWidths[col];
      headerRow += col.padEnd(width) + '│ ';
      separator += '─'.repeat(width) + '┼─';
    });
    separator = separator.slice(0, -2) + '┤';
    
    console.log(headerRow);
    console.log(separator);

    data.forEach(row => {
      let dataRow = '│ ';
      columns.forEach(col => {
        const value = String(row[col] || '');
        dataRow += value.padEnd(colWidths[col]) + '│ ';
      });
      console.log(dataRow);
    });

    let bottomBorder = '└─';
    columns.forEach(col => {
      bottomBorder += '─'.repeat(colWidths[col]) + '┴─';
    });
    bottomBorder = bottomBorder.slice(0, -2) + '┘';
    console.log(bottomBorder);

    console.log(`   共 ${data.length} 条记录${data.length >= 10 ? ' (显示前10条)' : ''}`);
    
  } catch (error) {
    console.log(`   ❌ 查询失败: ${error}`);
  }
}

async function showSummary() {
  console.log(`\n${'═'.repeat(84)}`);
  console.log('║                              📊 数据统计汇总                                     ║');
  console.log(`${'═'.repeat(84)}`);

  const stats = [
    { name: '学习场景', count: await prisma.learningScenario.count() },
    { name: '学校', count: await prisma.school.count() },
    { name: '年级', count: await prisma.grade.count() },
    { name: '班级', count: await prisma.schoolClass.count() },
    { name: '图谱节点-总计', count: await prisma.graphNode.count() },
    { name: '  ├─ 学生节点', count: await prisma.graphNode.count({ where: { nodeType: 'Student' } }) },
    { name: '  ├─ 教师节点', count: await prisma.graphNode.count({ where: { nodeType: 'Teacher' } }) },
    { name: '  └─ 知识点节点', count: await prisma.graphNode.count({ where: { nodeType: 'Knowledge' } }) },
    { name: '交互会话', count: await prisma.interactionSession.count() },
    { name: '交互关系', count: await prisma.interaction.count() },
    { name: '认知维度定义', count: await prisma.cognitiveDimensionDef.count() },
    { name: '学生认知画像', count: await prisma.studentCognitiveProfile.count() },
  ];

  const maxNameLength = Math.max(...stats.map(s => s.name.length));
  
  stats.forEach(stat => {
    const indent = stat.name.startsWith('  ') ? '  ' : '';
    const name = stat.name.replace(/^  /, '');
    const padding = ' '.repeat(maxNameLength - name.length + 2);
    const bar = '█'.repeat(Math.min(stat.count / 2, 50));
    console.log(`${indent}${name}${padding}${stat.count.toString().padStart(4)} ${bar}`);
  });

  console.log(`${'═'.repeat(84)}\n`);
}

function truncateId(id: string): string {
  if (!id) return '';
  if (id.length <= 8) return id;
  return id.substring(0, 8) + '...';
}

function truncateString(str: string, maxLength: number): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

listAllTables().catch(console.error);
