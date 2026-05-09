import { createHash } from 'crypto';
import * as fs from 'fs';
import { execSync } from 'child_process';

const BATCH_SIZE = 500;

const WORK_NAMES: Record<string, string[]> = {
  SHOW_CASE: [
    '数学思维导图', '英语手抄报', '科学实验报告', '语文阅读笔记',
    '美术创意作品', '音乐节奏练习', '体育技能展示', '编程小项目',
    '历史时间轴', '地理地图绘制', '生物观察日记', '物理小制作',
    '化学元素卡片', '古诗词配画', '读后感', '数学解题思路',
    '英语口语展示', '书法作品', '剪纸艺术', '手工模型'
  ],
  COLLABORATIVE_LEARNING: [
    'AI协作海报', '小组项目报告', '协作思维导图', '在线讨论总结',
    'PPT演示文稿', '团队调研报告', '角色扮演剧本', '小组辩论稿',
    '协作编程作品', '共同创作故事', '小组实验记录', '合作手抄报',
    '团队策划案', '协作数据分析', '小组展示视频', '共同设计图',
    '在线协作笔记', '团队解决方案', '协作学习日志', '小组评论文章'
  ],
  INFORMAL_LEARNING: [
    '社团活动记录', '兴趣小组作品', '实践报告', '创意手工',
    '科技小发明', '编程练习', '绘画作品', '摄影作品',
    '读书笔记', '观影心得', '参观游记', '实验记录',
    '志愿服务记录', '运动打卡', '音乐练习', '舞蹈视频',
    '手工折纸', '科学小实验', '植物观察', '动物观察'
  ]
};

const THEMES: Record<string, string[]> = {
  SHOW_CASE: [
    '2026年春季学期成果展示', '学科素养展示活动', '期末综合展示',
    '学科兴趣拓展', '校园文化节作品', '科技创新展示', '艺术素养展示', '阅读能力展示'
  ],
  COLLABORATIVE_LEARNING: [
    'AI协作海报制作活动', '在线协作学习项目', '小组协作探究',
    'teamwork协作任务', '线上协作讨论', '小组合作展示', '协作式学习活动', '团队项目实践'
  ],
  INFORMAL_LEARNING: [
    '2026年寒假活动', '社团课成果展示', '兴趣小组活动',
    '课后实践活动', '校外学习记录', '自主学习项目', '假期作业展示', '课外拓展活动'
  ]
};

const TEXTBOOKS = [
  '2026年寒假活动', '2026年春季学期', '综合素质评价', '校本课程',
  '社团活动课程', '兴趣拓展课程', '实践活动课程', '自主学习项目'
];

const TEACHER_NAMES = [
  '张老师', '李老师', '王老师', '陈老师', '刘老师', '赵老师', '孙老师',
  '周老师', '吴老师', '郑老师', '钱老师', '冯老师', '杨老师', '朱老师',
  '许老师', '何老师', '林老师', '罗老师', '高老师', '马老师'
];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashString(str: string) {
  return parseInt(createHash('md5').update(str).digest('hex').slice(0, 8), 16);
}

interface Student {
  student_id: string;
  student_name: string;
  classId: string;
  scenario_code: string;
  scenario_id: string;
}

interface Session {
  session_id: string;
  scenario_code: string;
  occurredAt: string;
  classId: string;
}

interface Work {
  id: string;
  studentNodeId: string;
  sessionId: string;
  externalWorkId: string;
  workName: string;
  publishedAt: string;
  themeId: string;
  themeName: string;
  themeDirectory: string;
  textbookName: string;
  likeCount: number;
  commentCount: number;
  teacherName: string;
  teacherScore: number | null;
  teacherComment: string | null;
  likeDetails: string | null;
  commentDetails: string | null;
  activityLogCount: number;
  activityLogMeta: string | null;
}

function parseCSV(filePath: string): any[] {
  const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
  const headers = lines[0].split('\t').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split('\t');
    const obj: any = {};
    headers.forEach((h, i) => { obj[h] = values[i] || null; });
    return obj;
  });
}

