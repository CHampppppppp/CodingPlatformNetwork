import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const adapter = new PrismaMariaDb('mysql://root@localhost:3306/interaction_network_test');
const prisma = new PrismaClient({ adapter });

async function verifyInformalData() {
  console.log('=== 社团课等非正式学习数据导入验证 ===\n');

  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'INFORMAL_LEARNING' }
  });

  if (!scenario) {
    console.log('场景不存在');
    return;
  }

  console.log(`场景: ${scenario.nameZh} (${scenario.code})`);

  const informalStudents = await prisma.graphNode.count({
    where: { nodeType: 'Student', scenarioId: scenario.id },
  });
  console.log(`\n学生节点数: ${informalStudents}`);

  const surveyCount = await prisma.studentSurveyResponse.count({
    where: { scenarioId: scenario.id },
  });
  console.log(`问卷响应数: ${surveyCount}`);

  const profileCount = await prisma.studentCognitiveProfile.count();
  console.log(`认知画像数: ${profileCount}`);

  const dimScoreCount = await prisma.studentCognitiveDimensionScore.count();
  console.log(`维度得分数: ${dimScoreCount}`);

  const workCount = await prisma.studentWork.count();
  console.log(`学生作品数: ${workCount}`);

  const rateCount = await prisma.studentResourceRate.count();
  console.log(`资源评分数: ${rateCount}`);

  const schools = await prisma.school.count();
  const grades = await prisma.grade.count();
  const classes = await prisma.schoolClass.count();
  console.log(`\n组织数据: ${schools} 学校, ${grades} 年级, ${classes} 班级`);

  const classGroups = await prisma.graphNode.groupBy({
    by: ['classId'],
    where: { nodeType: 'Student', scenarioId: scenario.id },
    _count: { id: true },
  });
  console.log(`有学生的班级数: ${classGroups.length}`);

  const topClasses = await prisma.graphNode.groupBy({
    by: ['classId'],
    where: { nodeType: 'Student', scenarioId: scenario.id },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });

  console.log('\n学生最多的10个班级:');
  for (const cls of topClasses) {
    if (cls.classId) {
      const classInfo = await prisma.schoolClass.findUnique({
        where: { id: cls.classId },
        include: {
          grade: { include: { school: { select: { name: true } } } },
        },
      });
      console.log(`  - ${classInfo?.grade?.school?.name} ${classInfo?.grade?.gradeName}年级${classInfo?.className}: ${cls._count.id}人`);
    }
  }

  const dimDefs = await prisma.cognitiveDimensionDef.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  console.log('\n各维度平均得分:');
  for (const dim of dimDefs) {
    const avg = await prisma.studentCognitiveDimensionScore.aggregate({
      where: { dimensionCode: dim.dimensionCode },
      _avg: { scoreValue: true },
    });
    console.log(`  - ${dim.dimensionNameZh}: ${avg._avg.scoreValue?.toFixed(2) || 'N/A'}`);
  }

  const avgRating = await prisma.studentResourceRate.aggregate({
    _avg: { rate: true },
  });
  console.log(`\n资源评分平均分: ${avgRating._avg.rate?.toFixed(2) || 'N/A'}`);

  const surveySample = await prisma.studentSurveyResponse.findMany({
    where: { scenarioId: scenario.id },
    take: 5,
  });

  console.log('\n问卷样本:');
  for (const s of surveySample) {
    console.log(`  - 学生: ${s.studentNodeId.substring(0, 8)}... | 总分: ${s.totalScore?.toFixed(2)} | 学习动机: ${s.motivationScore?.toFixed(2)} | AI满意度: ${s.aiContentSatisfaction}`);
  }

  console.log('\n=== 验证完成 ===');
}

verifyInformalData()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
