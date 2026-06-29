import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared/utils/prisma.service";
import { OrgService } from "../../org/org.service";
import {
  NormalizedClassGroup,
  NormalizedInteraction,
  NormalizedPlatformData,
  NormalizedResource,
  NormalizedResourceKnowledgeRelation,
  NormalizedStudentKnowledgeRelation,
  NormalizedUser,
} from "../types/normalized-platform-data";

export interface IngestionImportOptions {
  skipWhenScenarioHasNodes?: boolean;
  concurrency?: number;
}

export interface IngestionImportResult {
  skipped: boolean;
  scenarioCode: string;
  schoolCount: number;
  gradeCount: number;
  classCount: number;
  studentCount: number;
  teacherCount: number;
  knowledgeCount: number;
  resourceCount?: number;
  resourceKnowledgeRelationCount?: number;
  sessionCount: number;
  relationCount: number;
  studyInteractionCount: number;
  platformInteractionCount: number;
  duplicateCount: number;
  cognitiveProfileCount: number;
  studentWorkCount: number;
}

type NodeContext = {
  nodeId: string;
  gradeName?: number | null;
  externalSchoolId?: string | null;
  className?: string | null;
};

type ImportMaps = {
  schoolIdByExternalId: Map<string, string>;
  gradeIdByKey: Map<string, string>;
  classIdByKey: Map<string, string>;
  nodeIdByUserExternalId: Map<string, string>;
  nodeIdByKnowledgeExternalId: Map<string, string>;
  resourceIdByExternalId: Map<string, string>;
  studentContextByExternalId: Map<string, NodeContext>;
  sessionIdByExternalId: Map<string, string>;
};

const DEFAULT_CONCURRENCY = 5;

function orgKey(externalSchoolId: string, gradeName: number): string {
  return `${externalSchoolId}:${gradeName}`;
}

