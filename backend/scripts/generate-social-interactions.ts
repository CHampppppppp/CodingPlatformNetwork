import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

// ============================================================
// 学生作品与社交关系生成脚本
// ============================================================

interface StudentWork {
  workId: string;
  workName: string;
  workType: '网页设计' | '编程作品' | '多媒体' | '创意海报';
  publishedAt: string;
  likeCount: number;
  commentCount: number;
  teacherScore?: number;
  themeName?: string;
}

interface Interaction {
  sourceStudent: string;
  targetStudent: string;
  interactionType: 'LIKE' | 'COMMENT';
  strength: number;
  content?: string;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateWorkName(theme: string): string {
  const prefixes = ['我的', '创意', '精彩', '探索', '未来', '梦想', '科技', '数字'];
  const suffixes = ['之旅', '世界', '空间', '作品', '设计', '编程', '项目', '展示'];
  return `${randomItem(prefixes)}${theme}${randomItem(suffixes)}`;
}

function generateComment(): string {
  const comments = [
    '做得真棒！',
    '设计很有创意',
    '代码写得很规范',
    '界面很美观',
    '功能很完整',
    '值得学习',
    '色彩搭配很好',
    '交互设计不错',
    '这个想法很有新意',
    '完成度很高',
    '继续加油！',
    '很用心的作品',
    '技术实现很扎实',
    '视觉效果很棒',
    '逻辑很清晰',
  ];
  return randomItem(comments);
}

function main() {
  const inputPath = path.resolve(
    '/Users/champ/Documents/CodingPlatformNetwork/backend/datas/4.27/副本293617618_学情画像完整版.csv'
  );
  const outputPath = path.resolve(
    '/Users/champ/Documents/CodingPlatformNetwork/backend/datas/4.27/副本293617618_学情画像与社交关系.csv'
  );

  console.log('📖 读取学情画像CSV...');
  const fileContent = fs.readFileSync(inputPath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  }) as Record<string, string>[];

  const studentNames = records.map(r => r['1、你的姓名：']?.trim()).filter(Boolean);
  console.log(`✅ 读取到 ${records.length} 条学生记录`);
  console.log(`👥 学生名单: ${studentNames.join(', ')}`);

  // ============================================================
  // 1. 为每个学生生成作品
  // ============================================================
  console.log('\n🎨 生成学生作品...');

  const themes = ['网页设计', '编程作品', '多媒体', '创意海报'];
  const studentWorks: Record<string, StudentWork[]> = {};

  for (const name of studentNames) {
    const workCount = randomInt(1, 3); // 每个学生1-3个作品
    const works: StudentWork[] = [];

    for (let i = 0; i < workCount; i++) {
      const theme = randomItem(themes);
      const work: StudentWork = {
        workId: `WORK_${name}_${i + 1}`,
        workName: generateWorkName(theme),
        workType: theme as StudentWork['workType'],
        publishedAt: `2024-12-${randomInt(1, 20)}`,
        likeCount: 0, // 稍后计算
        commentCount: 0, // 稍后计算
        teacherScore: randomInt(75, 100),
        themeName: theme,
      };
      works.push(work);
    }

    studentWorks[name] = works;
  }

  const totalWorks = Object.values(studentWorks).reduce((sum, w) => sum + w.length, 0);
  console.log(`✅ 生成 ${totalWorks} 个作品`);

  // ============================================================
  // 2. 生成学生间的点赞/评论关系
  // ============================================================
  console.log('\n💬 生成社交互动关系...');

  const interactions: Interaction[] = [];

  for (const sourceName of studentNames) {
    for (const targetName of studentNames) {
      if (sourceName === targetName) continue;

      // 40%概率产生互动
      if (Math.random() < 0.4) {
        const interactionCount = randomInt(1, 3);

        for (let i = 0; i < interactionCount; i++) {
          const isLike = Math.random() < 0.6; // 60%点赞, 40%评论
          const interaction: Interaction = {
            sourceStudent: sourceName,
            targetStudent: targetName,
            interactionType: isLike ? 'LIKE' : 'COMMENT',
            strength: isLike ? 1.0 : randomInt(1, 3), // 评论strength 1-3
            content: isLike ? undefined : generateComment(),
          };
          interactions.push(interaction);
        }
      }
    }
  }

  console.log(`✅ 生成 ${interactions.length} 条互动记录`);

  // 统计每个学生的获赞数和评论数
  const likeCounts: Record<string, number> = {};
  const commentCounts: Record<string, number> = {};

  for (const name of studentNames) {
    likeCounts[name] = interactions.filter(
      i => i.targetStudent === name && i.interactionType === 'LIKE'
    ).length;
    commentCounts[name] = interactions.filter(
      i => i.targetStudent === name && i.interactionType === 'COMMENT'
    ).length;
  }

