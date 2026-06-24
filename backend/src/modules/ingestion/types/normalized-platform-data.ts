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
  gender?: string | null;
  learningStyle?: string | null;
  personality?: string | null;
  groupBehavior?: string | null;
  aiContentSatisfaction?: number | null;
  resourceHelpfulness?: number | null;
  posterSatisfaction?: number | null;
  teachingPreference?: number | null;
  helpSource?: number | null;
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
  resourceExternalId?: string | null;
}

export interface NormalizedResource {
  externalId: string;
  title: string;
  description?: string | null;
  url?: string | null;
  resourceType: "VIDEO" | "ARTICLE" | "PRACTICE" | "GAME" | "DOCUMENT";
  acceptanceRate?: number | null;
}

export interface NormalizedResourceKnowledgeRelation {
  resourceExternalId: string;
  knowledgeExternalId: string;
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

export interface NormalizedCognitiveScore {
  dimensionCode: string;
  scoreValue: number;
  scoreLevel: string;
}

export interface NormalizedCognitiveProfile {
  studentExternalId: string;
  profileVersion: string;
  generatedAt: Date;
  totalScore: number;
  dimensions: NormalizedCognitiveScore[];
}

export interface NormalizedStudentWork {
  studentExternalId: string;
  sessionExternalId: string;
  externalWorkId?: string | null;
  workName: string;
  publishedAt?: Date | null;
  themeId?: string | null;
  themeName?: string | null;
  themeDirectory?: string | null;
  textbookName?: string | null;
  likeCount?: number;
  commentCount?: number;
  teacherExternalId?: string | null;
  teacherScore?: number | null;
  teacherComment?: string | null;
  likeDetails?: string | null;
  commentDetails?: string | null;
  activityLogCount?: number;
  activityLogMeta?: string | null;
}

export interface NormalizedPlatformData {
  scenario: NormalizedScenario;
  schools: NormalizedSchool[];
  classes: NormalizedClassGroup[];
  users: NormalizedUser[];
  knowledges: NormalizedKnowledge[];
  resources: NormalizedResource[];
  resourceKnowledgeRelations: NormalizedResourceKnowledgeRelation[];
  sessions: NormalizedSession[];
  studentKnowledgeRelations: NormalizedStudentKnowledgeRelation[];
  interactions: NormalizedInteraction[];
  cognitiveProfiles?: NormalizedCognitiveProfile[];
  studentWorks?: NormalizedStudentWork[];
  sourceStats?: Record<string, number>;
}

export interface PlatformAdapter {
  readonly scenarioCode: string;
  parse(): Promise<NormalizedPlatformData>;
}
