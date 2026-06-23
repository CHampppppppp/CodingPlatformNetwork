import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../shared/utils/prisma.service";
import { CreateResourceDto, QueryResourceDto } from "./resource.dto";

@Injectable()
export class ResourceService {
  constructor(private readonly prisma: PrismaService) {}

  async queryResources(query: QueryResourceDto) {
    const { resourceType, knowledgeNodeId, page, pageSize } = query;

    const where: Prisma.ResourceWhereInput = {
      ...(resourceType ? { resourceType } : {}),
      ...(knowledgeNodeId
        ? {
            knowledgeRelations: {
              some: { knowledgeNodeId },
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.resource.findMany({
        where,
        include: {
          knowledgeRelations: {
            include: {
              knowledgeNode: {
                select: {
                  id: true,
                  displayName: true,
                  knowledgeProfile: {
                    select: {
                      category: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.resource.count({ where }),
    ]);

    const resourceIds = items.map((item) => item.id);

    const rates = await this.prisma.studentResourceRate.findMany({
      where: { resourceId: { in: resourceIds } },
      select: { resourceId: true, rate: true },
    });

    const rateAgg = new Map<string, { sum: number; count: number }>();
    for (const r of rates) {
      const prev = rateAgg.get(r.resourceId) ?? { sum: 0, count: 0 };
      prev.sum += Number(r.rate);
      prev.count += 1;
      rateAgg.set(r.resourceId, prev);
    }

    const enrichedItems = items.map((item) => {
      const agg = rateAgg.get(item.id);
      const avgRate = agg ? agg.sum / agg.count : null;
      return {
        ...item,
        acceptanceRate: avgRate != null ? (avgRate / 5) * 100 : null,
      };
    });

    return {
      data: enrichedItems,
      meta: {
        page,
        pageSize,
        total,
      },
      error: null,
    };
  }

  async getResourceStudentRates(resourceId: string, studentIds?: string[], limit = 500) {
    const where: Prisma.StudentResourceRateWhereInput = { resourceId };
    
    if (studentIds && studentIds.length > 0) {
      where.studentId = { in: studentIds };
    }
    
    const rates = await this.prisma.studentResourceRate.findMany({
      where,
      select: { studentId: true, rate: true },
      take: limit,
    });

    const matchedRates: Record<string, number> = {};
    for (const r of rates) {
      matchedRates[r.studentId] = Number(r.rate);
    }

    return {
      data: matchedRates,
      meta: { count: Object.keys(matchedRates).length },
      error: null,
    };
  }

  async createResource(dto: CreateResourceDto) {
    const created = await this.prisma.$transaction(async (tx) => {
      const resource = await tx.resource.create({
        data: {
          title: dto.title,
          description: dto.description ?? null,
          url: dto.url ?? null,
          resourceType: dto.resourceType,
          acceptanceRate: dto.acceptanceRate ?? null,
        },
      });

      if (dto.knowledgeNodeIds && dto.knowledgeNodeIds.length > 0) {
        await tx.resourceKnowledgeRelation.createMany({
          data: dto.knowledgeNodeIds.map((knowledgeNodeId) => ({
            resourceId: resource.id,
            knowledgeNodeId,
          })),
        });
      }

      return tx.resource.findUnique({
        where: { id: resource.id },
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
    });

    return {
      data: created,
      meta: null,
      error: null,
    };
  }
}
