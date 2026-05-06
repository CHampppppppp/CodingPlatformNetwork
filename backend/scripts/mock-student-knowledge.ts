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

async function main() {
  console.log('开始创建mock学生-知识点关联...\n');

  const scenario = await prisma.learningScenario.findFirst({
    where: { code: 'SHOW_CASE' },
  });

  if (!scenario) {
    throw new Error('SHOW_CASE场景不存在');
  }

  console.log(`使用场景: ${scenario.nameZh} (${scenario.id})\n`);

  const knowledgeNodes = await prisma.graphNode.findMany({
    where: {
      nodeType: 'Knowledge',
      scenarioId: scenario.id,
    },
    select: { id: true, displayName: true },
  });

  console.log(`可用知识点: ${knowledgeNodes.length} 个`);

  const students = await prisma.graphNode.findMany({
    where: {
      nodeType: 'Student',
      scenarioId: scenario.id,
    },
    select: {
      id: true,
      displayName: true,
      gradeId: true,
      classId: true,
      schoolId: true,
    },
  });

  console.log(`学生总数: ${students.length} 人\n`);

  const classMap = new Map<string, typeof students>();
  for (const student of students) {
    const key = `${student.gradeId}_${student.classId}`;
    if (!classMap.has(key)) {
      classMap.set(key, []);
    }
    classMap.get(key)!.push(student);
  }

  console.log(`班级总数: ${classMap.size} 个\n`);

  let createdRelations = 0;
  let existingRelations = 0;
  let createdInteractions = 0;
  let skippedInteractions = 0;

  for (const [classKey, classStudents] of classMap) {
    const [gradeId, classId] = classKey.split('_');
    const firstStudent = classStudents[0];

    const knowledgeCount = Math.floor(Math.random() * 4) + 3;
    const shuffled = [...knowledgeNodes].sort(() => 0.5 - Math.random());
    const selectedKnowledge = shuffled.slice(0, knowledgeCount);

    console.log(
      `班级 ${classKey}: ${classStudents.length}人, 分配 ${knowledgeCount} 个知识点`,
    );

    const session = await prisma.interactionSession.upsert({
      where: {
        id: `session_${classKey}`,
      },
      update: {},
      create: {
        id: `session_${classKey}`,
        scenarioId: scenario.id,
        schoolId: firstStudent.schoolId || '',
        gradeId: gradeId || '',
        classId: classId || null,
        sessionName: `Mock - ${classKey}`,
        occurredAt: new Date(),
      },
    });

    for (const student of classStudents) {
      for (const knowledge of selectedKnowledge) {
        const existingRelation = await prisma.studentKnowledgeRelation.findUnique({
          where: {
            studentNodeId_knowledgeNodeId: {
              studentNodeId: student.id,
              knowledgeNodeId: knowledge.id,
            },
          },
        });

        let relationId: string;

        if (existingRelation) {
          relationId = existingRelation.id;
          existingRelations++;
        } else {
          const relation = await prisma.studentKnowledgeRelation.create({
            data: {
              studentNodeId: student.id,
              knowledgeNodeId: knowledge.id,
            },
          });
          relationId = relation.id;
          createdRelations++;
        }

        try {
          await prisma.interaction.create({
            data: {
              sessionId: session.id,
              sourceNodeId: student.id,
              targetNodeId: knowledge.id,
              interactionType: 'PLATFORM',
              strength: new Prisma.Decimal(1.0),
              actionType: 'STUDY',
              relationSourceId: relationId,
            },
          });
          createdInteractions++;
        } catch (error: any) {
          if (error?.code === 'P2002') {
            skippedInteractions++;
          } else {
            throw error;
          }
        }
      }
    }
  }

  console.log('\n创建统计:');
  console.log(`  新创建关联: ${createdRelations}`);
  console.log(`  已存在关联: ${existingRelations}`);
  console.log(`  新创建交互: ${createdInteractions}`);
  console.log(`  已存在交互: ${skippedInteractions}`);
  console.log(`  总班级数: ${classMap.size}`);

  console.log('\n完成!');
}

main()
  .catch((error) => {
    console.error('\n失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
