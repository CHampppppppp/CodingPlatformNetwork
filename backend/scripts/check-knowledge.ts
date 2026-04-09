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

async function checkKnowledgeData() {
  console.log('=== 数据库知识点数据检查 ===\n');

  const knowledgeNodes = await prisma.graphNode.findMany({
    where: { nodeType: 'Knowledge' },
    include: { knowledgeProfile: true }
  });

  console.log(`📊 知识点节点总数: ${knowledgeNodes.length}`);

  if (knowledgeNodes.length === 0) {
    console.log('\n⚠️  警告：数据库中没有知识点数据！');
    console.log('这可能是知识点不显示的根本原因。');
  } else {
    console.log('\n📋 知识点列表:');
    knowledgeNodes.forEach((node, idx) => {
      console.log(`  ${idx + 1}. ${node.displayName}`);
      console.log(`     ID: ${node.id}`);
      console.log(`     场景ID: ${node.scenarioId}`);
      console.log(`     内容: ${node.knowledgeProfile?.content || 'N/A'}`);
      console.log(`     分类: ${node.knowledgeProfile?.category || 'N/A'}`);
      console.log('');
    });
  }

  const scenarios = await prisma.learningScenario.findMany();
  console.log(`\n📚 学习场景总数: ${scenarios.length}`);
  scenarios.forEach(s => {
    console.log(`  - ${s.nameZh} (code: ${s.code}, id: ${s.id})`);
  });

  const stats = await prisma.graphNode.groupBy({
    by: ['nodeType'],
    _count: { id: true }
  });
  console.log('\n📈 节点类型统计:');
  stats.forEach(s => {
    console.log(`  - ${s.nodeType}: ${s._count.id} 个`);
  });

  await prisma.$disconnect();
}

checkKnowledgeData().catch(console.error);
