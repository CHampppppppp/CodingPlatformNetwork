import { z } from "zod";

export const createStudentKnowledgeRelationSchema = z.object({
  studentNodeId: z.string().min(1),
  knowledgeNodeId: z.string().min(1),
  resourceRates: z
    .array(
      z.object({
        resourceId: z.string().min(1),
        rate: z.number().min(0).max(5),
      }),
    )
    .optional(),
});

export const queryStudentKnowledgeRelationSchema = z.object({
  studentNodeId: z.string().optional(),
  knowledgeNodeId: z.string().optional(),
  scenarioCode: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export const syncRelationsToInteractionsSchema = z.object({
  scenarioCode: z.string().optional(),
  sessionId: z.string().optional(),
});

export type CreateStudentKnowledgeRelationDto = z.infer<
  typeof createStudentKnowledgeRelationSchema
>;
export type QueryStudentKnowledgeRelationDto = z.infer<
  typeof queryStudentKnowledgeRelationSchema
>;
export type SyncRelationsToInteractionsDto = z.infer<
  typeof syncRelationsToInteractionsSchema
>;
