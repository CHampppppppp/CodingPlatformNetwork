import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

let prisma: PrismaClient;
if (databaseUrl.startsWith('sqlserver://')) {
  const adapter = new PrismaMssql(databaseUrl);
  prisma = new PrismaClient({ adapter });
} else {
  const adapter = new PrismaMariaDb(databaseUrl);
  prisma = new PrismaClient({ adapter });
}

const BATCH_SIZE = 500;

async function main() {
  console.log('开始从 student_works_test 构建交互关系...\n');

  const allWorks = await prisma.studentWork.findMany({
    select: {
      id: true,
      studentNodeId: true,
      sessionId: true,
      likeDetails: true,
      commentDetails: true,
      teacherId: true,
      teacherComment: true,
    },
  });

  const studentNodes = await prisma.graphNode.findMany({
    select: { id: true, displayName: true, classId: true, scenarioId: true },
  });

  const sessions = await prisma.interactionSession.findMany({
    select: { id: true, classId: true, scenarioId: true },
  });

  const classSessionMap = new Map<string, string>();
  for (const session of sessions) {
    if (session.classId && session.scenarioId) {
      const key = `${session.scenarioId}_${session.classId}`;
      classSessionMap.set(key, session.id);
    }
  }

  console.log(`查询到 ${allWorks.length} 条作品记录`);

  const nameToIdMap = new Map<string, string>();
  const validNodeIds = new Set<string>();
  const nodeMap = new Map<string, { classId?: string; scenarioId?: string }>();

  for (const node of studentNodes) {
    validNodeIds.add(node.id);
    nodeMap.set(node.id, { classId: node.classId || undefined, scenarioId: node.scenarioId || undefined });
    if (node.displayName) {
      nameToIdMap.set(node.displayName.trim(), node.id);
    }
  }

  console.log(`构建姓名映射: ${nameToIdMap.size} 名学生`);
  console.log(`有效节点ID: ${validNodeIds.size} 个`);
  console.log(`Session映射: ${classSessionMap.size} 个`);

  const interactions: InteractionRecord[] = [];
  const seen = new Set<string>();

  for (const work of allWorks) {
    const authorId = work.studentNodeId;
    let sessionId = work.sessionId;

    if (!sessionId) {
      const authorNode = nodeMap.get(authorId);
      if (authorNode?.classId && authorNode?.scenarioId) {
        const key = `${authorNode.scenarioId}_${authorNode.classId}`;
        sessionId = classSessionMap.get(key);
      }
    }

    if (!sessionId) continue;

    if (work.likeDetails) {
      const likerIds = work.likeDetails.split(';').map(s => s.trim()).filter(Boolean);
      for (const likerId of likerIds) {
        if (likerId === authorId) continue;
        if (!validNodeIds.has(likerId)) continue;

        const key = `${sessionId}_${likerId}_${authorId}_PLATFORM_LIKE`;
        if (seen.has(key)) continue;
        seen.add(key);

        interactions.push({
          sessionId,
          sourceNodeId: likerId,
          targetNodeId: authorId,
          interactionType: 'PLATFORM',
          actionType: 'LIKE',
          strength: 1.5,
        });
      }
    }

    if (work.commentDetails) {
      const comments = work.commentDetails.split('|').map(s => s.trim()).filter(Boolean);
      for (const comment of comments) {
        const colonIdx = comment.indexOf(':');
        if (colonIdx <= 0) continue;

        const commenterName = comment.substring(0, colonIdx).trim();
        const commenterNodeId = nameToIdMap.get(commenterName);

        if (!commenterNodeId || commenterNodeId === authorId) continue;

        const key = `${sessionId}_${commenterNodeId}_${authorId}_PLATFORM_COMMENT`;
        if (seen.has(key)) continue;
        seen.add(key);

        interactions.push({
          sessionId,
          sourceNodeId: commenterNodeId,
          targetNodeId: authorId,
          interactionType: 'PLATFORM',
          actionType: 'COMMENT',
          strength: 2.5,
        });
      }
    }

    if (work.teacherId && work.teacherComment) {
      const key = `${sessionId}_${work.teacherId}_${authorId}_PLATFORM_TEACHER_COMMENT`;
      if (!seen.has(key)) {
        seen.add(key);
        interactions.push({
          sessionId,
          sourceNodeId: work.teacherId,
          targetNodeId: authorId,
          interactionType: 'PLATFORM',
          actionType: 'COMMENT',
          strength: 3.0,
        });
      }
    }
  }

  console.log(`\n生成 ${interactions.length} 条交互记录:`);
  console.log(`  - LIKE: ${interactions.filter(i => i.actionType === 'LIKE').length}`);
  console.log(`  - COMMENT: ${interactions.filter(i => i.actionType === 'COMMENT').length}`);

  if (interactions.length === 0) {
    console.log('没有需要插入的交互记录');
    await prisma.$disconnect();
    return;
  }

  console.log('\n开始插入数据...');

  let inserted = 0;
  for (let i = 0; i < interactions.length; i += BATCH_SIZE) {
    const batch = interactions.slice(i, i + BATCH_SIZE);

    await prisma.interaction.createMany({
      data: batch as any,
      skipDuplicates: true,
    });

    inserted += batch.length;
    console.log(`  已插入 ${inserted}/${interactions.length}`);
  }

  console.log(`\n完成！共插入 ${inserted} 条交互记录`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
