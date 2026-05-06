#!/usr/bin/env ts-node
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set in ' + envPath);
}

let prisma: PrismaClient;
if (databaseUrl.startsWith('sqlserver://')) {
  const adapter = new PrismaMssql(databaseUrl);
  prisma = new PrismaClient({ adapter });
} else {
  const adapter = new PrismaMariaDb(databaseUrl);
  prisma = new PrismaClient({ adapter });
}

const BATCH_SIZE = 5000;

async function main() {
  console.log('开始为所有学生创建知识点关联...\n');

  const knowledgeNodes = await prisma.graphNode.findMany({
    where: { nodeType: 'Knowledge' },
    select: { id: true, displayName: true },
  });

  console.log(`可用知识点: ${knowledgeNodes.length} 个`);

  const students = await prisma.graphNode.findMany({
    where: { nodeType: 'Student' },
    select: {
      id: true,
      scenarioId: true,
      gradeId: true,
      classId: true,
      schoolId: true,
    },
  });

  console.log(`学生总数: ${students.length} 人\n`);

  if (students.length === 0 || knowledgeNodes.length === 0) {
    console.log('无学生或知识点，退出');
    return;
  }

  const classMap = new Map<string, typeof students>();
  for (const student of students) {
    const key = `${student.scenarioId}_${student.gradeId || 'no-grade'}_${student.classId || 'no-class'}`;
    if (!classMap.has(key)) {
      classMap.set(key, []);
    }
    classMap.get(key)!.push(student);
  }

  console.log(`班级总数: ${classMap.size} 个\n`);

  let totalRelations = 0;
  let totalInteractions = 0;
  let processedClasses = 0;

  for (const [classKey, classStudents] of classMap) {
    const [scenarioId, gradeId, classId] = classKey.split('_');
    const firstStudent = classStudents[0];

    const knowledgeCount = Math.floor(Math.random() * 4) + 3;
    const shuffled = [...knowledgeNodes].sort(() => 0.5 - Math.random());
    const selectedKnowledge = shuffled.slice(0, Math.min(knowledgeCount, knowledgeNodes.length));

    const session = await prisma.interactionSession.upsert({
      where: { id: `mock_session_${classKey}` },
      update: {},
      create: {
        id: `mock_session_${classKey}`,
        scenarioId: scenarioId,
        schoolId: firstStudent.schoolId || '',
        gradeId: gradeId !== 'no-grade' ? gradeId : null,
        classId: classId !== 'no-class' ? classId : null,
        sessionName: `Mock-${classKey}`,
        occurredAt: new Date(),
      },
    });

    const relationsData: Array<{ studentNodeId: string; knowledgeNodeId: string }> = [];
    const interactionsData: Array<{
      sessionId: string;
      sourceNodeId: string;
      targetNodeId: string;
      interactionType: string;
      strength: Prisma.Decimal;
      actionType: string;
      relationSourceId: string;
    }> = [];

    for (const student of classStudents) {
      for (const knowledge of selectedKnowledge) {
        const relationId = `rel_${student.id}_${knowledge.id}`;

        relationsData.push({
          studentNodeId: student.id,
          knowledgeNodeId: knowledge.id,
        });

        interactionsData.push({
          sessionId: session.id,
          sourceNodeId: student.id,
          targetNodeId: knowledge.id,
          interactionType: 'PLATFORM',
          strength: new Prisma.Decimal(1.0),
          actionType: 'STUDY',
          relationSourceId: relationId,
        });
      }
    }

    for (let i = 0; i < relationsData.length; i += BATCH_SIZE) {
      const batch = relationsData.slice(i, i + BATCH_SIZE);
      const result = await prisma.studentKnowledgeRelation.createMany({
        data: batch,
        skipDuplicates: true,
      });
      totalRelations += result.count;
    }

    const studentIds = classStudents.map((s) => s.id);
    const knowledgeIds = selectedKnowledge.map((k) => k.id);

    const createdRelations = await prisma.studentKnowledgeRelation.findMany({
      where: {
        studentNodeId: { in: studentIds },
        knowledgeNodeId: { in: knowledgeIds },
      },
      select: { id: true, studentNodeId: true, knowledgeNodeId: true },
    });

    const relationIdMap = new Map<string, string>();
    for (const rel of createdRelations) {
      relationIdMap.set(`${rel.studentNodeId}_${rel.knowledgeNodeId}`, rel.id);
    }

    const validInteractions = [];
    for (const interaction of interactionsData) {
      const realRelationId = relationIdMap.get(
        `${interaction.sourceNodeId}_${interaction.targetNodeId}`,
      );
      if (realRelationId) {
        validInteractions.push({
          ...interaction,
          relationSourceId: realRelationId,
        });
      }
    }

    for (let i = 0; i < validInteractions.length; i += BATCH_SIZE) {
      const batch = validInteractions.slice(i, i + BATCH_SIZE);
      const result = await prisma.interaction.createMany({
        data: batch,
        skipDuplicates: true,
      });
      totalInteractions += result.count;
    }

    processedClasses++;
    if (processedClasses % 100 === 0) {
      console.log(`  已处理 ${processedClasses}/${classMap.size} 个班级...`);
    }
  }

  console.log('\n创建完成!');
  console.log(`  班级数: ${classMap.size}`);
  console.log(`  新创建关联: ${totalRelations}`);
  console.log(`  新创建交互: ${totalInteractions}`);
}

main()
  .catch((error) => {
    console.error('\n失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
