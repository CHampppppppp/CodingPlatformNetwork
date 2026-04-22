const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../datas/filterd/社团课等非正式学习学生.csv');

// 读取文件
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

// 跳过表头，统计学校
const schoolCount = new Map();

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  
  // CSV解析（处理引号内的逗号）
  const columns = [];
  let current = '';
  let inQuotes = false;
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      columns.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  columns.push(current.trim());
  
  // 学校在第7列（索引6）
  const school = columns[6];
  if (school) {
    schoolCount.set(school, (schoolCount.get(school) || 0) + 1);
  }
}

// 按学生数量排序
const sortedSchools = Array.from(schoolCount.entries())
  .sort((a, b) => b[1] - a[1]);

// 输出结果
console.log('学校统计结果（按学生数量降序）：\n');
console.log('排名 | 学校名称 | 学生数量');
console.log('---|---|---');

sortedSchools.forEach(([school, count], index) => {
  console.log(`${index + 1} | ${school} | ${count}`);
});

console.log(`\n总计：${sortedSchools.length} 所学校，${lines.length - 1} 名学生`);
