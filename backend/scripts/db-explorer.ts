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

async function dbExplorer() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              📊 数据库结构浏览器                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // 1. 学习场景
  console.log('📚 【学习场景】');
  const scenarios = await prisma.learningScenario.findMany();
  scenarios.forEach(s => {
    console.log(`   • ${s.nameZh} (code: ${s.code})`);
  });

  // 2. 组织架构
  console.log('\n🏫 【组织架构】');
  const schools = await prisma.school.findMany({
    include: {
      grades: {
        include: {
          classes: true
        }
      }
    }
  });
  
  for (const school of schools) {
    console.log(`\n   📍 ${school.name}`);
    for (const grade of school.grades) {
      console.log(`      └─ ${grade.gradeName}年级`);
      for (const cls of grade.classes) {
        console.log(`         └─ ${cls.className}`);
      }
    }
  }

  // 3. 节点统计
  console.log('\n📊 【节点统计】');
  const nodeStats = await prisma.graphNode.groupBy({
    by: ['nodeType'],
    _count: { id: true }
  });
  
  const typeEmoji: Record<string, string> = {
    'Student': '👨‍🎓',
    'Teacher': '👨‍🏫', 
    'Knowledge': '📖'
  };
  
  nodeStats.forEach(stat => {
    const emoji = typeEmoji[stat.nodeType] || '❓';
    console.log(`   ${emoji} ${stat.nodeType}: ${stat._count.id} 个`);
  });

  // 4. 交互统计
  console.log('\n🔗 【交互统计】');
  const interactionCount = await prisma.interaction.count();
  const sessionCount = await prisma.interactionSession.count();
  console.log(`   • 交互记录: ${interactionCount} 条`);
  console.log(`   • 交互会话: ${sessionCount} 个`);

  // 5. 最新学生
  console.log('\n👨‍🎓 【最新学生】 (前5名)');
  const students = await prisma.graphNode.findMany({
    where: { nodeType: 'Student' },
    include: { studentProfile: true },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  
  students.forEach(s => {
    console.log(`   • ${s.displayName}`);
  });

  // 6. 知识点列表
  console.log('\n📖 【知识点列表】');
  const knowledge = await prisma.graphNode.findMany({
    where: { nodeType: 'Knowledge' },
    include: { knowledgeProfile: true }
  });
  
  knowledge.forEach(k => {
    const category = k.knowledgeProfile?.category || '未分类';
    console.log(`   • ${k.displayName} [${category}]`);
  });

  // 7. 认知维度
  console.log('\n🧠 【认知维度定义】');
  const dimensions = await prisma.cognitiveDimensionDef.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' }
  });
  
  dimensions.forEach(d => {
    console.log(`   • ${d.dimensionNameZh} (${d.dimensionCode})`);
  });

  console.log('\n═══════════════════════════════════════════════════════════════\n');
  
  await prisma.$disconnect();
}

dbExplorer().catch(console.error);