  // 更新作品统计数据
  for (const name of studentNames) {
    const works = studentWorks[name];
    const totalLikes = likeCounts[name] || 0;
    const totalComments = commentCounts[name] || 0;

    // 将互动数分配到各个作品
    works.forEach((work, idx) => {
      if (idx === works.length - 1) {
        work.likeCount = totalLikes;
        work.commentCount = totalComments;
      } else {
        work.likeCount = Math.floor(totalLikes / works.length);
        work.commentCount = Math.floor(totalComments / works.length);
      }
    });
  }

  // ============================================================
  // 3. 将数据添加到CSV记录
  // ============================================================
  console.log('\n📝 添加新字段到CSV...');

  // 作品相关字段
  const maxWorks = Math.max(...Object.values(studentWorks).map(w => w.length));

  for (const record of records) {
    const name = record['1、你的姓名：']?.trim();
    if (!name || !studentWorks[name]) continue;

    const works = studentWorks[name];

    // 添加作品字段
    for (let i = 0; i < maxWorks; i++) {
      const work = works[i];
      const prefix = `[WORK_${i + 1}]`;

      if (work) {
        record[`${prefix}作品ID`] = work.workId;
        record[`${prefix}作品名称`] = work.workName;
        record[`${prefix}作品类型`] = work.workType;
        record[`${prefix}发布时间`] = work.publishedAt;
        record[`${prefix}获赞数`] = String(work.likeCount);
        record[`${prefix}评论数`] = String(work.commentCount);
        record[`${prefix}教师评分`] = String(work.teacherScore);
        record[`${prefix}主题`] = work.themeName || '';
      } else {
        record[`${prefix}作品ID`] = '';
        record[`${prefix}作品名称`] = '';
        record[`${prefix}作品类型`] = '';
        record[`${prefix}发布时间`] = '';
        record[`${prefix}获赞数`] = '0';
        record[`${prefix}评论数`] = '0';
        record[`${prefix}教师评分`] = '';
        record[`${prefix}主题`] = '';
      }
    }

    // 添加互动统计字段
    record['[STATS]收到点赞数'] = String(likeCounts[name] || 0);
    record['[STATS]收到评论数'] = String(commentCounts[name] || 0);
    record['[STATS]总互动数'] = String((likeCounts[name] || 0) + (commentCounts[name] || 0));
    record['[STATS]发出点赞数'] = String(
      interactions.filter(i => i.sourceStudent === name && i.interactionType === 'LIKE').length
    );
    record['[STATS]发出评论数'] = String(
      interactions.filter(i => i.sourceStudent === name && i.interactionType === 'COMMENT').length
    );
  }

  // ============================================================
  // 4. 生成交互关系矩阵（连线数据）
  // ============================================================
  console.log('\n🔗 生成交互关系矩阵...');

  // 为每对学生添加互动标记
  for (const record of records) {
    const sourceName = record['1、你的姓名：']?.trim();
    if (!sourceName) continue;

    for (const targetName of studentNames) {
      if (sourceName === targetName) continue;

      const pairInteractions = interactions.filter(
        i => i.sourceStudent === sourceName && i.targetStudent === targetName
      );

      const prefix = `[INTERACT]${sourceName}_TO_${targetName}`;

      if (pairInteractions.length > 0) {
        const totalStrength = pairInteractions.reduce((sum, i) => sum + i.strength, 0);
        const hasLike = pairInteractions.some(i => i.interactionType === 'LIKE');
        const hasComment = pairInteractions.some(i => i.interactionType === 'COMMENT');
        const comments = pairInteractions
          .filter(i => i.content)
          .map(i => i.content)
          .join(';');

        record[`${prefix}_是否连线`] = '是';
        record[`${prefix}_互动次数`] = String(pairInteractions.length);
        record[`${prefix}_互动强度`] = String(totalStrength.toFixed(2));
        record[`${prefix}_有点赞`] = hasLike ? '是' : '否';
        record[`${prefix}_有评论`] = hasComment ? '是' : '否';
        record[`${prefix}_评论内容`] = comments || '';
      } else {
        record[`${prefix}_是否连线`] = '否';
        record[`${prefix}_互动次数`] = '0';
        record[`${prefix}_互动强度`] = '0';
        record[`${prefix}_有点赞`] = '否';
        record[`${prefix}_有评论`] = '否';
        record[`${prefix}_评论内容`] = '';
      }
    }
  }

  // ============================================================
  // 5. 计算每个学生的连线数
  // ============================================================
  for (const record of records) {
    const name = record['1、你的姓名：']?.trim();
    if (!name) continue;

    // 计算与多少人有连线（作为source）
    let connectionCount = 0;
    for (const targetName of studentNames) {
      if (name === targetName) continue;
      const isConnected = record[`[INTERACT]${name}_TO_${targetName}_是否连线`] === '是';
      if (isConnected) connectionCount++;
    }

    record['[STATS]连线数'] = String(connectionCount);
    record['[STATS]社交活跃度'] = connectionCount >= 10 ? '高' : connectionCount >= 5 ? '中' : '低';
  }

