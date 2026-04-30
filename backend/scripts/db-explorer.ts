#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
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

async function listAllTables() {

  await showTable('LearningScenario', async () => {
    const data = await prisma.learningScenario.findMany({
      take: 10,
      orderBy: { sortOrder: 'asc' }
    });
    return data.map(s => ({
      id: truncateId(s.id),
      code: s.code,
      nameZh: s.nameZh,
      isActive: s.isActive,
      sortOrder: s.sortOrder
    }));
  }, await prisma.learningScenario.count());

  await showTable('School', async () => {
    const data = await prisma.school.findMany({
      take: 10,
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
  }, await prisma.school.count());

  await showTable('Grade', async () => {
    const data = await prisma.grade.findMany({
      take: 10,
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
  }, await prisma.grade.count());

  await showTable('SchoolClass', async () => {
    const data = await prisma.schoolClass.findMany({
      take: 10,
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
  }, await prisma.schoolClass.count());

  await showTable('GraphNode (所有节点)', async () => {
    const data = await prisma.graphNode.findMany({
      take: 10,
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
  }, await prisma.graphNode.count());

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
    }));
  }, await prisma.graphNode.count({ where: { nodeType: 'Student' } }));

  await showTable('StudentProfile (学生扩展属性)', async () => {
    const data = await prisma.studentProfile.findMany({
      take: 10,
      include: { node: { select: { displayName: true } } }
    });
    return data.map(sp => ({
      nodeId: truncateId(sp.nodeId),
      name: sp.node.displayName,
      externalUserId: sp.externalUserId || '-',
    }));
  }, await prisma.studentProfile.count());

  await showTable('GraphNode - Teacher (教师节点)', async () => {
    const data = await prisma.graphNode.findMany({
      where: { nodeType: 'Teacher' },
      take: 10,
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
  }, await prisma.graphNode.count({ where: { nodeType: 'Teacher' } }));

  await showTable('TeacherProfile (教师扩展属性)', async () => {
    const data = await prisma.teacherProfile.findMany({
      take: 10,
      include: { node: { select: { displayName: true } } }
    });
    return data.map(tp => ({
      nodeId: truncateId(tp.nodeId),
      name: tp.node.displayName,
      subject: tp.subject || '-',
      teachingGrade: tp.teachingGrade?.toString() || '-',
      teachingClass: tp.teachingClass || '-'
    }));
  }, await prisma.teacherProfile.count());

  await showTable('GraphNode - Knowledge (知识点节点)', async () => {
    const data = await prisma.graphNode.findMany({
      where: { nodeType: 'Knowledge' },
      take: 10,
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
  }, await prisma.graphNode.count({ where: { nodeType: 'Knowledge' } }));

  await showTable('KnowledgeProfile (知识点扩展属性)', async () => {
    const data = await prisma.knowledgeProfile.findMany({
      take: 10,
      include: { node: { select: { displayName: true } } }
    });
    return data.map(kp => ({
      nodeId: truncateId(kp.nodeId),
      name: kp.node.displayName,
      category: kp.category || '-',
      knowledgeType: kp.knowledgeType || '-',
      content: truncateString(kp.content || '-', 30)
    }));
  }, await prisma.knowledgeProfile.count());

  await showTable('Resource (资源)', async () => {
    const data = await prisma.resource.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' }
    });
    return data.map(r => ({
      id: truncateId(r.id),
      title: truncateString(r.title, 20),
      resourceType: r.resourceType,
      url: truncateString(r.url || '-', 25)
    }));
  }, await prisma.resource.count());

  await showTable('ResourceKnowledgeRelation (资源-知识点关联)', async () => {
    const data = await prisma.resourceKnowledgeRelation.findMany({
      take: 10,
      include: {
        resource: { select: { title: true } },
        knowledgeNode: { select: { displayName: true } }
      }
    });
    return data.map(rk => ({
      id: truncateId(rk.id),
      resource: truncateString(rk.resource.title, 20),
      knowledge: truncateString(rk.knowledgeNode.displayName, 20)
    }));
  }, await prisma.resourceKnowledgeRelation.count());

  await showTable('StudentResourceRate (学生资源评分)', async () => {
    const data = await prisma.studentResourceRate.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        resource: { select: { title: true } }
      }
    });
    return data.map(sr => ({
      id: truncateId(sr.id),
      studentId: truncateString(sr.studentId, 12),
      resource: truncateString(sr.resource.title, 20),
      rate: sr.rate.toString()
    }));
  }, await prisma.studentResourceRate.count());

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
  }, await prisma.interactionSession.count());

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
  }, await prisma.interaction.count());

  await showTable('Student-Knowledge Interaction (学生-知识点交互)', async () => {
    const data = await prisma.interaction.findMany({
      where: {
        sourceNode: { nodeType: 'Student' },
        targetNode: { nodeType: 'Knowledge' }
      },
      take: 30,
      include: {
        sourceNode: { select: { displayName: true, nodeType: true } },
        targetNode: { select: { displayName: true, nodeType: true } },
        session: { include: { scenario: { select: { nameZh: true } } } }
      }
    });
    return data.map(i => ({
      student: truncateString(i.sourceNode.displayName, 10),
      arrow: '→',
      knowledge: truncateString(i.targetNode.displayName, 12),
      actionType: i.actionType || '-',
      interactionType: i.interactionType,
      strength: i.strength.toString(),
      scenario: i.session.scenario.nameZh
    }));
  }, await prisma.interaction.count({
    where: {
      sourceNode: { nodeType: 'Student' },
      targetNode: { nodeType: 'Knowledge' }
    }
  }));

  await showTable('CognitiveDimensionDef (认知维度定义)', async () => {
    const data = await prisma.cognitiveDimensionDef.findMany({
      where: { isActive: true },
      take: 10,
      orderBy: { sortOrder: 'asc' }
    });
    return data.map(d => ({
      code: d.dimensionCode,
      name: d.dimensionNameZh,
      category: d.category,
      scoreRange: `${d.minScore}-${d.maxScore}`,
      order: d.sortOrder
    }));
  }, await prisma.cognitiveDimensionDef.count({ where: { isActive: true } }));

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
  }, await prisma.studentCognitiveProfile.count());

  await showTable('StudentCognitiveDimensionScore (认知维度得分)', async () => {
    const data = await prisma.studentCognitiveDimensionScore.findMany({
      take: 10,
      include: {
        dimensionDef: { select: { dimensionNameZh: true } },
        profile: { include: { studentNode: { select: { displayName: true } } } }
      }
    });
    return data.map(ds => ({
      id: truncateId(ds.id),
      student: ds.profile.studentNode.displayName,
      dimension: ds.dimensionDef.dimensionNameZh,
      score: ds.scoreValue.toString(),
      level: ds.scoreLevel
    }));
  }, await prisma.studentCognitiveDimensionScore.count());

  await showTable('StudentSurveyResponse (学生问卷响应)', async () => {
    const data = await prisma.studentSurveyResponse.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' }
    });
    return data.map(sr => ({
      id: truncateId(sr.id),
      studentNodeId: truncateId(sr.studentNodeId),
      scenarioId: truncateId(sr.scenarioId),
      totalScore: sr.totalScore?.toString() || '-',
      motivation: sr.motivationScore?.toString() || '-',
      attitude: sr.attitudeScore?.toString() || '-'
    }));
  }, await prisma.studentSurveyResponse.count());

  await listAllDbTables();

  await prisma.$disconnect();
}

