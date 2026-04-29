import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const dbUrl = process.env.DATABASE_URL || 'mysql://root@localhost:3306/interaction_network_test';
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbUrl) });

// 当前班级图谱中使用的12个知识节点
const NEW_KNOWLEDGE_NODES = [
  { id: 'cmoi8e1wx00009yscehzxw65o', name: '人工智能基础概念' },
  { id: 'cmoi8e24z00019ysczenz1ctz', name: '提示词工程' },
  { id: 'cmoi8e25h00029ysc4w3grlbs', name: '数据可视化' },
  { id: 'cmoi8e25u00039yscjpqe98xi', name: '信息甄别与验证' },
  { id: 'cmoi8e26700049yscqpulmlvw', name: '算法思维' },
  { id: 'cmoi94vf900004tscbbcareve', name: '机器学习基础' },
  { id: 'cmoi94vrc00014tsckc923b75', name: '自然语言处理' },
  { id: 'cmoi94vtq00024tsc1yggaj8w', name: '计算机视觉' },
  { id: 'cmoi94vuh00034tscarcczu95', name: '生成式AI应用' },
  { id: 'cmoi94vuz00044tsc58rnfxlg', name: 'AI伦理与安全' },
  { id: 'cmoi94vvk00054tscr9vf53gn', name: 'Python编程基础' },
  { id: 'cmoi94vw200064tscr6521ax6', name: '深度学习框架' },
];

async function main() {
  console.log('=== 重新建立资源与知识节点关联 ===');
  
  // 1. 获取所有资源
  const allResources = await prisma.resource.findMany({
    select: { id: true, title: true, description: true, resourceType: true }
  });
  console.log(`总资源数: ${allResources.length}`);
  
  // 2. 删除所有旧关联
  const deletedCount = await prisma.resourceKnowledgeRelation.deleteMany({});
  console.log(`已删除旧关联数: ${deletedCount.count}`);
  
  // 3. 为每个资源匹配新知识节点并建立关联
  let matchedCount = 0;
  let unmatchedCount = 0;
  const newRelations = [];
  
  for (const resource of allResources) {
    const matchedNodes = [];
    for (const node of NEW_KNOWLEDGE_NODES) {
      if (resource.title.includes(node.name) || 
          (resource.description && resource.description.includes(node.name))) {
        matchedNodes.push(node);
      }
    }
    
    if (matchedNodes.length > 0) {
      matchedCount++;
      // 如果一个资源匹配多个节点，为每个节点都建立关联
      for (const node of matchedNodes) {
        newRelations.push({
          resourceId: resource.id,
          knowledgeNodeId: node.id,
        });
      }
    } else {
      unmatchedCount++;
    }
  }
  
  console.log(`匹配的资源: ${matchedCount}, 未匹配: ${unmatchedCount}`);
  console.log(`将创建 ${newRelations.length} 条新关联`);
  
  // 4. 批量创建新关联
  if (newRelations.length > 0) {
    // 使用 createMany 批量插入
    const result = await prisma.resourceKnowledgeRelation.createMany({
      data: newRelations,
      skipDuplicates: true,
    });
    console.log(`成功创建 ${result.count} 条关联`);
  }
  
  // 5. 验证结果
  const verification = await prisma.resourceKnowledgeRelation.groupBy({
    by: ['knowledgeNodeId'],
    _count: { knowledgeNodeId: true }
  });
  
  console.log('\n=== 关联验证 ===');
  for (const v of verification) {
    const node = NEW_KNOWLEDGE_NODES.find(n => n.id === v.knowledgeNodeId);
    console.log(`  ${node?.name || v.knowledgeNodeId}: ${v._count.knowledgeNodeId} 个资源`);
  }
  
  // 6. 删除未匹配的资源（可选）
  const unmatchedResources = allResources.filter(r => {
    return !NEW_KNOWLEDGE_NODES.some(n => 
      r.title.includes(n.name) || (r.description && r.description.includes(n.name))
    );
  });
  
  console.log(`\n未匹配资源数: ${unmatchedResources.length}`);
  if (unmatchedResources.length > 0) {
    console.log('未匹配资源示例:');
    for (const r of unmatchedResources.slice(0, 5)) {
      console.log(`  - ${r.title}`);
    }
    console.log('\n提示: 这些资源与当前班级知识节点无关，可以考虑删除');
  }
}

main()
  .catch(e => {
    console.error('错误:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
