#!/usr/bin/env ts-node
import * as path from 'path';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

const CSV_PATH = path.resolve(__dirname, '../datas/filterd/埋点数据_接入省科技平台_user_id非空_转换后.csv');
const OUTPUT_PATH = path.resolve(__dirname, '../datas/scripts_filterd/resource-student-rates.json');

interface RateRecord {
  userId: string;
  rate: number;
}

async function extractResourceRates() {
  const csvBuffer = fs.readFileSync(CSV_PATH);
  const csvContent = csvBuffer.toString('utf-8').replace(/^\uFEFF/, '');
  const records: Record<string, string>[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });

  const byUrl: Record<string, RateRecord[]> = {};
  const byTextBook: Record<string, RateRecord[]> = {};

  for (const row of records) {
    const metaStr = row.meta;
    if (!metaStr) continue;

    let meta: any;
    try {
      meta = JSON.parse(metaStr);
    } catch {
      continue;
    }

    if (typeof meta.rate === 'undefined') continue;

    const userId = row.user_id;
    const rate = Number(meta.rate);
    if (!userId || Number.isNaN(rate)) continue;

    const videoUrl = meta.videoUrl || '';
    const textBook = meta.text_book || '';

    if (videoUrl) {
      byUrl[videoUrl] = byUrl[videoUrl] || [];
      byUrl[videoUrl].push({ userId, rate });
    }

    if (textBook) {
      byTextBook[textBook] = byTextBook[textBook] || [];
      byTextBook[textBook].push({ userId, rate });
    }
  }

  const output: Record<string, Record<string, number>> = {};

  for (const [url, list] of Object.entries(byUrl)) {
    const rates: Record<string, number> = {};
    for (const r of list) {
      if (rates[r.userId] !== undefined) {
        rates[r.userId] = Math.round((rates[r.userId] + r.rate) / 2);
      } else {
        rates[r.userId] = r.rate;
      }
    }
    if (Object.keys(rates).length > 0) {
      output[url] = rates;
    }
  }

  for (const [textBook, list] of Object.entries(byTextBook)) {
    const rates: Record<string, number> = {};
    for (const r of list) {
      if (rates[r.userId] !== undefined) {
        rates[r.userId] = Math.round((rates[r.userId] + r.rate) / 2);
      } else {
        rates[r.userId] = r.rate;
      }
    }
    if (Object.keys(rates).length > 0) {
      const key = `__TEXTBOOK__${textBook}`;
      output[key] = rates;
    }
  }

  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`Saved to: ${OUTPUT_PATH}`);
  console.log(`Total resource entries: ${Object.keys(output).length}`);
  console.log(`Total rated student-user pairs: ${Object.values(output).reduce((sum, map) => sum + Object.keys(map).length, 0)}`);
}

extractResourceRates().catch((err) => {
  console.error('Extraction failed:', err);
  process.exit(1);
});
