import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl)
});

async function main() {
  const scenario = await prisma.learningScenario.findUnique({
    where: { code: 'INFORMAL_LEARNING' }
  });
  if (!scenario) {
    console.log('场景 INFORMAL_LEARNING 不存在');
    await prisma.$disconnect();
    return;
  }
  
  console.log(`场景 ID: ${scenario.id}`);
  
  const studentNodes = await prisma.graphNode.findMany({
    where: {
      scenarioId: scenario.id,
      nodeType: 'Student'
    },
    select: { id: true }
  });
  const studentNodeIds = studentNodes.map(n => n.id);
  console.log(`学生节点数: ${studentNodeIds.length}`);
  
  if (studentNodeIds.length === 0) {
    console.log('无数据需要清理');
    await prisma.$disconnect();
    return;
  }
  
  console.log('\n开始清理...');
  
  const tables = [
    { name: 'StudentResourceRate', where: { studentId: { in: studentNodeIds } } },
    { name: 'StudentCognitiveDimensionScore', where: { profile: { studentNodeId: { in: studentNodeIds } } } },
    { name: 'StudentCognitiveProfile', where: { studentNodeId: { in: studentNodeIds } } },
    { name: 'StudentWork', where: { studentNodeId: { in: studentNodeIds } } },
    { name: 'StudentSurveyResponse', where: { studentNodeId: { in: studentNodeIds } } },
    { name: 'StudentProfile', where: { nodeId: { in: studentNodeIds } } },
    { name: 'GraphNode', where: { id: { in: studentNodeIds } } },
  ];
  
  for (const t of tables) {
    try {
      const result = await (prisma as any)[t.name].deleteMany({ where: t.where });
      console.log(`  ${t.name}: 删除 ${result.count} 条`);
    } catch (e: any) {
      console.log(`  ${t.name}: 失败 - ${e.message}`);
    }
  }
  
  console.log('\n清理完成');
  await prisma.$disconnect();
}

main().catch(console.error);