async function showTable(tableName: string, fetchData: () => Promise<any[]>, totalCount?: number) {
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

    const displayTotal = totalCount ?? data.length;
    console.log(`   共 ${displayTotal} 条记录`);
    
  } catch (error) {
    console.log(`   ❌ 查询失败: ${error}`);
  }
}

async function listAllDbTables() {
  console.log(`\n${'─'.repeat(84)}`);
  console.log('📋 数据库中的所有表');
  console.log(`${'─'.repeat(84)}`);

  const databaseUrl = process.env.DATABASE_URL || '';
  const isMySQL = !databaseUrl.startsWith('sqlserver://');

  let tables: { TABLE_NAME: string }[];
  if (isMySQL) {
    tables = await prisma.$queryRaw<{ TABLE_NAME: string }[]>`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME
    `;
  } else {
    tables = await prisma.$queryRaw<{ TABLE_NAME: string }[]>`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME
    `;
  }

  const tableInfos: { name: string; count: number | string }[] = [];
  for (const { TABLE_NAME } of tables) {
    try {
      const countQuery = isMySQL
        ? `SELECT COUNT(*) as count FROM \`${TABLE_NAME}\``
        : `SELECT COUNT(*) as count FROM [${TABLE_NAME}]`;
      const countResult = await prisma.$queryRawUnsafe<{ count: number }[]>(countQuery);
      const count = Number(countResult[0]?.count || 0);
      tableInfos.push({ name: TABLE_NAME, count });
    } catch (error) {
      tableInfos.push({ name: TABLE_NAME, count: 'N/A' });
    }
  }

  const maxNameLength = Math.max(...tableInfos.map(t => t.name.length));
  tableInfos.forEach(t => {
    const padding = ' '.repeat(maxNameLength - t.name.length + 2);
    console.log(`  ${t.name}${padding}${t.count} 条记录`);
  });
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