  // ============================================================
  // 6. 输出CSV
  // ============================================================
  console.log('\n💾 写入输出文件...');

  const originalColumns = Object.keys(records[0]).filter(
    col => !col.startsWith('[WORK_') && !col.startsWith('[STATS]') && !col.startsWith('[INTERACT]')
  );

  // 构建新的列顺序
  const workColumns: string[] = [];
  for (let i = 0; i < maxWorks; i++) {
    const prefix = `[WORK_${i + 1}]`;
    workColumns.push(
      `${prefix}作品ID`,
      `${prefix}作品名称`,
      `${prefix}作品类型`,
      `${prefix}发布时间`,
      `${prefix}获赞数`,
      `${prefix}评论数`,
      `${prefix}教师评分`,
      `${prefix}主题`
    );
  }

  const statsColumns = [
    '[STATS]收到点赞数',
    '[STATS]收到评论数',
    '[STATS]总互动数',
    '[STATS]发出点赞数',
    '[STATS]发出评论数',
    '[STATS]连线数',
    '[STATS]社交活跃度',
  ];

  // 交互关系列（只保留关键字段，避免列数爆炸）
  const interactColumns: string[] = [];
  for (const sourceName of studentNames) {
    for (const targetName of studentNames) {
      if (sourceName === targetName) continue;
      const prefix = `[INTERACT]${sourceName}_TO_${targetName}`;
      interactColumns.push(`${prefix}_是否连线`);
    }
  }

  // 简化：只保留"是否连线"字段，其他详细数据单独存储
  const allColumns = [
    ...originalColumns,
    ...workColumns,
    ...statsColumns,
  ];

  // 确保每条记录都有所有列
  for (const record of records) {
    for (const col of allColumns) {
      if (!(col in record)) {
        record[col] = '';
      }
    }
  }

  // 输出主CSV
  const output = stringify(records, {
    header: true,
    columns: allColumns,
  });

  fs.writeFileSync(outputPath, output, 'utf-8');

  // ============================================================
  // 7. 单独输出交互关系详情CSV
  // ============================================================
  const interactOutputPath = path.resolve(
    '/Users/champ/Documents/CodingPlatformNetwork/backend/datas/4.27/学生互动关系详情.csv'
  );

  const interactRecords = interactions.map(i => ({
    发起者: i.sourceStudent,
    接收者: i.targetStudent,
    互动类型: i.interactionType === 'LIKE' ? '点赞' : '评论',
    互动强度: String(i.strength),
    评论内容: i.content || '',
  }));

  const interactOutput = stringify(interactRecords, {
    header: true,
  });

  fs.writeFileSync(interactOutputPath, interactOutput, 'utf-8');

  // ============================================================
  // 8. 输出连线关系CSV（用于图谱可视化）
  // ============================================================
  const edgeOutputPath = path.resolve(
    '/Users/champ/Documents/CodingPlatformNetwork/backend/datas/4.27/学生连线关系.csv'
  );

  const edgeRecords: Record<string, string>[] = [];
  for (const sourceName of studentNames) {
    for (const targetName of studentNames) {
      if (sourceName === targetName) continue;

      const pairInteractions = interactions.filter(
        i => i.sourceStudent === sourceName && i.targetStudent === targetName
      );

      if (pairInteractions.length > 0) {
        const totalStrength = pairInteractions.reduce((sum, i) => sum + i.strength, 0);
        edgeRecords.push({
          sourceNode: sourceName,
          targetNode: targetName,
          interactionType: 'SOCIAL',
          actionType: pairInteractions.some(i => i.interactionType === 'COMMENT') ? 'COMMENT' : 'LIKE',
          strength: String(totalStrength.toFixed(2)),
          interactionCount: String(pairInteractions.length),
        });
      }
    }
  }

  const edgeOutput = stringify(edgeRecords, {
    header: true,
  });

  fs.writeFileSync(edgeOutputPath, edgeOutput, 'utf-8');

  console.log('\n✅ 完成！');
  console.log(`📄 主文件: ${outputPath}`);
  console.log(`📄 互动详情: ${interactOutputPath}`);
  console.log(`📄 连线关系: ${edgeOutputPath}`);
  console.log(`\n📊 统计:`);
  console.log(`  - 学生数: ${records.length}`);
  console.log(`  - 作品数: ${totalWorks}`);
  console.log(`  - 互动数: ${interactions.length}`);
  console.log(`  - 连线数: ${edgeRecords.length}`);
  console.log(`  - 总列数: ${allColumns.length}`);
}

main();
