/**
 * 使用 DeepSeek LLM 重建资源与知识点的关联关系。
 * 策略：
 *   1. 优先从候选知识点中选出弱相关或强相关的现有知识点；
 *   2. 若现有知识点均不匹配，则 LLM 生成 1-3 个新知识点；
 *   3. 可选写入数据库（默认 dry-run）。
 *
 * 用法（默认 dry-run）：
 *   DEEPSEEK_API_KEY=sk-xxx npx ts-node scripts/rebuild-resource-knowledge-relations-by-llm.ts --ratio 0.1 --scenario SHOW_CASE
 *
 * 真正写入数据库：
 *   DEEPSEEK_API_KEY=sk-xxx npx ts-node scripts/rebuild-resource-knowledge-relations-by-llm.ts --ratio 0.1 --scenario SHOW_CASE --execute
 *
 * 指定模型：
 *   DEEPSEEK_API_KEY=sk-xxx npx ts-node scripts/rebuild-resource-knowledge-relations-by-llm.ts --model deepseek-v4-pro --ratio 0.1
 */

import * as https from "https";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/shared/utils/prisma.service";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";
const DEEPSEEK_API_HOST = process.env.DEEPSEEK_API_HOST || "api.deepseek.com";
const DEEPSEEK_API_PATH = "/chat/completions";

if (!DEEPSEEK_API_KEY) {
  console.error("DEEPSEEK_API_KEY is not set in environment variables.");
  process.exit(1);
}

interface CandidateKnowledge {
  id: string;
  displayName: string;
  contentSnippet: string;
  difficulty: string | null;
  category: string | null;
}

interface ResourceItem {
  id: string;
  title: string;
  description: string | null;
  resourceType: string;
  difficulty: string | null;
}

interface NewKnowledgeInput {
  displayName: string;
  content: string;
  difficulty: "LOW" | "MEDIUM" | "HIGH";
  category: string;
}

interface LLMMatchResult {
  useExistingIds: string[];
  generateNew: NewKnowledgeInput[];
}

function parseArgs(): {
  ratio: number;
  execute: boolean;
  model: string;
  sample: number | null;
  scenarioCode: string;
} {
  const args = process.argv.slice(2);
  const params: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--") && i + 1 < args.length) {
      params[arg.slice(2)] = args[i + 1];
      i++;
    } else if (arg === "--execute") {
      params.execute = "true";
    }
  }

  const ratio = Math.min(1, Math.max(0, Number(params.ratio ?? params.r ?? 1)));
  const sample = params.sample ? Number(params.sample) : null;
  return {
    ratio: Number.isNaN(ratio) ? 1 : ratio,
    execute: params.execute === "true",
    model: params.model ?? DEEPSEEK_MODEL,
    sample: sample && !Number.isNaN(sample) ? sample : null,
    scenarioCode: params.scenario ?? "SHOW_CASE",
  };
}

function callDeepSeek(prompt: string, model: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
      temperature: 0.3,
      response_format: { type: "json_object" },
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
            resolve(text.trim());
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

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^一-龥a-z0-9]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function buildKeywordSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

function calculateOverlapScore(resource: ResourceItem, knowledge: CandidateKnowledge): number {
  const resourceText = `${resource.title} ${resource.description ?? ""} ${resource.resourceType}`;
  const knowledgeText = `${knowledge.displayName} ${knowledge.contentSnippet} ${knowledge.difficulty ?? ""}`;

  const resourceKeywords = buildKeywordSet(resourceText);
  const knowledgeKeywords = buildKeywordSet(knowledgeText);

  let overlap = 0;
  for (const kw of Array.from(resourceKeywords)) {
    if (knowledgeKeywords.has(kw)) overlap += 1;
  }

  if (resource.difficulty && knowledge.difficulty && resource.difficulty === knowledge.difficulty) {
    overlap += 0.5;
  }

  return overlap;
}

