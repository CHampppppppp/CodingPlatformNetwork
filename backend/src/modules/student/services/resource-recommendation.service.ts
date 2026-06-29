import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared/utils/prisma.service";

type DifficultyLevel = "LOW" | "MEDIUM" | "HIGH";
type ActivityLevel = "LOW" | "MEDIUM" | "HIGH";
type ResourceType = "VIDEO" | "ARTICLE" | "PRACTICE" | "GAME" | "DOCUMENT";

interface KnowledgeNodeRef {
  id: string;
  displayName: string;
}

interface ResourceItem {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  resourceType: string;
  difficulty: string | null;
  acceptanceRate: number | null;
  updatedAt: Date;
  knowledgeRelations: Array<{
    knowledgeNode: KnowledgeNodeRef;
  }>;
}

export interface RecommendOptions {
  knowledgeReserveScore: number;
  totalDegree: number;
  limit?: number;
  fallbackToAdjacentDifficulty?: boolean;
}

export interface RecommendedResource {
  id: string;
  title: string;
  description: string | null;
  url: string;
  resourceType: string;
  difficulty: string | null;
  acceptanceRate: number | null;
  knowledgeNodes: Array<{ id: string; name: string }>;
  recommendReason: string;
}

const RESOURCE_TYPES: ResourceType[] = [
  "VIDEO",
  "ARTICLE",
  "PRACTICE",
  "GAME",
  "DOCUMENT",
];

const DIFFICULTY_LEVELS: DifficultyLevel[] = ["LOW", "MEDIUM", "HIGH"];

@Injectable()
export class ResourceRecommendationService {
  constructor(private readonly prisma: PrismaService) {}

  async recommend(options: RecommendOptions): Promise<RecommendedResource[]> {
    const {
      knowledgeReserveScore,
      totalDegree,
      limit = 10,
      fallbackToAdjacentDifficulty = true,
    } = options;

    const difficultyLevel = this.classifyKnowledgeReserve(knowledgeReserveScore);
    const activityLevel = this.classifyActivity(totalDegree);
    const prioritizedTypes = this.getResourceTypesByActivity(activityLevel);

    const pool = await this.buildPool();
    let candidates = this.pickFromPool(
      pool,
      difficultyLevel,
      prioritizedTypes,
    );

    if (fallbackToAdjacentDifficulty && candidates.length < limit) {
      const adjacentDifficulties =
        this.getAdjacentDifficulties(difficultyLevel);
      for (const adjacent of adjacentDifficulties) {
        candidates = [
          ...candidates,
          ...this.pickFromPool(pool, adjacent, prioritizedTypes),
        ];
        if (candidates.length >= limit) break;
      }
    }

    const sorted = this.sortCandidates(candidates).slice(0, limit);

    return sorted.map((resource) =>
      this.enrichResource(resource, difficultyLevel, activityLevel),
    );
  }

  private classifyKnowledgeReserve(score: number): DifficultyLevel {
    const normalized = Math.max(0, Math.min(1, score / 5));
    if (normalized < 1 / 3) return "LOW";
    if (normalized < 2 / 3) return "MEDIUM";
    return "HIGH";
  }

  private classifyActivity(totalDegree: number): ActivityLevel {
    const value = Math.min(5, Math.max(0, totalDegree / 10));
    if (value < 5 / 3) return "LOW";
    if (value < 10 / 3) return "MEDIUM";
    return "HIGH";
  }

  private getResourceTypesByActivity(level: ActivityLevel): ResourceType[] {
    switch (level) {
      case "LOW":
        return ["GAME", "VIDEO"];
      case "MEDIUM":
        return ["VIDEO", "GAME", "PRACTICE"];
      case "HIGH":
        return ["PRACTICE", "DOCUMENT", "ARTICLE"];
    }
  }

