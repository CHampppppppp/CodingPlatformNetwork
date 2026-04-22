import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const adapter = new PrismaMariaDb('mysql://root@localhost:3306/interaction_network_test');
const prisma = new PrismaClient({ adapter });

async function verifyData() {
  console.log('=== Data Import Verification ===\n');

  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'COLLABORATIVE_LEARNING' }
  });
  console.log('Scenario:', scenario?.nameZh, `(${scenario?.code})`);

  const school = await prisma.school.findUnique({
    where: { name: '杭州市秀水小学' }
  });
  console.log('School:', school?.name);

  const grades = await prisma.grade.findMany({
    where: { schoolId: school?.id },
    include: { _count: { select: { classes: true } } }
  });
  console.log('Grades:', grades.map(g => `${g.gradeName}年级 (${g._count.classes} classes)`).join(', '));

  const classes = await prisma.schoolClass.findMany({
    where: { gradeId: { in: grades.map(g => g.id) } },
    include: { grade: true }
  });
  console.log('Classes:', classes.map(c => `${c.grade.gradeName}年级${c.className}`).join(', '));

  const studentNodes = await prisma.graphNode.findMany({
    where: {
      nodeType: 'Student',
      scenarioId: scenario?.id
    },
    include: {
      studentProfile: true,
      scenario: { select: { nameZh: true } }
    }
  });

  console.log(`\nTotal students imported: ${studentNodes.length}`);
  console.log('\nStudent details:');
  console.log('─'.repeat(100));
  
  studentNodes.forEach((node, index) => {
    const profile = node.studentProfile;
    console.log(
      `${index + 1}. ${node.displayName.padEnd(8)} | ` +
      `ExternalID: ${(profile?.externalUserId || '-').substring(0, 20).padEnd(22)} | ` +
      `Style: ${(profile?.learningStylePreference || '-').padEnd(10)} | ` +
      `Personality: ${(profile?.personality || '-').padEnd(6)} | ` +
      `Group: ${(profile?.groupBehavior || '-').padEnd(12)}`
    );
  });

  const surveyResponses = await prisma.studentSurveyResponse.findMany({
    where: { scenarioId: scenario?.id }
  });

  console.log(`\nTotal survey responses: ${surveyResponses.length}`);

  const studentMap = new Map(studentNodes.map(n => [n.id, n.displayName]));

  console.log('\nSurvey response samples:');
  console.log('─'.repeat(100));
  
  surveyResponses.slice(0, 5).forEach((response, index) => {
    const studentName = studentMap.get(response.studentNodeId) || 'Unknown';
    console.log(
      `${index + 1}. ${studentName.padEnd(8)} | ` +
      `Gender: ${(response.gender || '-').padEnd(4)} | ` +
      `Total Score: ${(response.totalScore?.toString() || '-').padEnd(6)} | ` +
      `AI Content: ${(response.aiContentSatisfaction || '-').padEnd(6)} | ` +
      `Resource: ${(response.resourceHelpfulness || '-').padEnd(6)} | ` +
      `Poster: ${(response.posterSatisfaction || '-').padEnd(6)}`
    );
  });

  if (surveyResponses.length > 5) {
    console.log(`... and ${surveyResponses.length - 5} more`);
  }

  console.log('\n✅ Data import verification complete!');
}

verifyData()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