function generateWorks(
  students: Student[],
  sessions: Session[],
  scenarioCode: string,
  countRange: [number, number]
): Work[] {
  const works: Work[] = [];
  const scenarioSessions = sessions.filter(s => s.scenario_code === scenarioCode);

  if (scenarioSessions.length === 0) {
    console.warn(`警告: ${scenarioCode} 没有session`);
    return works;
  }

  const sessionsByClass: Record<string, Session[]> = {};
  scenarioSessions.forEach(s => {
    const key = s.classId || 'default';
    if (!sessionsByClass[key]) sessionsByClass[key] = [];
    sessionsByClass[key].push(s);
  });

  const workNames = WORK_NAMES[scenarioCode] || WORK_NAMES.INFORMAL_LEARNING;
  const themes = THEMES[scenarioCode] || THEMES.INFORMAL_LEARNING;

  students.forEach((student, idx) => {
    const seed = hashString(student.student_id);
    const rng = seededRandom(seed + idx);
    const [min, max] = countRange;
    const workCount = Math.floor(rng() * (max - min + 1)) + min;

    let availableSessions = sessionsByClass[student.classId] || [];
    if (availableSessions.length === 0) {
      availableSessions = scenarioSessions;
    }

    for (let i = 0; i < workCount; i++) {
      const session = availableSessions[Math.floor(rng() * availableSessions.length)];
      const sessionDate = new Date(session.occurredAt);
      const offsetDays = Math.floor(rng() * 14) - 3;
      const publishedAt = new Date(sessionDate);
      publishedAt.setDate(publishedAt.getDate() + offsetDays);

      const hasScore = rng() < 0.3;
      const likeCount = Math.floor(rng() * 15);
      const commentCount = Math.floor(rng() * 12);

      works.push({
        id: `sw_${scenarioCode.slice(0, 4)}_${student.student_id.slice(-8)}_${i}_${Date.now().toString(36)}`,
        studentNodeId: student.student_id,
        sessionId: session.session_id,
        externalWorkId: `ext_${student.student_id.slice(-8)}_${i}`,
        workName: workNames[Math.floor(rng() * workNames.length)],
        publishedAt: publishedAt.toISOString().slice(0, 19).replace('T', ' '),
        themeId: `th_${scenarioCode.slice(0, 4)}_${Math.floor(rng() * 10)}`,
        themeName: themes[Math.floor(rng() * themes.length)],
        themeDirectory: `/works/${scenarioCode.toLowerCase()}`,
        textbookName: TEXTBOOKS[Math.floor(rng() * TEXTBOOKS.length)],
        likeCount,
        commentCount,
        teacherName: TEACHER_NAMES[Math.floor(rng() * TEACHER_NAMES.length)],
        teacherScore: hasScore ? (Math.floor(rng() * 41) + 60) / 10 : null,
        teacherComment: hasScore
          ? `作品完成度较高，${['表现优秀', '思路清晰', '创意十足', '值得鼓励'][Math.floor(rng() * 4)]}`
          : null,
        likeDetails: likeCount > 0
          ? JSON.stringify(Array.from({ length: Math.min(likeCount, 5) }, () => ({
              studentName: `同学${Math.floor(rng() * 100) + 1}`,
              likedAt: publishedAt.toISOString()
            })))
          : null,
        commentDetails: commentCount > 0
          ? JSON.stringify(Array.from({ length: Math.min(commentCount, 5) }, () => ({
              studentName: `同学${Math.floor(rng() * 100) + 1}`,
              content: ['很棒！', '继续加油', '很有创意', '做得不错', '学习了'][Math.floor(rng() * 5)]
            })))
          : null,
        activityLogCount: Math.floor(rng() * 20),
        activityLogMeta: Math.floor(rng() * 20) > 0
          ? `{"viewCount":${Math.floor(rng() * 50)},"editCount":${Math.floor(rng() * 20)}}`
          : null
      });
    }
  });

  return works;
}

