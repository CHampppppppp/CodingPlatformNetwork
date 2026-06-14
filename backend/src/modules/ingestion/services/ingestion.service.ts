import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared/utils/prisma.service";
import {
  NormalizedClassGroup,
  NormalizedInteraction,
  NormalizedPlatformData,
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
  sessionCount: number;
  relationCount: number;
  studyInteractionCount: number;
  platformInteractionCount: number;
  duplicateCount: number;
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
  constructor(private readonly prisma: PrismaService) {}

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
      sessionCount: 0,
      relationCount: 0,
      studyInteractionCount: 0,
      platformInteractionCount: 0,
      duplicateCount: 0,
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
      sessionCount: 0,
      relationCount: 0,
      studyInteractionCount: 0,
      platformInteractionCount: 0,
      duplicateCount: 0,
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
}
