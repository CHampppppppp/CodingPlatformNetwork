import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

// ============================================================
// 学情画像维度定义
// ============================================================

interface DimensionConfig {
  code: string;
  name: string;
  category: string; // 一级指标
  subCategory: string; // 二级指标
  questions: number; // 题目数量
  reverseScored?: number[]; // 反向计分的题号（1-based）
  mockMean?: number; // mock数据的均值（1-5）
  mockStd?: number; // mock数据的标准差
}

// 新增需要mock的维度
const mockDimensions: DimensionConfig[] = [
  // 人文基础
  {
    code: 'READING_COMPREHENSION',
    name: '阅读理解',
    category: '认知基础',
    subCategory: '人文基础',
    questions: 5,
    mockMean: 3.2,
    mockStd: 0.8,
  },
  {
    code: 'LANGUAGE_EXPRESSION',
    name: '语言表达',
    category: '认知基础',
    subCategory: '人文基础',
    questions: 5,
    mockMean: 3.0,
    mockStd: 0.9,
  },
  // 科学基础
  {
    code: 'SCIENCE_KNOWLEDGE',
    name: '科学知识',
    category: '认知基础',
    subCategory: '科学基础',
    questions: 6,
    mockMean: 3.1,
    mockStd: 0.85,
  },
  {
    code: 'SCIENCE_INQUIRY',
    name: '科学探究',
    category: '认知基础',
    subCategory: '科学基础',
    questions: 5,
    mockMean: 2.9,
    mockStd: 0.9,
  },
  // 心理健康
  {
    code: 'ANXIETY',
    name: '焦虑倾向',
    category: '心理特质',
    subCategory: '心理健康',
    questions: 10,
    reverseScored: [1, 3, 5, 7, 9], // SAS标准反向题
    mockMean: 2.8,
    mockStd: 0.9,
  },
  {
    code: 'DEPRESSION',
    name: '抑郁倾向',
    category: '心理特质',
    subCategory: '心理健康',
    questions: 10,
    reverseScored: [2, 4, 6, 8, 10], // SDS标准反向题
    mockMean: 2.6,
    mockStd: 0.85,
  },
  // 创新能力
  {
    code: 'INNOVATION',
    name: '创新能力',
    category: '实践创新',
    subCategory: '创新能力',
    questions: 10,
    mockMean: 3.3,
    mockStd: 0.8,
  },
];

// ============================================================
// 正态分布随机数生成
// ============================================================

