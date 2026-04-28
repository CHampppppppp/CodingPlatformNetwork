import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import path from 'path';

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

const SCENARIO_ID = 'cmogzmv8f0000vel3eg8xgy3r';
const TEACHER_NAME = '张老师';

async function main() {
  try {
    console.log('🚀 开始创建教师节点和师生关系...\n');

    const scenario = await prisma.learningScenario.findUnique({
      where: { id: SCENARIO_ID },
    });
    if (!scenario) {
      throw new Error(`场景不存在: ${SCENARIO_ID}`);
    }
    console.log(`📋 场景: ${scenario.nameZh}`);

    const students = await prisma.graphNode.findMany({
      where: {
        scenarioId: SCENARIO_ID,
        nodeType: 'Student',
      },
    });
    console.log(`👥 学生数量: ${students.length}`);

    const existingTeacher = await prisma.graphNode.findFirst({
      where: {
        scenarioId: SCENARIO_ID,
        nodeType: 'Teacher',
      },
    });

    let teacherNode;
    if (existingTeacher) {
      teacherNode = existingTeacher;
      console.log(`📋 使用已有教师节点: ${teacherNode.displayName} (${teacherNode.id})`);
    } else {
      teacherNode = await prisma.graphNode.create({
        data: {
          nodeType: 'Teacher',
          displayName: TEACHER_NAME,
          scenarioId: SCENARIO_ID,
        },
      });
      console.log(`✅ 创建教师节点: ${teacherNode.displayName} (${teacherNode.id})`);

      await prisma.teacherProfile.create({
        data: {
          nodeId: teacherNode.id,
          subject: '信息科技',
          teachingGrade: 8,
          teachingClass: '801802803',
        },
      });
      console.log(`✅ 创建教师属性: 信息科技, 八年级`);
    }

    let school = await prisma.school.findFirst();
    if (!school) {
      school = await prisma.school.create({
        data: { name: '竺可桢学校' },
      });
      console.log(`✅ 创建学校: ${school.name}`);
    }

    let grade = await prisma.grade.findFirst({
      where: { schoolId: school.id, gradeName: 8 },
    });
    if (!grade) {
      grade = await prisma.grade.create({
        data: {
          schoolId: school.id,
          gradeName: 8,
        },
      });
      console.log(`✅ 创建年级: 八年级`);
    }

    let schoolClass = await prisma.schoolClass.findFirst({
      where: { gradeId: grade.id, className: '801802803班' },
    });
    if (!schoolClass) {
      schoolClass = await prisma.schoolClass.create({
        data: {
          gradeId: grade.id,
          className: '801802803班',
        },
      });
      console.log(`✅ 创建班级: 801802803班`);
    }

    const session = await prisma.interactionSession.create({
      data: {
        scenarioId: SCENARIO_ID,
        schoolId: school.id,
        gradeId: grade.id,
        classId: schoolClass.id,
        sessionName: '801802803班 - GAI后测学情画像',
        occurredAt: new Date('2024-12-09'),
      },
    });
    console.log(`✅ 创建交互会话: ${session.sessionName} (${session.id})`);

    const interactions = students.map(student => ({
      interactionType: 'PHYSICAL',
      sessionId: session.id,
      sourceNodeId: teacherNode.id,
      targetNodeId: student.id,
      strength: 1.0,
    }));

    await prisma.interaction.createMany({
      data: interactions,
    });

    console.log(`\n📊 创建统计:`);
    console.log(`  - 教师节点: 1`);
    console.log(`  - 学生节点: ${students.length}`);
    console.log(`  - 物理联系(实线): ${interactions.length}`);
    console.log(`\n✅ 全部完成!`);

  } catch (error) {
    console.error('\n❌ 创建失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
