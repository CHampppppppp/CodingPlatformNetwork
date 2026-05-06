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

const BATCH_SIZE = 1000;

async function main() {
  console.log('开始大规模创建mock学生-知识点关联...\n');

  const scenarios = await prisma.learningScenario.findMany({
    select: { id: true, code: true, nameZh: true },
  });

  for (const scenario of scenarios) {
    console.log(`\n处理场景: ${scenario.nameZh} (${scenario.id})`);

    const knowledgeNodes = await prisma.graphNode.findMany({
      where: {
        nodeType: 'Knowledge',
        scenarioId: scenario.id,
      },
      select: { id: true },
    });

    if (knowledgeNodes.length === 0) {
      console.log('  无知识点，跳过');
      continue;
    }

    console.log(`  知识点: ${knowledgeNodes.length} 个`);

    const students = await prisma.graphNode.findMany({
      where: {
        nodeType: 'Student',
        scenarioId: scenario.id,
      },
      select: {
        id: true,
        gradeId: true,
        classId: true,
        schoolId: true,
      },
    });

    console.log(`  学生: ${students.length} 人`);

    if (students.length === 0) {
      continue;
    }

    const classMap = new Map<string, typeof students>();
    for (const student of students) {
      const key = `${student.gradeId || 'no-grade'}_${student.classId || 'no-class'}`;
      if (!classMap.has(key)) {
        classMap.set(key, []);
      }
      classMap.get(key)!.push(student);
    }

    console.log(`  班级: ${classMap.size} 个`);

    let totalRelations = 0;
    let totalInteractions = 0;

    for (const [classKey, classStudents] of classMap) {
      const [gradeId, classId] = classKey.split('_');
      const firstStudent = classStudents[0];

      const knowledgeCount = Math.floor(Math.random() * 4) + 3;
      const shuffled = [...knowledgeNodes].sort(() => 0.5 - Math.random());
      const selectedKnowledge = shuffled.slice(0, knowledgeCount);

      const session = await prisma.interactionSession.upsert({
        where: { id: `session_${scenario.id}_${classKey}` },
        update: {},
        create: {
          id: `session_${scenario.id}_${classKey}`,
          scenarioId: scenario.id,
          schoolId: firstStudent.schoolId || '',
          gradeId: gradeId !== 'no-grade' ? gradeId : null,
          classId: classId !== 'no-class' ? classId : null,
          sessionName: `Mock-${scenario.code}-${classKey}`,
          occurredAt: new Date(),
        },
      });

      const relationsToCreate: Array<{ studentNodeId: string; knowledgeNodeId: string }> = [];
      const interactionsToCreate: Array<{
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

          relationsToCreate.push({
            studentNodeId: student.id,
            knowledgeNodeId: knowledge.id,
          });

          interactionsToCreate.push({
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

      for (let i = 0; i < relationsToCreate.length; i += BATCH_SIZE) {
        const batch = relationsToCreate.slice(i, i + BATCH_SIZE);
        try {
          await prisma.studentKnowledgeRelation.createMany({
            data: batch,
            skipDuplicates: true,
          });
          totalRelations += batch.length;
        } catch (e) {
          console.log(`  关联批次失败: ${e}`);
        }
      }

      for (let i = 0; i < interactionsToCreate.length; i += BATCH_SIZE) {
        const batch = interactionsToCreate.slice(i, i + BATCH_SIZE);
        try {
          await prisma.interaction.createMany({
            data: batch,
            skipDuplicates: true,
          });
          totalInteractions += batch.length;
        } catch (e) {
          console.log(`  交互批次失败: ${e}`);
        }
      }

      console.log(
        `    ${classKey}: ${classStudents.length}人 x ${knowledgeCount}知识点 = ${interactionsToCreate.length}条交互`,
      );
    }

    console.log(`  场景总计: ${totalRelations}关联, ${totalInteractions}交互`);
  }

  console.log('\n全部完成!');
}

main()
  .catch((error) => {
    console.error('\n失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
