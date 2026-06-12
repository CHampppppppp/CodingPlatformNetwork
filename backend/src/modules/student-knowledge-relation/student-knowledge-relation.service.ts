import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../shared/utils/prisma.service";
import {
  CreateStudentKnowledgeRelationDto,
  QueryStudentKnowledgeRelationDto,
  SyncRelationsToInteractionsDto,
} from "./student-knowledge-relation.dto";

/**
 * 学生-知识点关联服务
 * 作为学生与知识点关系的权威数据源
 * 创建关联时自动同步到 interactions 表和 student_resource_rates 表
 */

@Injectable()
export class StudentKnowledgeRelationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 查询学生-知识点关联
   */
  async findAll(query: QueryStudentKnowledgeRelationDto) {
    const { studentNodeId, knowledgeNodeId, scenarioCode, page, pageSize } = query;

    let scenarioId: string | undefined;
    if (scenarioCode) {
      const scenario = await this.prisma.learningScenario.findUnique({
        where: { code: scenarioCode },
        select: { id: true },
      });
      if (scenario) scenarioId = scenario.id;
    }

    const where: Prisma.StudentKnowledgeRelationWhereInput = {
      ...(studentNodeId ? { studentNodeId } : {}),
      ...(knowledgeNodeId ? { knowledgeNodeId } : {}),
      ...(scenarioId
        ? {
            studentNode: { scenarioId },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.studentKnowledgeRelation.findMany({
        where,
        include: {
          studentNode: {
            select: {
              id: true,
              displayName: true,
              scenarioId: true,
              schoolId: true,
              gradeId: true,
              classId: true,
            },
          },
          knowledgeNode: {
            select: {
              id: true,
              displayName: true,
              scenarioId: true,
              knowledgeProfile: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.studentKnowledgeRelation.count({ where }),
    ]);

    //  enrichment: 获取学生对该知识点相关资源的评分
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const resourceRelations = await this.prisma.resourceKnowledgeRelation.findMany({
          where: { knowledgeNodeId: item.knowledgeNodeId },
          include: { resource: { select: { id: true, title: true, resourceType: true } } },
        });

        const resourceIds = resourceRelations.map((r) => r.resourceId);
        const rates =
          resourceIds.length > 0
            ? await this.prisma.studentResourceRate.findMany({
                where: {
                  studentId: item.studentNodeId,
                  resourceId: { in: resourceIds },
                },
              })
            : [];

        const rateMap = new Map(rates.map((r) => [r.resourceId, Number(r.rate)]));
        const avgRate =
          rates.length > 0
            ? rates.reduce((sum, r) => sum + Number(r.rate), 0) / rates.length
            : null;

        return {
          ...item,
          resourceRates: resourceRelations.map((rel) => ({
            resourceId: rel.resourceId,
            resourceTitle: rel.resource.title,
            resourceType: rel.resource.resourceType,
            rate: rateMap.get(rel.resourceId) ?? null,
          })),
          acceptanceRate: avgRate != null ? (avgRate / 5) * 100 : null,
        };
      }),
    );

    return {
      data: enrichedItems,
      meta: { page, pageSize, total },
      error: null,
    };
  }

  /**
   * 创建学生-知识点关联
   * 自动副作用：
   * 1. 创建 interaction 记录（如果不存在）
   * 2. 创建/更新资源评分（student_resource_rates）
   */
  async create(dto: CreateStudentKnowledgeRelationDto) {
    const { studentNodeId, knowledgeNodeId, resourceRates } = dto;

    // 1. 验证节点存在且类型正确
    const [studentNode, knowledgeNode] = await Promise.all([
      this.prisma.graphNode.findFirst({
        where: { id: studentNodeId, nodeType: "Student" },
        include: { studentProfile: true },
      }),
      this.prisma.graphNode.findFirst({
        where: { id: knowledgeNodeId, nodeType: "Knowledge" },
      }),
    ]);

    if (!studentNode) {
      throw new BadRequestException("STUDENT_NODE_NOT_FOUND");
    }
    if (!knowledgeNode) {
      throw new BadRequestException("KNOWLEDGE_NODE_NOT_FOUND");
    }
    if (studentNode.scenarioId !== knowledgeNode.scenarioId) {
      throw new BadRequestException("NODE_SCENARIO_MISMATCH");
    }

    // 2. 创建关联（幂等，已存在则返回现有记录）
    const existingRelation = await this.prisma.studentKnowledgeRelation.findUnique({
      where: {
        studentNodeId_knowledgeNodeId: {
          studentNodeId,
          knowledgeNodeId,
        },
      },
    });

    if (existingRelation) {
      await this.upsertResourceRates(studentNodeId, knowledgeNodeId, resourceRates);
      return {
        data: existingRelation,
        meta: { alreadyExisted: true },
        error: null,
      };
    }

    const relation = await this.prisma.studentKnowledgeRelation.create({
      data: { studentNodeId, knowledgeNodeId },
    });

    await this.createInteractionFromRelation(studentNode, knowledgeNode, relation.id);
    await this.upsertResourceRates(studentNodeId, knowledgeNodeId, resourceRates);

    return {
      data: relation,
      meta: null,
      error: null,
    };
  }

  /**
   * 批量将现有关联同步到 interactions 表
   */
  async syncToInteractions(dto: SyncRelationsToInteractionsDto) {
    const { scenarioCode, sessionId: explicitSessionId } = dto;

    let scenarioId: string | undefined;
    if (scenarioCode) {
      const scenario = await this.prisma.learningScenario.findUnique({
        where: { code: scenarioCode },
        select: { id: true },
      });
      if (scenario) scenarioId = scenario.id;
    }

    const where: Prisma.StudentKnowledgeRelationWhereInput = {
      ...(scenarioId ? { studentNode: { scenarioId } } : {}),
    };

    const relations = await this.prisma.studentKnowledgeRelation.findMany({
      where,
      include: {
        studentNode: true,
        knowledgeNode: true,
      },
    });

    let createdCount = 0;
    let duplicateCount = 0;

    for (const relation of relations) {
      try {
        await this.createInteractionFromRelation(
          relation.studentNode,
          relation.knowledgeNode,
          relation.id,
          explicitSessionId,
        );
        createdCount++;
      } catch (error: any) {
        if (error?.code === "P2002") {
          duplicateCount++;
          continue;
        }
        throw error;
      }
    }

    return {
      data: { createdCount, duplicateCount, totalRelations: relations.length },
      meta: null,
      error: null,
    };
  }

  /**
   * 删除关联
   */
  async delete(studentNodeId: string, knowledgeNodeId: string) {
    await this.prisma.studentKnowledgeRelation.delete({
      where: {
        studentNodeId_knowledgeNodeId: {
          studentNodeId,
          knowledgeNodeId,
        },
      },
    });

    return {
      data: null,
      meta: null,
      error: null,
    };
  }

  // ─── 私有辅助方法 ────────────────────────────────

  /**
   * 根据关联创建 interaction 记录
   */
  private async createInteractionFromRelation(
    studentNode: any,
    knowledgeNode: any,
    relationId: string,
    explicitSessionId?: string,
  ) {
    let sessionId = explicitSessionId;

    if (!sessionId) {
      const session = await this.findOrCreateSession(studentNode);
      sessionId = session.id;
    }

    await this.prisma.interaction.create({
      data: {
        sessionId,
        sourceNodeId: studentNode.id,
        targetNodeId: knowledgeNode.id,
        interactionType: "PLATFORM",
        strength: new Prisma.Decimal(1.0),
        actionType: "STUDY",
        relationSourceId: relationId,
      },
    });
  }

  /**
   * 查找或创建 InteractionSession
   */
  private async findOrCreateSession(studentNode: any) {
    // 优先查找已有 session
    const existingSession = await this.prisma.interactionSession.findFirst({
      where: {
        scenarioId: studentNode.scenarioId,
        schoolId: studentNode.schoolId ?? undefined,
        gradeId: studentNode.gradeId ?? undefined,
        classId: studentNode.classId ?? undefined,
      },
      orderBy: { occurredAt: "desc" },
    });

    if (existingSession) {
      return existingSession;
    }

    // 创建新 session
    return this.prisma.interactionSession.create({
      data: {
        scenarioId: studentNode.scenarioId,
        schoolId: studentNode.schoolId || "",
        gradeId: studentNode.gradeId || "",
        classId: studentNode.classId || null,
        sessionName: `${studentNode.displayName} - 知识点学习`,
        occurredAt: new Date(),
      },
    });
  }

  /**
   * 创建或更新资源评分
   * 如果用户未提供评分，则使用默认评分 3.0
   */
  private async upsertResourceRates(
    studentNodeId: string,
    knowledgeNodeId: string,
    explicitRates?: Array<{ resourceId?: string; rate?: number }>,
  ) {
    if (explicitRates && explicitRates.length > 0) {
      // 使用用户提供的评分
      for (const { resourceId, rate } of explicitRates) {
        await this.prisma.studentResourceRate.upsert({
          where: {
            studentId_resourceId: {
              studentId: studentNodeId,
              resourceId,
            },
          },
          update: { rate },
          create: {
            studentId: studentNodeId,
            resourceId,
            rate,
          },
        });
      }
      return;
    }

    // 未提供评分：查找该知识点关联的所有资源，创建默认评分
    const resourceRelations = await this.prisma.resourceKnowledgeRelation.findMany({
      where: { knowledgeNodeId },
      select: { resourceId: true },
    });

    const defaultRate = new Prisma.Decimal(3.0);

    for (const { resourceId } of resourceRelations) {
      try {
        await this.prisma.studentResourceRate.create({
          data: {
            studentId: studentNodeId,
            resourceId,
            rate: defaultRate,
          },
        });
      } catch (error: any) {
        if (error?.code === "P2002") {
          // 已存在，跳过
          continue;
        }
        throw error;
      }
    }
  }
}