function recallCandidateKnowledges(
  resource: ResourceItem,
  knowledges: CandidateKnowledge[],
  topK = 15,
): CandidateKnowledge[] {
  const scored = knowledges.map((k) => ({
    knowledge: k,
    score: calculateOverlapScore(resource, k),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.knowledge);
}

function buildPrompt(resource: ResourceItem, candidates: CandidateKnowledge[]): string {
  const candidateText = candidates
    .map(
      (k, idx) =>
        `${idx + 1}. ID: ${k.id}\n   名称: ${k.displayName}\n   内容摘要: ${k.contentSnippet}\n   难度: ${k.difficulty ?? "未标注"}`,
    )
    .join("\n");

  return `你是教育资源与知识点匹配专家。请根据资源信息和候选知识点，判断资源应关联的知识点。

资源信息：
- 标题：${resource.title}
- 描述：${resource.description || "无"}
- 类型：${resource.resourceType}
- 难度：${resource.difficulty || "未标注"}

候选知识点：
${candidateText}

请输出 JSON，格式如下：
{
  "useExistingIds": ["现有知识点ID1", "现有知识点ID2"],
  "generateNew": [
    {
      "displayName": "新知识点名称",
      "content": "新知识点内容描述（50字以内）",
      "difficulty": "LOW|MEDIUM|HIGH",
      "category": "类别，如信息技术、编程、办公软件等"
    }
  ]
}

规则：
1. useExistingIds 最多 3 个，优先从候选知识点中选择与该资源弱相关或强相关的知识点。如果没有合适的，可为空数组。
2. 如果候选知识点均不合适，请在 generateNew 中生成 1-3 个贴合该资源主题的新知识点。useExistingIds 和 generateNew 至少有一个非空。
3. 新知识点的 displayName 要简洁、具体，不要和资源标题完全相同。
4. 只输出 JSON，不要任何解释。`;
}

function parseLLMResponse(response: string): LLMMatchResult {
  try {
    const parsed = JSON.parse(response) as Partial<LLMMatchResult>;
    return {
      useExistingIds: Array.isArray(parsed.useExistingIds) ? parsed.useExistingIds : [],
      generateNew: Array.isArray(parsed.generateNew) ? parsed.generateNew : [],
    };
  } catch {
    return { useExistingIds: [], generateNew: [] };
  }
}

function normalizeDifficulty(raw: string): "LOW" | "MEDIUM" | "HIGH" | null {
  const text = raw.trim().toUpperCase();
  if (text === "LOW" || text === "MEDIUM" || text === "HIGH") return text;
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { ratio, execute, model, sample, scenarioCode } = parseArgs();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);

  try {
    const scenario = await prisma.learningScenario.findFirst({
      where: { code: scenarioCode },
    });
    if (!scenario) {
      console.error(`场景 ${scenarioCode} 不存在`);
      process.exit(1);
    }

    const resources = await prisma.resource.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        resourceType: true,
        difficulty: true,
      },
    });

    const knowledgeNodes = await prisma.graphNode.findMany({
      where: { nodeType: "Knowledge" },
      select: {
        id: true,
        displayName: true,
        knowledgeProfile: {
          select: {
            content: true,
            category: true,
            difficulty: true,
          },
        },
      },
    });

    const knowledges: CandidateKnowledge[] = knowledgeNodes.map((node) => ({
      id: node.id,
      displayName: node.displayName,
      contentSnippet: (node.knowledgeProfile?.content ?? "").slice(0, 200),
      difficulty: node.knowledgeProfile?.difficulty ?? null,
      category: node.knowledgeProfile?.category ?? null,
    }));

    console.log(`资源总数: ${resources.length}`);
    console.log(`知识点总数: ${knowledges.length}`);

    let selectedResources: ResourceItem[];
    if (sample && sample > 0) {
      selectedResources = resources.slice(0, sample);
      console.log(`采样模式：处理前 ${sample} 条资源`);
    } else {
      const count = Math.max(1, Math.round(resources.length * ratio));
      selectedResources = resources.slice(0, count);
      console.log(`按 ratio=${ratio} 处理前 ${count} 条资源`);
    }

    console.log(`目标场景: ${scenarioCode} (${scenario.nameZh})`);
    console.log(`模式: ${execute ? "执行写入" : "演练模式（不写入数据库）"}`);
    console.log(`模型: ${model}\n`);

    const relationsToCreate: { resourceId: string; knowledgeNodeId: string }[] = [];
    const newKnowledges: { resourceId: string; input: NewKnowledgeInput }[] = [];
    let llmCallCount = 0;

    for (let index = 0; index < selectedResources.length; index++) {
      const resource = selectedResources[index];
      const candidates = recallCandidateKnowledges(resource, knowledges, 15);

      const prompt = buildPrompt(resource, candidates);
      let response: string;
      try {
        response = await callDeepSeek(prompt, model);
        llmCallCount += 1;
      } catch (err) {
        console.error(`[${index + 1}/${selectedResources.length}] ${resource.id} LLM 调用失败:`, err);
        continue;
      }

      const result = parseLLMResponse(response);
      const validExistingIds = result.useExistingIds.filter((id) =>
        knowledges.some((k) => k.id === id),
      );
      const validNewInputs = result.generateNew.filter(
        (k): k is NewKnowledgeInput =>
          Boolean(k?.displayName?.trim()) && Boolean(k?.content?.trim()),
      );

      console.log(
        `[${index + 1}/${selectedResources.length}] ${resource.title.slice(0, 40)} -> 现有 ${validExistingIds.length} 个, 新生成 ${validNewInputs.length} 个`,
      );

      for (const knowledgeId of validExistingIds) {
        relationsToCreate.push({ resourceId: resource.id, knowledgeNodeId: knowledgeId });
      }

      for (const input of validNewInputs) {
        newKnowledges.push({ resourceId: resource.id, input });
      }

      await sleep(300);
    }

    console.log(`\nLLM 调用次数: ${llmCallCount}`);
    console.log(`复用现有知识点关系数: ${relationsToCreate.length}`);
    console.log(`待生成新知识点数: ${newKnowledges.length}`);

    if (execute) {
      const resourceIdsInScope = new Set(selectedResources.map((r) => r.id));
      await prisma.resourceKnowledgeRelation.deleteMany({
        where: { resourceId: { in: Array.from(resourceIdsInScope) } },
      });

      const newKnowledgeNodeIds = new Map<string, string>();
      for (const { resourceId, input } of newKnowledges) {
        const node = await prisma.graphNode.create({
          data: {
            nodeType: "Knowledge",
            displayName: input.displayName.trim(),
            scenarioId: scenario.id,
            knowledgeProfile: {
              create: {
                content: input.content.trim(),
                category: input.category?.trim() || null,
                difficulty: normalizeDifficulty(input.difficulty),
                scenario: { connect: { id: scenario.id } },
              },
            },
          },
        });
        newKnowledgeNodeIds.set(`${resourceId}:${input.displayName}`, node.id);
        relationsToCreate.push({ resourceId, knowledgeNodeId: node.id });
      }

      if (relationsToCreate.length > 0) {
        await prisma.resourceKnowledgeRelation.createMany({
          data: relationsToCreate,
          skipDuplicates: true,
        });
      }

      console.log(`\n已写入 ${relationsToCreate.length} 条关系到 resource_knowledge_relations_test`);
      console.log(`已生成 ${newKnowledges.length} 个新知识点`);
    } else {
      console.log("\n这是演练模式，未写入数据库。如需写入，请加 --execute。");
      console.log("\n复用现有知识点关系预览（前 10 条）:");
      for (const rel of relationsToCreate.slice(0, 10)) {
        const k = knowledges.find((item) => item.id === rel.knowledgeNodeId);
        console.log(`  ${rel.resourceId} -> ${rel.knowledgeNodeId} (${k?.displayName ?? "未知"})`);
      }
      console.log("\n待生成新知识点预览（前 10 个）:");
      for (const { resourceId, input } of newKnowledges.slice(0, 10)) {
        console.log(`  ${resourceId} -> ${input.displayName} [${input.difficulty}] (${input.category})`);
        console.log(`    ${input.content}`);
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
