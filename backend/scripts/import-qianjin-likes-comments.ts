import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const CSV_PATH = path.resolve(__dirname, '../datas/script_filterd/前进小学学生.csv');

interface WorkInteraction {
  authorNodeId: string;
  authorName: string;
  likerNodeId: string;
  likerName: string;
  interactionType: 'LIKE' | 'COMMENT';
  strength: number;
  content?: string;
  timestamp: string;
}

function parseSemicolonList(value: string): string[] {
  if (!value || value.trim() === '') return [];
  return value.split(';').map(v => v.trim()).filter(Boolean);
}

async function main() {
  console.log('=== 开始导入前进小学学生作品点赞/评论关系 ===');

  const csvContent = fs.readFileSync(CSV_PATH, { encoding: 'utf-8' });
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    encoding: 'utf-8',
    bom: true,
  });

  const school = await prisma.school.findUnique({
    where: { name: '杭州市钱塘区前进小学' },
  });

  if (!school) {
    throw new Error('前进小学不存在');
  }

  const session = await prisma.interactionSession.findFirst({
    where: { schoolId: school.id },
  });

  if (!session) {
    throw new Error('未找到交互会话');
  }

  const studentNodes = await prisma.graphNode.findMany({
    where: { nodeType: 'Student', schoolId: school.id },
    include: { studentProfile: true },
  });

  const userIdToNodeId = new Map<string, string>();
  const nameToNodeId = new Map<string, string>();
  for (const node of studentNodes) {
    if (node.studentProfile?.externalUserId) {
      userIdToNodeId.set(node.studentProfile.externalUserId, node.id);
    }
    nameToNodeId.set(node.displayName, node.id);
  }

  console.log(`找到 ${studentNodes.length} 名学生节点`);

  const interactions: WorkInteraction[] = [];

  for (const row of records) {
    const authorUserId = row['user_id']?.trim();
    const authorName = row['姓名']?.trim();
    const authorNodeId = userIdToNodeId.get(authorUserId) || nameToNodeId.get(authorName);

    if (!authorNodeId) {
      console.log(`跳过：找不到作者节点 ${authorName} (${authorUserId})`);
      continue;
    }

    const likerIds = parseSemicolonList(row['点赞学生ID列表']);
    const likerNames = parseSemicolonList(row['点赞学生姓名列表']);
    const likeTimes = parseSemicolonList(row['点赞时间列表']);
    const commentContents = parseSemicolonList(row['评论内容列表']);

    for (let i = 0; i < likerIds.length; i++) {
      const likerUserId = likerIds[i];
      const likerName = likerNames[i] || likerUserId;
      const likerNodeId = userIdToNodeId.get(likerUserId) || nameToNodeId.get(likerName);

      if (!likerNodeId) {
        console.log(`  跳过点赞人：找不到节点 ${likerName} (${likerUserId})`);
        continue;
      }

      if (likerNodeId === authorNodeId) {
        continue;
      }

      interactions.push({
        authorNodeId,
        authorName,
        likerNodeId,
        likerName,
        interactionType: 'LIKE',
        strength: 1.5,
        timestamp: likeTimes[i] ? new Date(likeTimes[i]).toISOString() : new Date().toISOString(),
      });
    }

    if (commentContents.length > 0) {
      for (let i = 0; i < commentContents.length; i++) {
        const commentContent = commentContents[i];
        if (!commentContent || commentContent === '、') continue;

        let commenterNodeId: string | undefined;
        let commenterName = '';

        if (i < likerIds.length) {
          const uid = likerIds[i];
          const name = likerNames[i] || uid;
          commenterNodeId = userIdToNodeId.get(uid) || nameToNodeId.get(name);
          commenterName = name;
        }

        if (!commenterNodeId && likerIds.length > 0) {
          const idx = i % likerIds.length;
          const uid = likerIds[idx];
          const name = likerNames[idx] || uid;
          commenterNodeId = userIdToNodeId.get(uid) || nameToNodeId.get(name);
          commenterName = name;
        }

        if (!commenterNodeId || commenterNodeId === authorNodeId) {
          continue;
        }

        interactions.push({
          authorNodeId,
          authorName,
          likerNodeId: commenterNodeId,
          likerName: commenterName,
          interactionType: 'COMMENT',
          strength: 2.5,
          content: commentContent,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  console.log(`解析到 ${interactions.length} 条点赞/评论关系`);

  const seen = new Set<string>();
  const uniqueInteractions: WorkInteraction[] = [];
  for (const item of interactions) {
    const key = `${item.likerNodeId}_${item.authorNodeId}_${item.interactionType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueInteractions.push(item);
  }

  console.log(`去重后 ${uniqueInteractions.length} 条`);

  const existing = await prisma.interaction.deleteMany({
    where: {
      sessionId: session.id,
      sourceNode: { nodeType: 'Student' },
      targetNode: { nodeType: 'Student' },
      interactionType: 'PLATFORM',
      actionType: { in: ['LIKE', 'COMMENT'] },
    },
  });
  console.log(`已删除现有学生-学生 LIKE/COMMENT 记录: ${existing.count} 条`);

  const batchSize = 50;
  for (let i = 0; i < uniqueInteractions.length; i += batchSize) {
    const batch = uniqueInteractions.slice(i, i + batchSize);
    await prisma.interaction.createMany({
      data: batch.map(item => ({
        sessionId: session.id,
        sourceNodeId: item.likerNodeId,
        targetNodeId: item.authorNodeId,
        interactionType: 'PLATFORM',
        actionType: item.interactionType,
        strength: item.strength,
      })),
    });
  }

  console.log(`成功写入 ${uniqueInteractions.length} 条交互记录到数据库`);
  console.log('  - 点赞:', uniqueInteractions.filter(i => i.interactionType === 'LIKE').length);
  console.log('  - 评论:', uniqueInteractions.filter(i => i.interactionType === 'COMMENT').length);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
