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

    return {
      data: items,
      meta: {
        page,
        pageSize,
        total,
      },
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
