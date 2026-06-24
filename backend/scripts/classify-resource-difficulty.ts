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

const DIFFICULTY_PROMPT = `你是一个初中信息科技学习资源难度评估专家。请综合资源信息和它关联的知识点难度，判断该资源的难度等级：

资源信息：
- 标题：{title}
- 描述：{description}
- 类型：{resourceType}

关联知识点难度：{relatedDifficulties}

判断标准：
【LOW】
- 只涉及单一操作步骤或基础概念介绍
- 不需要理解概念之间的联系
- 例如：软件界面认识、简单视频讲解、基础文字输入

【MEDIUM】
- 需要 2-4 个步骤组合
- 理解基础概念和应用
- 例如：设置格式、插入元素、跟随教程完成简单任务

【HIGH】
- 需要综合多个知识点
- 需要迁移、设计、评价或解决实际问题
- 例如：综合项目、设计作品、评价优缺点、自主探究任务

重要：不要默认选 MEDIUM。如果内容明显是基础讲解，选 LOW；如果明显是综合应用或探究任务，选 HIGH。

只回复一个单词：LOW、MEDIUM 或 HIGH。`;

function callDeepSeek(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 50,
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
            const message = json.choices?.[0]?.message ?? {};
            const text = message.content || message.reasoning_content || "";
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

function summarizeRelatedDifficulties(
  difficulties: Array<string | null>,
): string {
  const valid = difficulties.filter((d): d is string => Boolean(d));
  if (valid.length === 0) return "无关联知识点";

  const counts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const d of valid) {
    if (d === "LOW" || d === "MEDIUM" || d === "HIGH") {
      counts[d] += 1;
    }
  }

  return `共 ${valid.length} 个关联知识点，难度分布：LOW ${counts.LOW}，MEDIUM ${counts.MEDIUM}，HIGH ${counts.HIGH}`;
}

async function classifyResource(
  title: string,
  description: string | null,
  resourceType: string,
  relatedDifficulties: Array<string | null>,
): Promise<"LOW" | "MEDIUM" | "HIGH"> {
  const prompt = DIFFICULTY_PROMPT
    .replace("{title}", title || "无")
    .replace("{description}", description || "无")
    .replace("{resourceType}", resourceType || "未知")
    .replace(
      "{relatedDifficulties}",
      summarizeRelatedDifficulties(relatedDifficulties),
    );

  const raw = await callDeepSeek(prompt);
  return normalizeDifficulty(raw);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  const resources = await prisma.resource.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      resourceType: true,
      knowledgeRelations: {
        select: {
          knowledgeNode: {
            select: {
              knowledgeProfile: {
                select: { difficulty: true },
              },
            },
          },
        },
      },
    },
  });

  console.log(`Start classifying ${resources.length} resources...`);

  let llmCount = 0;

  for (const [index, resource] of resources.entries()) {
    const title = resource.title?.trim() || "";
    const description = resource.description?.trim() || "";
    const resourceType = resource.resourceType?.trim() || "";

    const relatedDifficulties = resource.knowledgeRelations
      .map((relation) => relation.knowledgeNode?.knowledgeProfile?.difficulty ?? null)
      .filter((d): d is string | null => true);

    try {
      const difficulty = await classifyResource(
        title,
        description,
        resourceType,
        relatedDifficulties,
      );
      llmCount += 1;
      await sleep(300);

      await prisma.resource.update({
        where: { id: resource.id },
        data: { difficulty },
      });

      console.log(
        `[${index + 1}/${resources.length}] ${resource.id} -> ${difficulty} (llm)`,
      );
    } catch (err) {
      console.error(
        `[${index + 1}/${resources.length}] ${resource.id} failed:`,
        err,
      );
    }
  }

  await app.close();
  console.log("Done.");
  console.log(`LLM-based: ${llmCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