function randn_bm(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function generateLikertScore(mean: number, std: number): number {
  let score = Math.round(mean + randn_bm() * std);
  // 限制在1-5之间
  score = Math.max(1, Math.min(5, score));
  return score;
}

// ============================================================
// 主处理逻辑
// ============================================================

function main() {
  const inputPath = path.resolve(
    '/Users/champ/Documents/CodingPlatformNetwork/backend/datas/4.27/副本293617618_按序号_801802803GAI后测_96_94.csv'
  );
  const outputPath = path.resolve(
    '/Users/champ/Documents/CodingPlatformNetwork/backend/datas/4.27/副本293617618_学情画像完整版.csv'
  );

  console.log('📖 读取原始CSV文件...');
  const fileContent = fs.readFileSync(inputPath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  }) as Record<string, string>[];

  console.log(`✅ 读取到 ${records.length} 条学生记录`);

  // 获取原始列名，过滤chatbot相关问题
  const originalColumns = Object.keys(records[0]).filter(col => !col.includes('chatbot'));

  // ============================================================
  // 1. 为每个学生生成mock数据
  // ============================================================
  console.log('🎲 生成mock数据...');

  for (const record of records) {
    for (const dim of mockDimensions) {
      for (let q = 1; q <= dim.questions; q++) {
        let score = generateLikertScore(dim.mockMean!, dim.mockStd!);
        
        // 反向计分处理
        if (dim.reverseScored?.includes(q)) {
          score = 6 - score; // 1↔5, 2↔4, 3↔3
        }
        
        const colName = `[MOCK]${dim.category}-${dim.subCategory}-${dim.name}_Q${q}`;
        record[colName] = String(score);
      }
    }
  }

  // ============================================================
  // 2. 计算三级指标得分（原始问卷数据 → 0-10分）
  // ============================================================
  console.log('🧮 计算三级指标得分...');

  function calcDimensionScore(record: Record<string, string>, colPrefix: string, questionCount: number): number {
    let sum = 0;
    let count = 0;
    for (let q = 1; q <= questionCount; q++) {
      // 查找包含该问题的列（模糊匹配）
      const col = Object.keys(record).find(k => k.includes(colPrefix) && k.includes(`Q${q}`));
      if (col) {
        sum += parseInt(record[col]) || 0;
        count++;
      }
    }
    if (count === 0) return 0;
    const avg = sum / count;
    return ((avg - 1) / 4) * 10; // 1-5分 → 0-10分
  }

  // 计算现有问卷数据的三级指标得分
  const calculatedScores: Record<string, (r: Record<string, string>) => number> = {
    // 认知基础-技术应用
    'TECH_COMPUTATIONAL_THINKING': (r) => {
      // 问题17：编程自我效能感（5题）
      const q17Cols = Object.keys(r).filter(k => k.includes('17、') && !k.includes('18、'));
      let sum = 0;
      q17Cols.forEach(col => sum += parseInt(r[col]) || 0);
      const avg = q17Cols.length > 0 ? sum / q17Cols.length : 3;
      return ((avg - 1) / 4) * 10;
    },
    'TECH_LITERACY': (r) => {
      // 问题15：人机信任度（6题）+ 问题19：AI态度（1题）
      const q15Cols = Object.keys(r).filter(k => k.includes('15、'));
      const q19Col = Object.keys(r).find(k => k.includes('19、'));
      let sum = 0;
      let count = 0;
      q15Cols.forEach(col => { sum += parseInt(r[col]) || 0; count++; });
      if (q19Col) { sum += parseInt(r[q19Col]) || 0; count++; }
      const avg = count > 0 ? sum / count : 3;
      return ((avg - 1) / 4) * 10;
    },
    // 心理特质-坚韧豁达
    'RESILIENCE_INTEREST': (r) => {
      // 问题13：学习态度（2题）+ 问题18：学习动机（5题）
      const q13Cols = Object.keys(r).filter(k => k.includes('13、'));
      const q18Cols = Object.keys(r).filter(k => k.includes('18、'));
      let sum = 0;
      let count = 0;
      q13Cols.forEach(col => { sum += parseInt(r[col]) || 0; count++; });
      q18Cols.forEach(col => { sum += parseInt(r[col]) || 0; count++; });
      const avg = count > 0 ? sum / count : 3;
      return ((avg - 1) / 4) * 10;
    },
    // 心理特质-生活态度
    'ATTITUDE_PRESSURE': (r) => {
      // 问题16：认知负荷（8题）- 反向编码
      const q16Cols = Object.keys(r).filter(k => k.includes('16、'));
      let sum = 0;
      q16Cols.forEach(col => sum += (6 - (parseInt(r[col]) || 3))); // 反向编码
      const avg = q16Cols.length > 0 ? sum / q16Cols.length : 3;
      return ((avg - 1) / 4) * 10;
    },
    // 实践创新-问题解决
    'INNOVATION_PROBLEM_SOLVING': (r) => {
      // 问题17：编程自我效能感（5题）
      const q17Cols = Object.keys(r).filter(k => k.includes('17、') && !k.includes('18、'));
      let sum = 0;
      q17Cols.forEach(col => sum += parseInt(r[col]) || 0);
      const avg = q17Cols.length > 0 ? sum / q17Cols.length : 3;
      return ((avg - 1) / 4) * 10;
    },
    // 实践创新-协作能力
    'INNOVATION_COLLABORATION': (r) => {
      // 学习风格中合作倾向：问题3、9、10、11
      const col3 = Object.keys(r).find(k => k.startsWith('3、'));
      const col9 = Object.keys(r).find(k => k.startsWith('9、'));
      const col10 = Object.keys(r).find(k => k.startsWith('10、'));
      const col11 = Object.keys(r).find(k => k.startsWith('11、'));
      // 合作倾向 = 选A（编码1）表示合作，选B（编码2）表示独立
      // 将编码反转：1→5, 2→1（A=合作=高分）
      let sum = 0;
      let count = 0;
      [col3, col9, col10, col11].forEach(col => {
        if (col) {
          const val = parseInt(r[col]) || 2;
          sum += (val === 1 ? 5 : 1); // A=合作=5分, B=独立=1分
          count++;
        }
      });
      const avg = count > 0 ? sum / count : 3;
      return ((avg - 1) / 4) * 10;
    },
    // 实践创新-实践能力
    'INNOVATION_PRACTICE': (r) => {
      // 问题17：编程自我效能感（5题）
      const q17Cols = Object.keys(r).filter(k => k.includes('17、') && !k.includes('18、'));
      let sum = 0;
      q17Cols.forEach(col => sum += parseInt(r[col]) || 0);
      const avg = q17Cols.length > 0 ? sum / q17Cols.length : 3;
      return ((avg - 1) / 4) * 10;
    },
  };

  // 计算mock数据的三级指标得分
  const mockScoreCalculators: Record<string, (r: Record<string, string>) => number> = {};
  
  for (const dim of mockDimensions) {
    mockScoreCalculators[dim.code] = (r: Record<string, string>) => {
      const prefix = `[MOCK]${dim.category}-${dim.subCategory}-${dim.name}`;
      const cols = Object.keys(r).filter(k => k.startsWith(prefix));
      let sum = 0;
      cols.forEach(col => sum += parseInt(r[col]) || 0);
      const avg = cols.length > 0 ? sum / cols.length : 3;
      return ((avg - 1) / 4) * 10;
    };
  }

  // 合并所有计算器
  const allCalculators = { ...calculatedScores, ...mockScoreCalculators };

  // 为每条记录计算所有三级指标得分
  for (const record of records) {
    for (const [code, calculator] of Object.entries(allCalculators)) {
      const score = calculator(record);
      record[`[SCORE]${code}`] = score.toFixed(2);
    }
  }

  // ============================================================
  // 3. 计算二级指标得分
  // ============================================================
  console.log('🧮 计算二级指标得分...');

  const secondaryIndicators: Record<string, string[]> = {
    'COG_HUMANITIES': ['READING_COMPREHENSION', 'LANGUAGE_EXPRESSION'], // 人文基础
    'COG_SCIENCE': ['SCIENCE_KNOWLEDGE', 'SCIENCE_INQUIRY'], // 科学基础
    'COG_TECH': ['TECH_COMPUTATIONAL_THINKING', 'TECH_LITERACY'], // 技术应用
    'PSY_MENTAL_HEALTH': ['ANXIETY', 'DEPRESSION'], // 心理健康
    'PSY_RESILIENCE': ['RESILIENCE_INTEREST'], // 坚韧豁达
    'PSY_ATTITUDE': ['ATTITUDE_PRESSURE'], // 生活态度
    'PRAC_INNOVATION': ['INNOVATION'], // 创新能力
    'PRAC_PROBLEM_SOLVING': ['INNOVATION_PROBLEM_SOLVING'], // 问题解决
    'PRAC_COLLABORATION': ['INNOVATION_COLLABORATION'], // 协作能力
    'PRAC_PRACTICE': ['INNOVATION_PRACTICE'], // 实践能力
  };

  for (const record of records) {
    for (const [secondaryCode, tertiaryCodes] of Object.entries(secondaryIndicators)) {
      let sum = 0;
      let count = 0;
      for (const tertiaryCode of tertiaryCodes) {
        const scoreKey = `[SCORE]${tertiaryCode}`;
        if (record[scoreKey]) {
          sum += parseFloat(record[scoreKey]);
          count++;
        }
      }
      const avg = count > 0 ? sum / count : 0;
      
      // 心理健康特殊公式：10 - (焦虑+抑郁)/2
      if (secondaryCode === 'PSY_MENTAL_HEALTH') {
        const anxiety = parseFloat(record['[SCORE]ANXIETY'] || '0');
        const depression = parseFloat(record['[SCORE]DEPRESSION'] || '0');
        record[`[SECONDARY]${secondaryCode}`] = (10 - (anxiety + depression) / 2).toFixed(2);
      } else {
        record[`[SECONDARY]${secondaryCode}`] = avg.toFixed(2);
      }
    }
  }

  // ============================================================
  // 4. 计算一级指标得分
  // ============================================================
  console.log('🧮 计算一级指标得分...');

  const primaryIndicators: Record<string, string[]> = {
    'PRIMARY_COGNITIVE': ['COG_HUMANITIES', 'COG_SCIENCE', 'COG_TECH'], // 认知基础
    'PRIMARY_PSYCHOLOGY': ['PSY_MENTAL_HEALTH', 'PSY_RESILIENCE', 'PSY_ATTITUDE'], // 心理特质
    'PRIMARY_PRACTICE': ['PRAC_INNOVATION', 'PRAC_PROBLEM_SOLVING', 'PRAC_COLLABORATION', 'PRAC_PRACTICE'], // 实践创新
  };

  for (const record of records) {
    for (const [primaryCode, secondaryCodes] of Object.entries(primaryIndicators)) {
      let sum = 0;
      let count = 0;
      for (const secondaryCode of secondaryCodes) {
        const scoreKey = `[SECONDARY]${secondaryCode}`;
        if (record[scoreKey]) {
          sum += parseFloat(record[scoreKey]);
          count++;
        }
      }
      const avg = count > 0 ? sum / count : 0;
      record[`[PRIMARY]${primaryCode}`] = avg.toFixed(2);
    }
  }

  // ============================================================
  // 5. 添加汇总信息列
  // ============================================================
  console.log('📊 添加汇总信息...');

  for (const record of records) {
    record['[SUMMARY]总画像得分'] = (
      (parseFloat(record['[PRIMARY]PRIMARY_COGNITIVE'] || '0') +
       parseFloat(record['[PRIMARY]PRIMARY_PSYCHOLOGY'] || '0') +
       parseFloat(record['[PRIMARY]PRIMARY_PRACTICE'] || '0')) / 3
    ).toFixed(2);
  }

  // ============================================================
  // 6. 输出CSV
  // ============================================================
  console.log('💾 写入输出文件...');

  // 构建列顺序：原始列 + mock题目列 + 得分列
  const allColumns = [
    ...originalColumns,
    // Mock题目列（按维度分组）
    ...mockDimensions.flatMap(dim => 
      Array.from({ length: dim.questions }, (_, i) => 
        `[MOCK]${dim.category}-${dim.subCategory}-${dim.name}_Q${i + 1}`
      )
    ),
    // 三级指标得分
    ...Object.keys(allCalculators).map(code => `[SCORE]${code}`),
    // 二级指标得分
    ...Object.keys(secondaryIndicators).map(code => `[SECONDARY]${code}`),
    // 一级指标得分
    ...Object.keys(primaryIndicators).map(code => `[PRIMARY]${code}`),
    // 汇总
    '[SUMMARY]总画像得分',
  ];

  // 确保每条记录都有所有列
  for (const record of records) {
    for (const col of allColumns) {
      if (!(col in record)) {
        record[col] = '';
      }
    }
  }

  // 按指定顺序输出
  const output = stringify(records, {
    header: true,
    columns: allColumns,
  });

  fs.writeFileSync(outputPath, output, 'utf-8');

  console.log('\n✅ 完成！');
  console.log(`📄 输出文件: ${outputPath}`);
  console.log(`📊 学生数量: ${records.length}`);
  console.log(`📈 总列数: ${allColumns.length}`);
  console.log('\n📋 维度统计:');
  console.log(`  - 新增mock题目: ${mockDimensions.reduce((sum, d) => sum + d.questions, 0)} 题`);
  console.log(`  - 三级指标: ${Object.keys(allCalculators).length} 个`);
  console.log(`  - 二级指标: ${Object.keys(secondaryIndicators).length} 个`);
  console.log(`  - 一级指标: ${Object.keys(primaryIndicators).length} 个`);
}

main();
