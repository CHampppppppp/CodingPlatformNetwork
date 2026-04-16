#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const INPUT_PATH = path.resolve(
  __dirname,
  '../datas/script_filterd/问卷_后测_作品_点赞_姓名_埋点_Meta关联.csv',
);
const OUTPUT_PATH = path.resolve(
  __dirname,
  '../datas/script_filterd/秀水小学学生筛选数据.csv',
);

function readCsv(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, { encoding: 'utf-8' });
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    encoding: 'utf-8',
    bom: true,
  });
}

function escapeCsvCell(value: string): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function main() {
  const records = readCsv(INPUT_PATH);
  const xiushuiRecords = records.filter((r) =>
    (r['问卷_列7'] || '').includes('秀水'),
  );

  if (xiushuiRecords.length === 0) {
    console.log('未找到秀水小学学生');
    return;
  }

  const headers = Object.keys(xiushuiRecords[0]);
  const lines: string[] = [];
  lines.push('\uFEFF' + headers.join(','));

  for (const record of xiushuiRecords) {
    const values = headers.map((h) => record[h] || '');
    lines.push(values.map(escapeCsvCell).join(','));
  }

  fs.writeFileSync(OUTPUT_PATH, lines.join('\n'), { encoding: 'utf-8' });
  console.log(`已筛选并更新 ${xiushuiRecords.length} 条秀水小学学生数据`);
  console.log(`输出文件: ${OUTPUT_PATH}`);
}

main();
