#!/usr/bin/env ts-node
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const TRACKING_CSV_PATH = path.resolve(
  __dirname,
  '../datas/filterd/埋点数据_接入省科技平台_user_id非空_转换后.csv',
);
const SURVEY_CSV_PATH = path.resolve(
  __dirname,
  '../datas/script_filterd/问卷_后测_作品_点赞_姓名_埋点_共同学生.csv',
);
const OUTPUT_CSV_PATH = path.resolve(
  __dirname,
  '../datas/script_filterd/问卷_后测_作品_点赞_姓名_埋点_Meta关联.csv',
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
  console.log('=== 开始关联埋点meta数据 ===');

  const trackingRecords = readCsv(TRACKING_CSV_PATH);
  console.log(`读取到 ${trackingRecords.length} 条埋点记录`);

  const surveyRecords = readCsv(SURVEY_CSV_PATH);
  console.log(`读取到 ${surveyRecords.length} 条问卷记录`);

  const trackingByUserId = new Map<string, Array<Record<string, string>>>();
  for (const record of trackingRecords) {
    const userId = record['user_id']?.trim();
    if (!userId) continue;
    if (!trackingByUserId.has(userId)) {
      trackingByUserId.set(userId, []);
    }
    trackingByUserId.get(userId)!.push(record);
  }
  console.log(`涉及 ${trackingByUserId.size} 个不同的 user_id`);

  const originalHeaders = Object.keys(surveyRecords[0] || {});
  const newHeaders = [
    ...originalHeaders,
    '埋点记录数',
    '埋点meta数据',
  ];

  const outputLines: string[] = [];
  outputLines.push('\uFEFF' + newHeaders.join(','));

  let matchedCount = 0;
  for (const survey of surveyRecords) {
    const userId = survey['user_id']?.trim();
    const trackingList = trackingByUserId.get(userId) || [];

    if (trackingList.length > 0) {
      matchedCount++;
    }

    const metaList = trackingList.map((t) => {
      try {
        const parsed = JSON.parse(t['meta'] || '{}');
        return parsed;
      } catch {
        return t['meta'] || '';
      }
    });

    const newColumns = [
      String(trackingList.length),
      JSON.stringify(metaList),
    ];

    const rowValues = [...originalHeaders.map((h) => survey[h] || ''), ...newColumns];
    outputLines.push(rowValues.map(escapeCsvCell).join(','));
  }

  fs.writeFileSync(OUTPUT_CSV_PATH, outputLines.join('\n'), {
    encoding: 'utf-8',
  });

  console.log(`匹配到埋点数据的学生数: ${matchedCount} / ${surveyRecords.length}`);
  console.log(`输出文件: ${OUTPUT_CSV_PATH}`);
  console.log('=== 关联完成 ===');
}

main();
