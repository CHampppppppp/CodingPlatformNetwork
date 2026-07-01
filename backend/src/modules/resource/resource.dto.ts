import { z } from "zod";

export const resourceTypeSchema = z.enum([
  "VIDEO",
  "ARTICLE",
  "PRACTICE",
  "GAME",
  "DOCUMENT",
]);

export const difficultySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const createResourceSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  resourceType: resourceTypeSchema,
  difficulty: difficultySchema.optional().nullable(),
  acceptanceRate: z.coerce.number().min(0).max(100).optional().nullable(),
  knowledgeNodeIds: z.array(z.string().trim()).optional(),
});

export const queryResourceSchema = z.object({
  resourceType: resourceTypeSchema.optional(),
  knowledgeNodeId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export type CreateResourceDto = z.infer<typeof createResourceSchema>;
export type QueryResourceDto = z.infer<typeof queryResourceSchema>;
