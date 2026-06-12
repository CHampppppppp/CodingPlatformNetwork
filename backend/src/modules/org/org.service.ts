import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../shared/utils/prisma.service";

async function resolveScenarioId(prisma: PrismaService, code?: string): Promise<string | undefined> {
  if (!code) return undefined;
  const scenario = await prisma.learningScenario.findUnique({
    where: { code },
    select: { id: true },
  });
  return scenario?.id;
}

interface CacheItem {
  data: any;
  timestamp: number;
  ttl: number;
}

class MemoryCache {
  private cache: Map<string, CacheItem> = new Map();

  get(key: string): any {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  set(key: string, data: any, ttl: number = 3600000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: string): void {
    this.cache.delete(key);
  }
}

@Injectable()
export class OrgService {
  private cache = new MemoryCache();
  private readonly CACHE_TTL = 3600000; // 1 hour

  constructor(private readonly prisma: PrismaService) {}

  async getSchools(scenarioCode?: string) {
    const cacheKey = scenarioCode ? `schools:${scenarioCode}` : 'schools';
    const cachedData = this.cache.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const scenarioId = await resolveScenarioId(this.prisma, scenarioCode);

    const schools = await this.prisma.school.findMany({
      where: scenarioId ? { scenarioId } : {},
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const result = {
      data: schools,
      meta: null,
      error: null,
    };

    this.cache.set(cacheKey, result, this.CACHE_TTL);
    return result;
  }

  async getGrades(schoolId: string, scenarioCode?: string) {
    const cacheKey = scenarioCode
      ? `grades:${schoolId}:${scenarioCode}`
      : `grades:${schoolId}`;
    const cachedData = this.cache.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const grades = await this.prisma.grade.findMany({
      where: { schoolId },
      select: {
        id: true,
        gradeName: true,
      },
      orderBy: { gradeName: "asc" },
    });

    const result = {
      data: grades,
      meta: null,
      error: null,
    };

    this.cache.set(cacheKey, result, this.CACHE_TTL);
    return result;
  }

  async getClasses(gradeId: string, scenarioCode?: string) {
    const cacheKey = scenarioCode
      ? `classes:${gradeId}:${scenarioCode}`
      : `classes:${gradeId}`;
    const cachedData = this.cache.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const classes = await this.prisma.class.findMany({
      where: { gradeId },
      select: {
        id: true,
        className: true,
      },
      orderBy: { className: "asc" },
    });

    const result = {
      data: classes,
      meta: null,
      error: null,
    };

    this.cache.set(cacheKey, result, this.CACHE_TTL);
    return result;
  }

  async getOrgHierarchy(scenarioCode?: string) {
    const cacheKey = scenarioCode
      ? `org:hierarchy:${scenarioCode}`
      : 'org:hierarchy';
    const cachedData = this.cache.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const scenarioId = await resolveScenarioId(this.prisma, scenarioCode);

    const schools = await this.prisma.school.findMany({
      where: scenarioId ? { scenarioId } : {},
      select: {
        id: true,
        name: true,
        grades: {
          select: {
            id: true,
            gradeName: true,
            classes: {
              select: {
                id: true,
                className: true
              },
              orderBy: { className: "asc" }
            }
          },
          orderBy: { gradeName: "asc" }
        }
      },
      orderBy: { name: "asc" }
    });

    const result = {
      data: schools,
      meta: null,
      error: null,
    };

    this.cache.set(cacheKey, result, this.CACHE_TTL);
    return result;
  }
}
