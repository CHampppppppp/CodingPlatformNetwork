export type NormalizedUserRole = "STUDENT" | "TEACHER";

export type NormalizedInteractionType = "PHYSICAL" | "PLATFORM";

export interface NormalizedScenario {
  code: string;
  nameZh: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface NormalizedSchool {
  externalId: string;
  name: string;
}

export interface NormalizedClassGroup {
  externalSchoolId: string;
  gradeName: number;
  className: string;
}

export interface NormalizedUser {
  externalId: string;
  role: NormalizedUserRole;
  displayName: string;
  externalUserId?: string | null;
  externalSchoolId?: string | null;
  gradeName?: number | null;
  className?: string | null;
  subject?: string | null;
}

export interface NormalizedKnowledge {
  externalId: string;
  displayName: string;
  content?: string | null;
  knowledgeType?: string | null;
  category?: string | null;
  externalSchoolId?: string | null;
  gradeName?: number | null;
  gradeNames?: number[];
}

export interface NormalizedSession {
  externalId: string;
  externalSchoolId: string;
  gradeName: number;
  className?: string | null;
  sessionName?: string | null;
  occurredAt: Date;
}

export interface NormalizedStudentKnowledgeRelation {
  studentExternalId: string;
  knowledgeExternalId: string;
  sessionExternalId: string;
  strength?: number;
  actionType?: string;
}

export interface NormalizedInteraction {
  sourceExternalUserId: string;
  targetExternalUserId: string;
  sessionExternalId: string;
  interactionType: NormalizedInteractionType;
  actionType?: string | null;
  strength: number;
  durationSec?: number | null;
}

export interface NormalizedPlatformData {
  scenario: NormalizedScenario;
  schools: NormalizedSchool[];
  classes: NormalizedClassGroup[];
  users: NormalizedUser[];
  knowledges: NormalizedKnowledge[];
  sessions: NormalizedSession[];
  studentKnowledgeRelations: NormalizedStudentKnowledgeRelation[];
  interactions: NormalizedInteraction[];
  sourceStats?: Record<string, number>;
}

export interface PlatformAdapter {
  readonly scenarioCode: string;
  parse(): Promise<NormalizedPlatformData>;
}
