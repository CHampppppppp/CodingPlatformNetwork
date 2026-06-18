import * as https from "https";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const DEEPSEEK_API_HOST = process.env.DEEPSEEK_API_HOST || "api.deepseek.com";
const DEEPSEEK_API_PATH = "/chat/completions";

if (!DEEPSEEK_API_KEY) {
  console.error("DEEPSEEK_API_KEY is not set in environment variables.");
  process.exit(1);
}

const DIFFICULTY_PROMPT = `你是一个初中信息科技内容难度评估专家。请严格按以下标准判断难度等级：

【LOW】
- 只涉及单一操作步骤
- 不需要理解概念之间的联系
- 例如：打开软件、认识界面、输入文字、启动退出

【MEDIUM】
- 需要 2-4 个步骤组合
- 理解基础概念和应用
- 例如：设置文字格式、插入图片、使用常用标签、简单编辑

【HIGH】
- 需要综合多个知识点
- 需要迁移、设计、评价或解决实际问题
- 例如：完成一个完整作品、设计页面布局、评价作品优缺点、综合项目

重要：不要默认选 MEDIUM。如果内容明显是基础操作，选 LOW；如果明显是综合应用，选 HIGH。

知识点内容：
---
{content}
---

只回复一个单词：LOW、MEDIUM 或 HIGH。`;

function callDeepSeek(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 10,
      temperature: 0.1,
    });

    const req = https.request(
      {
        hostname: DEEPSEEK_API_HOST,
        path: DEEPSEEK_API_PATH,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              reject(new Error(`DeepSeek error: ${JSON.stringify(json.error)}`));
              return;
            }
            const text = json.choices?.[0]?.message?.content ?? "";
            resolve(text.trim().toUpperCase());
          } catch (err) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      },
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function normalizeDifficulty(raw: string): "LOW" | "MEDIUM" | "HIGH" {
  const text = raw.trim().toUpperCase();
  if (text.includes("LOW")) return "LOW";
  if (text.includes("HIGH")) return "HIGH";
  return "MEDIUM";
}

function classifyByCategory(category: string): "LOW" | "MEDIUM" | "HIGH" | null {
  if (!category) return null;
  const text = category.toLowerCase();

  const lowPatterns = /基础|认识|启动|退出|界面|简单|输入|打开|初识|简介|什么是|启动与退出|界面认识|基本操作/;
  if (lowPatterns.test(text)) return "LOW";

  const highPatterns = /评价|综合|设计|创新|项目|完善|探究|迁移|优化|解决问题|作品|开发|实现|综合应用|排版布局|美化/;
  if (highPatterns.test(text)) return "HIGH";

  return null;
}

async function classifyContent(content: string): Promise<"LOW" | "MEDIUM" | "HIGH"> {
  const prompt = DIFFICULTY_PROMPT.replace("{content}", content);
  const raw = await callDeepSeek(prompt);
  return normalizeDifficulty(raw);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  const knowledges = await prisma.knowledgeProfile.findMany({
    select: { nodeId: true, content: true, category: true },
  });

  console.log(`Start classifying ${knowledges.length} knowledges...`);

  let ruleCount = 0;
  let llmCount = 0;
  let skipCount = 0;

  for (const [index, knowledge] of knowledges.entries()) {
    const category = knowledge.category?.trim() || "";
    const content = knowledge.content?.trim() || "";

    if (!category && !content) {
      console.log(
        `[${index + 1}/${knowledges.length}] ${knowledge.nodeId} skipped (no content)`,
      );
      skipCount += 1;
      continue;
    }

    try {
      let difficulty: "LOW" | "MEDIUM" | "HIGH";
      let source: "rule" | "llm";

      const categoryResult = classifyByCategory(category);
      if (categoryResult) {
        difficulty = categoryResult;
        source = "rule";
        ruleCount += 1;
      } else {
        difficulty = await classifyContent(content || category);
        source = "llm";
        llmCount += 1;
        await sleep(300);
      }

      await prisma.knowledgeProfile.update({
        where: { nodeId: knowledge.nodeId },
        data: { difficulty },
      });

      console.log(
        `[${index + 1}/${knowledges.length}] ${knowledge.nodeId} -> ${difficulty} (${source})`,
      );
    } catch (err) {
      console.error(
        `[${index + 1}/${knowledges.length}] ${knowledge.nodeId} failed:`,
        err,
      );
    }
  }

  await app.close();
  console.log("Done.");
  console.log(`Rule-based: ${ruleCount}, LLM-based: ${llmCount}, Skipped: ${skipCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
