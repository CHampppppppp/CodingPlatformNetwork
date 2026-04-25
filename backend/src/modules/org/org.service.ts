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

    const where: any = {
      OR: [
        { nodeType: "Student" },
        { nodeType: "Teacher" }
      ],
      schoolId: { not: null }
    };
    if (scenarioId) {
      where.scenarioId = scenarioId;
    }

    const schoolIds = await this.prisma.graphNode.findMany({
      where,
      distinct: ['schoolId'],
      select: { schoolId: true }
    }).then(nodes => nodes.map(node => node.schoolId).filter(Boolean) as string[]);

    const schools = await this.prisma.school.findMany({
      where: {
        id: { in: schoolIds }
      },
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

    const scenarioId = await resolveScenarioId(this.prisma, scenarioCode);

    const where: any = {
      OR: [{ nodeType: "Student" }, { nodeType: "Teacher" }],
      schoolId,
      gradeId: { not: null },
    };
    if (scenarioId) {
      where.scenarioId = scenarioId;
    }

    const gradeIds = await this.prisma.graphNode.findMany({
      where,
      distinct: ["gradeId"],
      select: { gradeId: true },
    }).then(nodes => nodes.map(node => node.gradeId).filter(Boolean) as string[]);

    const grades = await this.prisma.grade.findMany({
      where: {
        schoolId,
        id: { in: gradeIds },
      },
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

    const scenarioId = await resolveScenarioId(this.prisma, scenarioCode);

    const where: any = {
      OR: [{ nodeType: "Student" }, { nodeType: "Teacher" }],
      gradeId,
      classId: { not: null },
    };
    if (scenarioId) {
      where.scenarioId = scenarioId;
    }

    const classIds = await this.prisma.graphNode.findMany({
      where,
      distinct: ["classId"],
      select: { classId: true },
    }).then(nodes => nodes.map(node => node.classId).filter(Boolean) as string[]);

    const classes = await this.prisma.schoolClass.findMany({
      where: {
        gradeId,
        id: { in: classIds },
      },
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

    const nodeWhere: any = {
      OR: [{ nodeType: "Student" }, { nodeType: "Teacher" }],
      schoolId: { not: null },
    };
    if (scenarioId) {
      nodeWhere.scenarioId = scenarioId;
    }

    const schoolIds = await this.prisma.graphNode.findMany({
      where: nodeWhere,
      distinct: ["schoolId"],
      select: { schoolId: true },
    }).then(nodes => nodes.map(node => node.schoolId).filter(Boolean) as string[]);

    const gradeIds = await this.prisma.graphNode.findMany({
      where: {
        ...nodeWhere,
        gradeId: { not: null },
      },
      distinct: ["gradeId"],
      select: { gradeId: true },
    }).then(nodes => nodes.map(node => node.gradeId).filter(Boolean) as string[]);

    const classIds = await this.prisma.graphNode.findMany({
      where: {
        ...nodeWhere,
        classId: { not: null },
      },
      distinct: ["classId"],
      select: { classId: true },
    }).then(nodes => nodes.map(node => node.classId).filter(Boolean) as string[]);

    const schools = await this.prisma.school.findMany({
      where: {
        id: { in: schoolIds }
      },
      select: {
        id: true,
        name: true,
        grades: {
          where: {
            id: { in: gradeIds }
          },
          select: {
            id: true,
            gradeName: true,
            classes: {
              where: {
                id: { in: classIds }
              },
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
