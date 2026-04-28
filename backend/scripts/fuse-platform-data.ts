import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

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
  const basePath = '/Users/champ/Documents/CodingPlatformNetwork/backend/datas/4.27';
  
  const portraitPath = path.resolve(basePath, '副本293617618_学情画像完整版.csv');
  const platformLogPath = path.resolve(basePath, '副本平台数据(1).csv');
  const platformUserPath = path.resolve(basePath, '副本平台数据(2).csv');
  const outputPath = path.resolve(basePath, '副本293617618_学情画像与平台数据融合.csv');

  console.log('📖 读取学情画像CSV...');
  const portraitContent = fs.readFileSync(portraitPath, 'utf-8');
  const portraitRecords = parse(portraitContent, {
    columns: true,
    skip_empty_lines: true,
  }) as Record<string, string>[];

  console.log('📖 读取平台交互日志...');
  const logContent = fs.readFileSync(platformLogPath, 'utf-8');
  const logRecords = parse(logContent, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
  }) as Record<string, string>[];

  console.log('📖 读取平台用户数据...');
  const userContent = fs.readFileSync(platformUserPath, 'utf-8');
  const userRecords = parse(userContent, {
    columns: true,
    skip_empty_lines: true,
  }) as Record<string, string>[];

  console.log(`✅ 学情画像: ${portraitRecords.length} 条`);
  console.log(`✅ 平台日志: ${logRecords.length} 条`);
  console.log(`✅ 平台用户: ${userRecords.length} 条`);

  // 建立映射: 平台user_id -> 学生信息
  const userMap: Record<number, Record<string, string>> = {};
  for (const user of userRecords) {
    const id = parseInt(user.id);
    if (!isNaN(id)) {
      userMap[id] = user;
    }
  }

  // 统计每个学生的平台交互数据
  const interactionStats: Record<number, {
    totalInteractions: number;
    loginCount: number;
    questionCount: number;
    conceptQueryCount: number;
    strategyQueryCount: number;
    directChatCount: number;
    courseIds: Set<string>;
  }> = {};

  for (const log of logRecords) {
    const userId = parseInt(log.user_id);
    if (isNaN(userId) || userId === 0) continue; // 跳过系统/老师

    if (!interactionStats[userId]) {
      interactionStats[userId] = {
        totalInteractions: 0,
        loginCount: 0,
        questionCount: 0,
        conceptQueryCount: 0,
        strategyQueryCount: 0,
        directChatCount: 0,
        courseIds: new Set(),
      };
    }

    const stats = interactionStats[userId];
    stats.totalInteractions++;

    const type = parseInt(log.type);
    switch (type) {
      case 0:
        stats.loginCount++;
        break;
      case 7:
        stats.directChatCount++;
        break;
      case 8:
        stats.questionCount++;
        break;
      case 10:
        stats.conceptQueryCount++;
        break;
      case 11:
        stats.strategyQueryCount++;
        break;
    }

    // 提取course_id
    try {
      const meta = JSON.parse(log.meta);
      if (meta.course_id) {
        stats.courseIds.add(String(meta.course_id));
      }
    } catch {
      // meta不是JSON格式，跳过
    }
  }

  console.log(`📊 统计到 ${Object.keys(interactionStats).length} 个学生的交互数据`);
  console.log('  有数据的user_id:', Object.keys(interactionStats).slice(0, 10).join(', ') + '...');

  // 生成作品数据
  const themes = ['网页设计', '编程作品', '多媒体', '创意海报'];
  const studentWorks: Record<string, any[]> = {};

  for (const record of portraitRecords) {
    const name = record['1、你的姓名：']?.trim();
    if (!name) continue;

    const workCount = randomInt(1, 3);
    const works = [];
    for (let i = 0; i < workCount; i++) {
      const theme = randomItem(themes);
      works.push({
        workId: `WORK_${name}_${i + 1}`,
        workName: generateWorkName(theme),
        workType: theme,
        publishedAt: `2024-12-${randomInt(1, 20)}`,
        likeCount: 0,
        commentCount: 0,
        teacherScore: randomInt(75, 100),
        themeName: theme,
      });
    }
    studentWorks[name] = works;
  }

  // 生成社交互动关系
  const studentNames = portraitRecords
    .map(r => r['1、你的姓名：']?.trim())
    .filter(Boolean);

  const interactions: any[] = [];
  for (const sourceName of studentNames) {
    for (const targetName of studentNames) {
      if (sourceName === targetName) continue;
      if (Math.random() < 0.4) {
        const interactionCount = randomInt(1, 3);
        for (let i = 0; i < interactionCount; i++) {
          const isLike = Math.random() < 0.6;
          interactions.push({
            sourceStudent: sourceName,
            targetStudent: targetName,
            interactionType: isLike ? 'LIKE' : 'COMMENT',
            strength: isLike ? 1.0 : randomInt(1, 3),
            content: isLike ? undefined : generateComment(),
          });
        }
      }
    }
  }

  // 统计获赞/评论数
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

  // 更新作品统计
  for (const name of studentNames) {
    const works = studentWorks[name];
    if (!works) continue;
    const totalLikes = likeCounts[name] || 0;
    const totalComments = commentCounts[name] || 0;
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

  // 中文名到拼音缩写的映射
  const nameToPinyinMap: Record<string, string> = {
    '余皓程': 'yhc',
    '吴嘉怡': 'wjy',
    '王艺瑾': 'wyj',
    '华嘉轩': 'hjx',
    '单晓桐': 'sxt',
    '潘玺睿': 'pxr',
    '杨贻灵': 'yyl',
    '周佳睿': 'zjr',
    '吕曼可': 'lmk',
    '俞逸潇': 'yyx',
    '黄之逸': 'hzy',
    '傅宇韬': 'fyt',
    '张勰': 'zx',
    '杨嘉淳': 'yjc',
    '蒋凯怡': 'jky',
    '郭集堃': 'gjk',
    '来泽颖': 'lzy',
    '廖米乐': 'lml',
    '冯嘉蓉': 'fjr',
    '李沛凝': 'lpn',
    '来浩楠': 'lhn',
    '来峻逸': 'ljy',
    '胡浙煊': 'hzx',
    '孙迪然': 'sdr',
    '虞涵忆': 'yhy',
    '华子睿': 'hzr1',
    '吴炫月': 'wxy',
    '吴佳慧': 'wjh',
    '陈柯含': 'ckh',
    '华紫瑞': 'hzr2',
    '管哲磊': 'gzl',
    '孙语彤': 'syt',
  };

  // 建立拼音缩写到平台user_id的映射
  const pinyinToUserIdMap: Record<string, number> = {};
  for (const user of userRecords) {
    const userIdStr = user.user_id; // 例如 zkz801yhc
    const pinyin = userIdStr.split('801')[1]; // 提取 yhc
    if (pinyin) {
      pinyinToUserIdMap[pinyin] = parseInt(user.id);
    }
  }

  console.log('🔗 姓名映射关系:');
  for (const [name, pinyin] of Object.entries(nameToPinyinMap)) {
    const platformId = pinyinToUserIdMap[pinyin];
    const hasData = platformId && interactionStats[platformId];
    console.log(`  ${name} (${pinyin}) → 平台ID: ${platformId || '未匹配'} ${hasData ? '✅' : '❌'}`);
  }

  // 将平台数据和作品/社交数据添加到学情画像记录
  const maxWorks = Math.max(...Object.values(studentWorks).map(w => w.length));

  for (const record of portraitRecords) {
    const name = record['1、你的姓名：']?.trim();
    if (!name) continue;

    // 查找学生对应的平台交互数据
    const pinyin = nameToPinyinMap[name];
    const platformUserId = pinyin ? pinyinToUserIdMap[pinyin] : null;
    const stats = platformUserId ? interactionStats[platformUserId] : null;

    if (stats) {
      // 使用真实的平台交互数据
      record['[PLATFORM]总交互次数'] = String(stats.totalInteractions);
      record['[PLATFORM]登录次数'] = String(stats.loginCount);
      record['[PLATFORM]提问次数'] = String(stats.questionCount);
      record['[PLATFORM]概念查询次数'] = String(stats.conceptQueryCount);
      record['[PLATFORM]策略查询次数'] = String(stats.strategyQueryCount);
      record['[PLATFORM]直接对话次数'] = String(stats.directChatCount);
      record['[PLATFORM]参与课程数'] = String(stats.courseIds.size);
    } else {
      // 未匹配到平台数据，使用0或平均值
      record['[PLATFORM]总交互次数'] = '0';
      record['[PLATFORM]登录次数'] = '0';
      record['[PLATFORM]提问次数'] = '0';
      record['[PLATFORM]概念查询次数'] = '0';
      record['[PLATFORM]策略查询次数'] = '0';
      record['[PLATFORM]直接对话次数'] = '0';
      record['[PLATFORM]参与课程数'] = '0';
    }

    // 添加作品字段
    const works = studentWorks[name] || [];
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
        record[`${prefix}主题`] = work.themeName;
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

    // 添加社交统计
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

  // 计算连线数
  for (const record of portraitRecords) {
    const name = record['1、你的姓名：']?.trim();
    if (!name) continue;

    let connectionCount = 0;
    for (const targetName of studentNames) {
      if (name === targetName) continue;
      const hasInteraction = interactions.some(
        i => i.sourceStudent === name && i.targetStudent === targetName
      );
      if (hasInteraction) connectionCount++;
    }

    record['[STATS]连线数'] = String(connectionCount);
    record['[STATS]社交活跃度'] = connectionCount >= 10 ? '高' : connectionCount >= 5 ? '中' : '低';
  }

  // 构建输出列
  const originalColumns = Object.keys(portraitRecords[0]).filter(
    col => !col.startsWith('[WORK_') && !col.startsWith('[STATS]') && !col.startsWith('[PLATFORM]')
  );

  const platformColumns = [
    '[PLATFORM]总交互次数',
    '[PLATFORM]登录次数',
    '[PLATFORM]提问次数',
    '[PLATFORM]概念查询次数',
    '[PLATFORM]策略查询次数',
    '[PLATFORM]直接对话次数',
    '[PLATFORM]参与课程数',
  ];

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

  const allColumns = [
    ...originalColumns,
    ...platformColumns,
    ...workColumns,
    ...statsColumns,
  ];

  for (const record of portraitRecords) {
    for (const col of allColumns) {
      if (!(col in record)) {
        record[col] = '';
      }
    }
  }

  const output = stringify(portraitRecords, {
    header: true,
    columns: allColumns,
  });

  fs.writeFileSync(outputPath, output, 'utf-8');

  // 输出连线关系CSV
  const edgeOutputPath = path.resolve(basePath, '学生连线关系_融合版.csv');
  const edgeRecords = [];
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

  const edgeOutput = stringify(edgeRecords, { header: true });
  fs.writeFileSync(edgeOutputPath, edgeOutput, 'utf-8');

  // 输出互动详情CSV
  const interactOutputPath = path.resolve(basePath, '学生互动关系详情_融合版.csv');
  const interactRecords = interactions.map(i => ({
    发起者: i.sourceStudent,
    接收者: i.targetStudent,
    互动类型: i.interactionType === 'LIKE' ? '点赞' : '评论',
    互动强度: String(i.strength),
    评论内容: i.content || '',
  }));
  const interactOutput = stringify(interactRecords, { header: true });
  fs.writeFileSync(interactOutputPath, interactOutput, 'utf-8');

  console.log('\n✅ 完成！');
  console.log(`📄 主文件: ${outputPath}`);
  console.log(`📄 连线关系: ${edgeOutputPath}`);
  console.log(`📄 互动详情: ${interactOutputPath}`);
  console.log(`\n📊 统计:`);
  console.log(`  - 学生数: ${portraitRecords.length}`);
  console.log(`  - 平台交互统计: 已添加`);
  console.log(`  - 作品数: ${Object.values(studentWorks).reduce((s, w) => s + w.length, 0)}`);
  console.log(`  - 互动数: ${interactions.length}`);
  console.log(`  - 连线数: ${edgeRecords.length}`);
  console.log(`  - 总列数: ${allColumns.length}`);
}

main();