function classKey(
  externalSchoolId: string,
  gradeName: number,
  className: string,
): string {
  return `${externalSchoolId}:${gradeName}:${className}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function parallelLimit<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  limit: number,
): Promise<void> {
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      await fn(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
}

@Injectable()
export class IngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgService: OrgService,
  ) {}

  async importPlatformData(
    data: NormalizedPlatformData,
    options: IngestionImportOptions = {},
  ): Promise<IngestionImportResult> {
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    const skipWhenScenarioHasNodes = options.skipWhenScenarioHasNodes ?? true;

    const existing = await this.prisma.learningScenario.findUnique({
      where: { code: data.scenario.code },
      include: { _count: { select: { nodes: true } } },
    });

    if (skipWhenScenarioHasNodes && existing && existing._count.nodes > 0) {
      return this.buildSkippedResult(data);
    }

    const scenario = await this.prisma.learningScenario.upsert({
      where: { code: data.scenario.code },
      update: {
        nameZh: data.scenario.nameZh,
        sortOrder: data.scenario.sortOrder ?? 0,
        isActive: data.scenario.isActive ?? true,
      },
      create: {
        code: data.scenario.code,
        nameZh: data.scenario.nameZh,
        sortOrder: data.scenario.sortOrder ?? 0,
        isActive: data.scenario.isActive ?? true,
      },
    });

    const maps: ImportMaps = {
      schoolIdByExternalId: new Map(),
      gradeIdByKey: new Map(),
      classIdByKey: new Map(),
      nodeIdByUserExternalId: new Map(),
      nodeIdByKnowledgeExternalId: new Map(),
      resourceIdByExternalId: new Map(),
      studentContextByExternalId: new Map(),
      sessionIdByExternalId: new Map(),
    };

    const result: IngestionImportResult = {
      skipped: false,
      scenarioCode: data.scenario.code,
      schoolCount: 0,
      gradeCount: 0,
      classCount: 0,
      studentCount: 0,
      teacherCount: 0,
      knowledgeCount: 0,
      resourceCount: 0,
      resourceKnowledgeRelationCount: 0,
      sessionCount: 0,
      relationCount: 0,
      studyInteractionCount: 0,
      platformInteractionCount: 0,
      duplicateCount: 0,
      cognitiveProfileCount: 0,
      studentWorkCount: 0,
    };

    await this.importSchools(scenario.id, data, maps, result);
    await this.importGradesAndClasses(data.classes, maps, result);
    await this.importUsers(scenario.id, data.users, maps, result, concurrency);
    await this.importKnowledges(
      scenario.id,
      data.knowledges,
      maps,
      result,
      concurrency,
    );
    await this.importResources(
      data.resources,
      maps,
      result,
      concurrency,
    );
    await this.importResourceKnowledgeRelations(
      data.resourceKnowledgeRelations,
      maps,
      result,
      concurrency,
    );
    await this.importSessions(scenario.id, data, maps, result);
    await this.importStudentKnowledgeRelations(
      data.studentKnowledgeRelations,
      maps,
      result,
      concurrency,
    );
    await this.importPlatformInteractions(
      data.interactions,
      maps,
      result,
      concurrency,
    );
    await this.importCognitiveProfiles(
      data.cognitiveProfiles ?? [],
      maps,
      result,
      concurrency,
    );
    await this.importStudentWorks(
      data.studentWorks ?? [],
      maps,
      result,
      concurrency,
    );

    // Invalidate org cache so newly imported schools / grades / classes are visible immediately.
    this.orgService.clearCache();

    return result;
  }

  private buildSkippedResult(data: NormalizedPlatformData): IngestionImportResult {
    return {
      skipped: true,
      scenarioCode: data.scenario.code,
      schoolCount: 0,
      gradeCount: 0,
      classCount: 0,
      studentCount: 0,
      teacherCount: 0,
      knowledgeCount: 0,
      resourceCount: 0,
      resourceKnowledgeRelationCount: 0,
      sessionCount: 0,
      relationCount: 0,
      studyInteractionCount: 0,
      platformInteractionCount: 0,
      duplicateCount: 0,
      cognitiveProfileCount: 0,
      studentWorkCount: 0,
    };
  }

  private async importSchools(
    scenarioId: string,
    data: NormalizedPlatformData,
    maps: ImportMaps,
    result: IngestionImportResult,
  ): Promise<void> {
    for (const school of data.schools) {
      const created = await this.prisma.school.upsert({
        where: {
          scenarioId_name: {
            scenarioId,
            name: school.name,
          },
        },
        update: {},
        create: { scenarioId, name: school.name },
      });
      maps.schoolIdByExternalId.set(school.externalId, created.id);
      result.schoolCount += 1;
    }
  }

  private async importGradesAndClasses(
    classes: NormalizedClassGroup[],
    maps: ImportMaps,
    result: IngestionImportResult,
  ): Promise<void> {
    const seenGrades = new Set<string>();

    for (const item of classes) {
      const schoolId = maps.schoolIdByExternalId.get(item.externalSchoolId);
      if (!schoolId) continue;

      const gradeKey = orgKey(item.externalSchoolId, item.gradeName);
      if (!seenGrades.has(gradeKey)) {
        const grade = await this.prisma.grade.upsert({
          where: {
            schoolId_gradeName: {
              schoolId,
              gradeName: item.gradeName,
            },
          },
          update: {},
          create: {
            schoolId,
            gradeName: item.gradeName,
          },
        });
        maps.gradeIdByKey.set(gradeKey, grade.id);
        seenGrades.add(gradeKey);
        result.gradeCount += 1;
      }

      const gradeId = maps.gradeIdByKey.get(gradeKey);
      if (!gradeId) continue;

      const createdClass = await this.prisma.class.upsert({
        where: {
          gradeId_className: {
            gradeId,
            className: item.className,
          },
        },
        update: {},
        create: {
          gradeId,
          className: item.className,
        },
      });
      maps.classIdByKey.set(
        classKey(item.externalSchoolId, item.gradeName, item.className),
        createdClass.id,
      );
      result.classCount += 1;
    }
  }

  private async importUsers(
    scenarioId: string,
    users: NormalizedUser[],
    maps: ImportMaps,
    result: IngestionImportResult,
    concurrency: number,
  ): Promise<void> {
    await parallelLimit(
      users,
      async (user) => {
        const schoolId = user.externalSchoolId
          ? maps.schoolIdByExternalId.get(user.externalSchoolId)
          : undefined;
        const gradeId =
          user.externalSchoolId && user.gradeName != null
            ? maps.gradeIdByKey.get(orgKey(user.externalSchoolId, user.gradeName))
            : undefined;
        const resolvedClassId =
          user.externalSchoolId && user.gradeName != null && user.className
            ? maps.classIdByKey.get(
                classKey(user.externalSchoolId, user.gradeName, user.className),
              )
            : undefined;

        const node = await this.prisma.graphNode.create({
          data: {
            nodeType: user.role === "STUDENT" ? "Student" : "Teacher",
            displayName: user.displayName,
            scenarioId,
            schoolId,
            gradeId,
            classId: resolvedClassId,
            ...(user.role === "STUDENT"
              ? {
                  studentProfile: {
                    create: {
                      externalUserId: user.externalUserId ?? null,
                      gender: user.gender ?? null,
                      learningStyle: user.learningStyle ?? null,
                      personality: user.personality ?? null,
                      groupBehavior: user.groupBehavior ?? null,
                      aiContentSatisfaction:
                        user.aiContentSatisfaction != null
                          ? String(user.aiContentSatisfaction)
                          : null,
                      resourceHelpfulness:
                        user.resourceHelpfulness != null
                          ? String(user.resourceHelpfulness)
                          : null,
                      posterSatisfaction:
                        user.posterSatisfaction != null
                          ? String(user.posterSatisfaction)
                          : null,
                      teachingPreference:
                        user.teachingPreference != null
                          ? String(user.teachingPreference)
                          : null,
                      helpSource:
                        user.helpSource != null
                          ? String(user.helpSource)
                          : null,
                    },
                  },
                }
              : {
                  teacherProfile: {
                    create: {
                      subject: user.subject ?? null,
                      teachingGrade: user.gradeName ?? null,
                      schoolId,
                      gradeId,
                      classId: resolvedClassId,
                    },
                  },
                }),
          },
        });

        maps.nodeIdByUserExternalId.set(user.externalId, node.id);

        if (user.role === "STUDENT") {
          maps.studentContextByExternalId.set(user.externalId, {
            nodeId: node.id,
            gradeName: user.gradeName,
            externalSchoolId: user.externalSchoolId,
            className: user.className,
          });
          result.studentCount += 1;
        } else {
          if (resolvedClassId) {
            await this.prisma.class.update({
              where: { id: resolvedClassId },
              data: { teacherId: node.id },
            });
          }
          result.teacherCount += 1;
        }
      },
      concurrency,
    );
  }

  private async importKnowledges(
    scenarioId: string,
    knowledges: NormalizedPlatformData["knowledges"],
    maps: ImportMaps,
    result: IngestionImportResult,
    concurrency: number,
  ): Promise<void> {
    await parallelLimit(
      knowledges,
      async (knowledge) => {
        // When the adapter provides an existing knowledge node id as the
        // externalId, reuse that node directly instead of creating a new one.
        // This preserves existing ResourceKnowledgeRelation links.
        const existingNodeId = knowledge.externalId;
        const existingNode = await this.prisma.graphNode.findFirst({
          where: {
            id: existingNodeId,
            nodeType: "Knowledge",
          },
          include: { knowledgeProfile: true },
        });

        if (existingNode) {
          maps.nodeIdByKnowledgeExternalId.set(
            knowledge.externalId,
            existingNode.id,
          );
          result.knowledgeCount += 1;
          return;
        }

        const schoolId = knowledge.externalSchoolId
          ? maps.schoolIdByExternalId.get(knowledge.externalSchoolId)
          : undefined;
        const gradeId =
          knowledge.externalSchoolId && knowledge.gradeName != null
            ? maps.gradeIdByKey.get(
                orgKey(knowledge.externalSchoolId, knowledge.gradeName),
              )
            : undefined;

        const node = await this.prisma.graphNode.create({
          data: {
            nodeType: "Knowledge",
            displayName: knowledge.displayName,
            scenarioId,
            schoolId,
            gradeId,
            knowledgeProfile: {
              create: {
                content: knowledge.content ?? null,
                knowledgeType: knowledge.knowledgeType ?? null,
                category: knowledge.category ?? null,
                scenario: { connect: { id: scenarioId } },
              },
            },
          },
        });

        maps.nodeIdByKnowledgeExternalId.set(knowledge.externalId, node.id);
        result.knowledgeCount += 1;
      },
      concurrency,
    );
  }

  private async importResources(
    resources: NormalizedResource[],
    maps: ImportMaps,
    result: IngestionImportResult,
    concurrency: number,
  ): Promise<void> {
    await parallelLimit(
      resources,
      async (resource) => {
        try {
          const url = resource.url ?? null;
          const created = await this.prisma.resource.create({
            data: {
              title: resource.title,
              description: resource.description ?? null,
              url: url,
              resourceType: resource.resourceType,
              acceptanceRate:
                resource.acceptanceRate != null
                  ? new Prisma.Decimal(resource.acceptanceRate)
                  : null,
            },
          });
          maps.resourceIdByExternalId.set(resource.externalId, created.id);
          result.resourceCount = (result.resourceCount ?? 0) + 1;
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            result.duplicateCount += 1;
            return;
          }
          throw error;
        }
      },
      concurrency,
    );
  }

  private async importResourceKnowledgeRelations(
    relations: NormalizedResourceKnowledgeRelation[],
    maps: ImportMaps,
    result: IngestionImportResult,
    concurrency: number,
  ): Promise<void> {
    await parallelLimit(
      relations,
      async (relation) => {
        const resourceId = maps.resourceIdByExternalId.get(
          relation.resourceExternalId,
        );
        const knowledgeNodeId = maps.nodeIdByKnowledgeExternalId.get(
          relation.knowledgeExternalId,
        );
        if (!resourceId || !knowledgeNodeId) return;

        try {
          await this.prisma.resourceKnowledgeRelation.create({
            data: {
              resourceId,
              knowledgeNodeId,
            },
          });
          result.resourceKnowledgeRelationCount =
            (result.resourceKnowledgeRelationCount ?? 0) + 1;
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            result.duplicateCount += 1;
            return;
          }
          throw error;
        }
      },
      concurrency,
    );
  }

  private async importSessions(
    scenarioId: string,
    data: NormalizedPlatformData,
    maps: ImportMaps,
    result: IngestionImportResult,
  ): Promise<void> {
    for (const session of data.sessions) {
      const schoolId = maps.schoolIdByExternalId.get(session.externalSchoolId);
      const gradeId = maps.gradeIdByKey.get(
        orgKey(session.externalSchoolId, session.gradeName),
      );
      const classId = session.className
        ? maps.classIdByKey.get(
            classKey(session.externalSchoolId, session.gradeName, session.className),
          )
        : undefined;

      if (!schoolId || !gradeId) continue;

      const created = await this.prisma.interactionSession.create({
        data: {
          scenarioId,
          schoolId,
          gradeId,
          classId,
          sessionName: session.sessionName ?? null,
          occurredAt: session.occurredAt,
        },
      });
      maps.sessionIdByExternalId.set(session.externalId, created.id);
      result.sessionCount += 1;
    }
  }

  private async importStudentKnowledgeRelations(
    relations: NormalizedStudentKnowledgeRelation[],
    maps: ImportMaps,
    result: IngestionImportResult,
    concurrency: number,
  ): Promise<void> {
    await parallelLimit(
      relations,
      async (relation) => {
        const studentNodeId = maps.nodeIdByUserExternalId.get(
          relation.studentExternalId,
        );
        const knowledgeNodeId = maps.nodeIdByKnowledgeExternalId.get(
          relation.knowledgeExternalId,
        );
        const sessionId = maps.sessionIdByExternalId.get(relation.sessionExternalId);

        if (!studentNodeId || !knowledgeNodeId || !sessionId) return;

        try {
          await this.prisma.studentKnowledgeRelation.create({
            data: { studentNodeId, knowledgeNodeId },
          });
          result.relationCount += 1;
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            result.duplicateCount += 1;
            return;
          }
          throw error;
        }

        try {
          await this.prisma.interaction.create({
            data: {
              interactionType: "PLATFORM",
              actionType: relation.actionType ?? "STUDY",
              strength: new Prisma.Decimal(relation.strength ?? 1),
              sessionId,
              sourceNodeId: studentNodeId,
              targetNodeId: knowledgeNodeId,
            },
          });
          result.studyInteractionCount += 1;
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            result.duplicateCount += 1;
            return;
          }
          throw error;
        }
      },
      concurrency,
    );
  }

  private async importPlatformInteractions(
    interactions: NormalizedInteraction[],
    maps: ImportMaps,
    result: IngestionImportResult,
    concurrency: number,
  ): Promise<void> {
    await parallelLimit(
      interactions,
      async (interaction) => {
        const sourceNodeId = maps.nodeIdByUserExternalId.get(
          interaction.sourceExternalUserId,
        );
        const targetNodeId = maps.nodeIdByUserExternalId.get(
          interaction.targetExternalUserId,
        );
        const sessionId = maps.sessionIdByExternalId.get(interaction.sessionExternalId);

        if (!sourceNodeId || !targetNodeId || !sessionId) return;

        try {
          await this.prisma.interaction.create({
            data: {
              interactionType: interaction.interactionType,
              actionType: interaction.actionType ?? null,
              strength: new Prisma.Decimal(interaction.strength),
              durationSec: interaction.durationSec ?? null,
              sessionId,
              sourceNodeId,
              targetNodeId,
            },
          });
          result.platformInteractionCount += 1;
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            result.duplicateCount += 1;
            return;
          }
          throw error;
        }
      },
      concurrency,
    );
  }

  private async importCognitiveProfiles(
    profiles: NormalizedPlatformData["cognitiveProfiles"],
    maps: ImportMaps,
    result: IngestionImportResult,
    concurrency: number,
  ): Promise<void> {
    if (!profiles || profiles.length === 0) return;

    await parallelLimit(
      profiles,
      async (profile) => {
        const studentNodeId = maps.nodeIdByUserExternalId.get(
          profile.studentExternalId,
        );
        if (!studentNodeId) return;

        try {
          const created = await this.prisma.studentCognitiveProfile.create({
            data: {
              studentNodeId,
              profileVersion: profile.profileVersion,
              generatedAt: profile.generatedAt,
              totalScore: new Prisma.Decimal(profile.totalScore),
              dimensionScores: {
                create: profile.dimensions.map((d) => ({
                  dimensionCode: d.dimensionCode,
                  scoreValue: new Prisma.Decimal(d.scoreValue),
                  scoreLevel: d.scoreLevel,
                })),
              },
            },
          });
          result.cognitiveProfileCount += 1;
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            result.duplicateCount += 1;
            return;
          }
          throw error;
        }
      },
      concurrency,
    );
  }

  private async importStudentWorks(
    works: NormalizedPlatformData["studentWorks"],
    maps: ImportMaps,
    result: IngestionImportResult,
    concurrency: number,
  ): Promise<void> {
    if (!works || works.length === 0) return;

    await parallelLimit(
      works,
      async (work) => {
        const studentNodeId = maps.nodeIdByUserExternalId.get(
          work.studentExternalId,
        );
        const sessionId = maps.sessionIdByExternalId.get(
          work.sessionExternalId,
        );
        if (!studentNodeId || !sessionId) return;

        const teacherNodeId = work.teacherExternalId
          ? maps.nodeIdByUserExternalId.get(work.teacherExternalId)
          : null;

        try {
          await this.prisma.studentWork.create({
            data: {
              studentNodeId,
              sessionId,
              externalWorkId: work.externalWorkId ?? null,
              workName: work.workName,
              publishedAt: work.publishedAt ?? null,
              themeId: work.themeId ?? null,
              themeName: work.themeName ?? null,
              themeDirectory: work.themeDirectory ?? null,
              textbookName: work.textbookName ?? null,
              likeCount: work.likeCount ?? 0,
              commentCount: work.commentCount ?? 0,
              teacherId: teacherNodeId ?? null,
              teacherScore:
                work.teacherScore != null
                  ? new Prisma.Decimal(work.teacherScore)
                  : null,
              teacherComment: work.teacherComment ?? null,
              likeDetails: work.likeDetails ?? null,
              commentDetails: work.commentDetails ?? null,
              activityLogCount: work.activityLogCount ?? 0,
              activityLogMeta: work.activityLogMeta ?? null,
            },
          });
          result.studentWorkCount += 1;
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            result.duplicateCount += 1;
            return;
          }
          throw error;
        }
      },
      concurrency,
    );
  }
}