function buildInsertSQL(works: Work[]): string {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const esc = (s: string | null) => s === null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`;

  let sql = 'SET SESSION unique_checks=0;\nSET SESSION foreign_key_checks=0;\n\n';

  for (let i = 0; i < works.length; i += BATCH_SIZE) {
    const batch = works.slice(i, i + BATCH_SIZE);
    const values = batch.map(w =>
      `('${w.id}','${w.studentNodeId}',${esc(w.sessionId)},${esc(w.externalWorkId)},${esc(w.workName)},` +
      `${esc(w.publishedAt)},${esc(w.themeId)},${esc(w.themeName)},${esc(w.themeDirectory)},${esc(w.textbookName)},` +
      `${w.likeCount},${w.commentCount},${esc(w.teacherName)},${w.teacherScore ?? 'NULL'},${esc(w.teacherComment)},` +
      `${esc(w.likeDetails)},${esc(w.commentDetails)},${w.activityLogCount},${esc(w.activityLogMeta)},` +
      `'${now}','${now}')`
    ).join(',\n');

    sql += 'INSERT INTO student_works_test ';
    sql += '(id,studentNodeId,sessionId,externalWorkId,workName,publishedAt,themeId,themeName,themeDirectory,';
    sql += 'textbookName,likeCount,commentCount,teacherName,teacherScore,teacherComment,likeDetails,';
    sql += 'commentDetails,activityLogCount,activityLogMeta,createdAt,updatedAt) VALUES\n';
    sql += values + ';\n\n';
  }

  sql += 'SET SESSION unique_checks=1;\nSET SESSION foreign_key_checks=1;';
  return sql;
}

async function main() {
  console.log('开始生成 student_work mock数据...\n');

  const studentsSmall = parseCSV('/tmp/students_small.csv');
  const studentsInformal = parseCSV('/tmp/students_informal_sample.csv');
  const sessions = parseCSV('/tmp/sessions.csv');

  console.log(`SHOW_CASE+COLLAB 学生: ${studentsSmall.length}`);
  console.log(`INFORMAL_LEARNING 样本: ${studentsInformal.length}`);
  console.log(`Session总数: ${sessions.length}\n`);

  const showCaseStudents = studentsSmall.filter((s: any) => s.scenario_code === 'SHOW_CASE');
  const collabStudents = studentsSmall.filter((s: any) => s.scenario_code === 'COLLABORATIVE_LEARNING');

  const allWorks: Work[] = [];

  console.log('生成 SHOW_CASE 作品...');
  const showCaseWorks = generateWorks(showCaseStudents, sessions, 'SHOW_CASE', [2, 3]);
  allWorks.push(...showCaseWorks);
  console.log(`  ${showCaseWorks.length} 条 (${showCaseStudents.length}名学生)\n`);

  console.log('生成 COLLABORATIVE_LEARNING 作品...');
  const collabWorks = generateWorks(collabStudents, sessions, 'COLLABORATIVE_LEARNING', [1, 3]);
  allWorks.push(...collabWorks);
  console.log(`  ${collabWorks.length} 条 (${collabStudents.length}名学生)\n`);

  console.log('生成 INFORMAL_LEARNING 作品...');
  const informalWorks = generateWorks(studentsInformal, sessions, 'INFORMAL_LEARNING', [1, 2]);
  allWorks.push(...informalWorks);
  console.log(`  ${informalWorks.length} 条 (${studentsInformal.length}名学生样本)\n`);

  console.log(`总计: ${allWorks.length} 条作品数据\n`);

  const sqlFile = '/tmp/insert_student_works.sql';
  console.log(`生成SQL: ${sqlFile}`);
  fs.writeFileSync(sqlFile, buildInsertSQL(allWorks));
  console.log('SQL文件已生成\n');

  console.log('执行SQL插入...');
  execSync(`mysql -h localhost -u root -D interaction_network_test < ${sqlFile}`, {
    stdio: 'inherit',
    timeout: 300000
  });
  console.log('\n数据插入完成！');
}

main().catch(console.error);
