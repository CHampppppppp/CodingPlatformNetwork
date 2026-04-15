import { GraphService } from './src/modules/graph/graph.service';
import { PrismaService } from './src/shared/utils/prisma.service';

const prisma = new PrismaService();
const service = new GraphService(prisma);

(async () => {
  const school = await prisma.school.findFirst({ select: { id: true } });
  const grade = await prisma.grade.findFirst({ select: { id: true } });
  const schoolClass = await prisma.schoolClass.findFirst({ select: { id: true } });

  const result = await service.getGraphData({
    scenarioCode: 'COLLABORATIVE_LEARNING',
    schoolId: school?.id,
    gradeId: grade?.id,
    classId: schoolClass?.id,
  });

  const nodes = result.data.nodes;
  const links = result.data.links;

  console.log('节点统计:');
  console.log(`  学生: ${nodes.filter((n) => n.type === 'STUDENT').length}`);
  console.log(`  教师: ${nodes.filter((n) => n.type === 'TEACHER').length}`);
  console.log(`  知识点: ${nodes.filter((n) => n.type === 'KNOWLEDGE').length}`);

  console.log('\n连线统计:');
  const studentLinks = links.filter(
    (l) => nodes.find((n) => n.id === l.source)?.type === 'STUDENT' || nodes.find((n) => n.id === l.target)?.type === 'STUDENT'
  );
  console.log(`  涉及学生的连线: ${studentLinks.length}`);

  const lonelyStudents = nodes
    .filter((n) => n.type === 'STUDENT')
    .filter((n) => !links.some((l) => l.source === n.id || l.target === n.id));
  console.log(`\n  无连线学生: ${lonelyStudents.length}`);
  if (lonelyStudents.length > 0) {
    console.log(lonelyStudents.map((s) => `    - ${s.name}`).join('\n'));
  }

  await prisma.$disconnect();
})();