  private async buildPool(): Promise<
    Map<DifficultyLevel, Map<ResourceType, ResourceItem[]>>
  > {
    const rawResources = await this.prisma.resource.findMany({
      where: {
        difficulty: { in: DIFFICULTY_LEVELS },
      },
      include: {
        knowledgeRelations: {
          include: {
            knowledgeNode: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    const resources: ResourceItem[] = rawResources.map((r) => ({
      ...r,
      acceptanceRate:
        r.acceptanceRate != null ? Number(r.acceptanceRate) : null,
    }));

    const pool = new Map<DifficultyLevel, Map<ResourceType, ResourceItem[]>>();
    for (const difficulty of DIFFICULTY_LEVELS) {
      const typeMap = new Map<ResourceType, ResourceItem[]>();
      for (const type of RESOURCE_TYPES) {
        typeMap.set(type, []);
      }
      pool.set(difficulty, typeMap);
    }

    for (const resource of resources) {
      const difficulty = (resource.difficulty?.toUpperCase() ??
        "MEDIUM") as DifficultyLevel;
      const type = resource.resourceType as ResourceType;

      const typeMap = pool.get(difficulty);
      if (!typeMap) continue;

      const bucket = typeMap.get(type);
      if (!bucket) continue;

      bucket.push(resource);
    }

    return pool;
  }

  private pickFromPool(
    pool: Map<DifficultyLevel, Map<ResourceType, ResourceItem[]>>,
    difficulty: DifficultyLevel,
    types: ResourceType[],
  ): ResourceItem[] {
    const typeMap = pool.get(difficulty);
    if (!typeMap) return [];

    const result: ResourceItem[] = [];
    for (const type of types) {
      result.push(...(typeMap.get(type) ?? []));
    }
    return result;
  }

  private getAdjacentDifficulties(level: DifficultyLevel): DifficultyLevel[] {
    switch (level) {
      case "LOW":
        return ["MEDIUM", "HIGH"];
      case "MEDIUM":
        return ["LOW", "HIGH"];
      case "HIGH":
        return ["MEDIUM", "LOW"];
    }
  }

  private sortCandidates(resources: ResourceItem[]): ResourceItem[] {
    return [...resources].sort((a, b) => {
      const rateA = a.acceptanceRate ?? 0;
      const rateB = b.acceptanceRate ?? 0;
      if (rateB !== rateA) {
        return rateB - rateA;
      }
      return (
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    });
  }

  private enrichResource(
    resource: ResourceItem,
    difficultyLevel: DifficultyLevel,
    activityLevel: ActivityLevel,
  ): RecommendedResource {
    return {
      id: resource.id,
      title: resource.title,
      description: resource.description,
      url: this.resolveResourceUrl(resource.title, resource.resourceType, resource.url),
      resourceType: resource.resourceType,
      difficulty: resource.difficulty,
      acceptanceRate:
        resource.acceptanceRate != null
          ? (resource.acceptanceRate / 5) * 100
          : null,
      knowledgeNodes: resource.knowledgeRelations.map((rel) => ({
        id: rel.knowledgeNode.id,
        name: rel.knowledgeNode.displayName,
      })),
      recommendReason: `根据你的知识储备水平（${this.difficultyNameZh(difficultyLevel)}）与学习活跃度（${this.activityNameZh(activityLevel)}），推荐${this.difficultyNameZh(difficultyLevel)}难度的${this.resourceTypeNameZh(resource.resourceType)}资源。`,
    };
  }

  private resolveResourceUrl(
    title: string,
    resourceType: string,
    existingUrl: string | null,
  ): string {
    if (existingUrl && !existingUrl.includes("example.com")) {
      return existingUrl;
    }
    return this.buildSearchUrl(title, resourceType);
  }

  private buildSearchUrl(title: string, resourceType: string): string {
    const encoded = encodeURIComponent(title);
    switch (resourceType) {
      case "VIDEO":
        return `https://duckduckgo.com/?q=!ducky+site%3Abilibili.com+${encoded}`;
      case "ARTICLE":
        return `https://duckduckgo.com/?q=!ducky+site%3Azhihu.com+${encoded}`;
      case "DOCUMENT":
        return `https://duckduckgo.com/?q=!ducky+site%3Awenku.baidu.com+${encoded}`;
      default:
        return `https://duckduckgo.com/?q=!ducky+${encoded}`;
    }
  }

  private difficultyNameZh(level: DifficultyLevel): string {
    switch (level) {
      case "LOW":
        return "低";
      case "MEDIUM":
        return "中";
      case "HIGH":
        return "高";
    }
  }

  private activityNameZh(level: ActivityLevel): string {
    switch (level) {
      case "LOW":
        return "低";
      case "MEDIUM":
        return "中";
      case "HIGH":
        return "高";
    }
  }

  private resourceTypeNameZh(type: string): string {
    const map: Record<string, string> = {
      VIDEO: "视频",
      ARTICLE: "文章",
      PRACTICE: "练习",
      GAME: "游戏",
      DOCUMENT: "文档",
    };
    return map[type] ?? type;
  }
}
