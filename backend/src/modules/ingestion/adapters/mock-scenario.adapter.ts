import {
  NormalizedClassGroup,
  NormalizedCognitiveProfile,
  NormalizedCognitiveScore,
  NormalizedInteraction,
  NormalizedKnowledge,
  NormalizedPlatformData,
  NormalizedScenario,
  NormalizedSchool,
  NormalizedSession,
  NormalizedStudentKnowledgeRelation,
  NormalizedUser,
  PlatformAdapter,
} from "../types/normalized-platform-data";

/**
 * Configuration options for the mock scenario adapter.
 */
export interface MockScenarioOptions {
  schoolCount?: number;
  classesPerSchool?: number;
  minStudentsPerClass?: number;
  maxStudentsPerClass?: number;
  knowledgesCount?: number;
  sessionsPerClass?: number;
  seed?: number;
}

interface ClassDef {
  externalSchoolId: string;
  gradeName: number;
  className: string;
}

interface StudentDef {
  externalId: string;
  displayName: string;
  gender: string;
  externalSchoolId: string;
  gradeName: number;
  className: string;
}

interface TeacherDef {
  externalId: string;
  displayName: string;
  subject: string;
  externalSchoolId: string;
  gradeName: number;
  className: string;
}

/**
 * Linear congruential generator (LCG) for reproducible local random numbers.
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  /** Returns a float in the range [0, 1). */
  next(): number {
    this.seed = (1103515245 * this.seed + 12345) >>> 0;
    return this.seed / 4294967296;
  }

  /** Returns an integer in the range [min, max]. */
  nextInt(min: number, max: number): number {
    if (min > max) {
      throw new RangeError(`min (${min}) must not be greater than max (${max})`);
    }
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Picks a random element from the given array. */
  pick<T>(items: T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty array");
    }
    return items[this.nextInt(0, items.length - 1)];
  }

  /** Returns true with the given probability. */
  chance(probability: number): boolean {
    return this.next() < probability;
  }
}

const SCENARIO_META: Record<
  string,
  Pick<NormalizedScenario, "nameZh" | "sortOrder">
> = {
  TEACHER_QA: {
    nameZh: "课后线上教师授课答疑",
    sortOrder: 2,
  },
  HOME_LEARNING: {
    nameZh: "家庭在线学习",
    sortOrder: 3,
  },
};

const SCHOOL_NAMES: Record<string, string[]> = {
  TEACHER_QA: ["三门县实验学校", "杭州市答疑实验中学"],
  HOME_LEARNING: ["杭州市星洲小学", "竺可桢学校"],
};

const GRADE_POOL = [3, 4, 5, 6, 7, 8, 9];

const SUBJECTS = ["语文", "数学", "英语", "科学"];

const GENDERS = ["男", "女"];

const KNOWLEDGE_TEMPLATES: Array<{
  displayName: string;
  category: string;
  content: string;
}> = [
  {
    displayName: "古诗词阅读理解",
    category: "语文",
    content: "通过朗读与赏析，理解古诗词的意境与情感表达。",
  },
  {
    displayName: "分数加减法",
    category: "数学",
    content: "掌握异分母分数通分与加减运算的基本方法。",
  },
  {
    displayName: "一般现在时",
    category: "英语",
    content: "学习一般现在时的构成与日常用法。",
  },
  {
    displayName: "植物的光合作用",
    category: "科学",
    content: "了解绿色植物利用光能制造有机物的过程。",
  },
  {
    displayName: "循环结构与算法",
    category: "信息技术",
    content: "理解 for 与 while 循环的基本结构与适用场景。",
  },
  {
    displayName: "记叙文写作",
    category: "语文",
    content: "学习按时间顺序组织材料，写清楚一件事。",
  },
  {
    displayName: "方程与未知数",
    category: "数学",
    content: "认识一元一次方程，学会列方程解应用题。",
  },
  {
    displayName: "日常交际用语",
    category: "英语",
    content: "掌握问候、介绍、感谢等常见交际表达。",
  },
  {
    displayName: "力与运动",
    category: "科学",
    content: "理解力的作用效果及牛顿第一定律的初步概念。",
  },
  {
    displayName: "网络信息安全",
    category: "信息技术",
    content: "了解密码保护、个人信息防护等网络安全常识。",
  },
];

const DIMENSION_CODES = [
  "knowledgeReserve",
  "learningMotivation",
  "learningAttitude",
  "learningEngagement",
  "selfRegulatedLearning",
  "computationalThinking",
  "learningMethod",
  "cognitiveLoad",
  "humanAiTrust",
  "aiLiteracy",
];

const SURNAMES = [
  "王",
  "李",
  "张",
  "刘",
  "陈",
  "杨",
  "黄",
  "赵",
  "吴",
  "周",
  "徐",
  "孙",
  "马",
  "朱",
  "胡",
  "郭",
  "何",
  "高",
  "林",
  "罗",
];

const GIVEN_NAMES = [
  "子轩",
  "梓涵",
  "雨桐",
  "浩然",
  "诗涵",
  "宇轩",
  "欣怡",
  "博文",
  "梦瑶",
  "俊杰",
  "佳怡",
  "晨曦",
  "睿哲",
  "雅琪",
  "梓豪",
  "可馨",
  "天佑",
  "思涵",
  "明轩",
  "语嫣",
  "子墨",
  "依诺",
  "浩宇",
  "欣妍",
  "奕辰",
  "雨泽",
  "若曦",
  "景行",
  "瑾瑜",
  "书瑶",
];

function resolveScoreLevel(score: number): string {
  if (score >= 80) return "高";
  if (score >= 60) return "中";
  return "低";
}

function padTwo(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Generates complete NormalizedPlatformData for the two missing scenarios
 * TEACHER_QA and HOME_LEARNING.
 */
export class MockScenarioAdapter implements PlatformAdapter {
  readonly scenarioCode: string;

  private readonly options: Required<MockScenarioOptions>;
  private readonly rng: SeededRandom;

  constructor(
    scenarioCode: "TEACHER_QA" | "HOME_LEARNING",
    options: MockScenarioOptions = {},
  ) {
    this.scenarioCode = scenarioCode;
    this.options = {
      schoolCount: options.schoolCount ?? 2,
      classesPerSchool: options.classesPerSchool ?? 3,
      minStudentsPerClass: options.minStudentsPerClass ?? 20,
      maxStudentsPerClass: options.maxStudentsPerClass ?? 40,
      knowledgesCount: options.knowledgesCount ?? 10,
      sessionsPerClass: options.sessionsPerClass ?? 1,
      seed: options.seed ?? 42,
    };
    this.rng = new SeededRandom(this.options.seed);
  }

  async parse(): Promise<NormalizedPlatformData> {
    const scenario = this.buildScenario();
    const schools = this.buildSchools();
    const classes = this.buildClasses(schools);
    const knowledges = this.buildKnowledges();

    const { students, teachers, users } = this.buildUsers(classes);
    const sessions = this.buildSessions(classes, schools);

    const studentKnowledgeRelations =
      this.buildStudentKnowledgeRelations(students, sessions, knowledges);
    const interactions = this.buildInteractions(
      students,
      teachers,
      sessions,
    );
    const cognitiveProfiles = this.buildCognitiveProfiles(students);

    return {
      scenario,
      schools,
      classes,
      users,
      knowledges,
      resources: [],
      resourceKnowledgeRelations: [],
      sessions,
      studentKnowledgeRelations,
      interactions,
      cognitiveProfiles,
      studentWorks: [],
      sourceStats: {
        schoolCount: schools.length,
        classCount: classes.length,
        studentCount: students.length,
        teacherCount: teachers.length,
        knowledgeCount: knowledges.length,
        sessionCount: sessions.length,
        interactionCount: interactions.length,
        cognitiveProfileCount: cognitiveProfiles.length,
      },
    };
  }

  private buildScenario(): NormalizedScenario {
    const meta = SCENARIO_META[this.scenarioCode];
    if (!meta) {
      throw new Error(`Unsupported scenario code: ${this.scenarioCode}`);
    }
    return {
      code: this.scenarioCode,
      nameZh: meta.nameZh,
      sortOrder: meta.sortOrder,
      isActive: true,
    };
  }

  private buildSchools(): NormalizedSchool[] {
    const names = SCHOOL_NAMES[this.scenarioCode];
    const count = Math.min(this.options.schoolCount, names.length);
    const schools: NormalizedSchool[] = [];
    for (let i = 0; i < count; i++) {
      schools.push({
        externalId: `${this.scenarioCode.toLowerCase()}_school_${i + 1}`,
        name: names[i],
      });
    }
    return schools;
  }

  private buildClasses(schools: NormalizedSchool[]): NormalizedClassGroup[] {
    const classes: NormalizedClassGroup[] = [];
    const maxClasses = Math.max(2, this.options.classesPerSchool);

    const counts: number[] = [];
    for (const school of schools) {
      const classCount = this.rng.nextInt(2, maxClasses);
      counts.push(classCount);
    }

    // Keep the total number of classes per scenario between 4 and 6.
    let totalClasses = counts.reduce((sum, c) => sum + c, 0);
    while (totalClasses < 4) {
      const candidates = counts
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => c < maxClasses);
      if (candidates.length === 0) break;
      const picked = this.rng.pick(candidates);
      counts[picked.i]++;
      totalClasses++;
    }
    while (totalClasses > 6) {
      const candidates = counts
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => c > 2);
      if (candidates.length === 0) break;
      const picked = this.rng.pick(candidates);
      counts[picked.i]--;
      totalClasses--;
    }

    for (let s = 0; s < schools.length; s++) {
      const school = schools[s];
      const classCount = counts[s];
      for (let i = 0; i < classCount; i++) {
        const gradeName = this.rng.pick(GRADE_POOL);
        const classNumber = i + 1;
        const className = `${classNumber}班`;
        classes.push({
          externalSchoolId: school.externalId,
          gradeName,
          className,
        });
      }
    }
    return classes;
  }

  private buildUsers(classes: NormalizedClassGroup[]): {
    students: StudentDef[];
    teachers: TeacherDef[];
    users: NormalizedUser[];
  } {
    const students: StudentDef[] = [];
    const teachers: TeacherDef[] = [];
    const users: NormalizedUser[] = [];

    for (const cls of classes) {
      const classKey = this.buildClassKey(
        cls.externalSchoolId,
        cls.gradeName,
        cls.className,
      );
      const teacherExternalId = `${classKey}:teacher`;
      const subject = this.rng.pick(SUBJECTS);
      const teacherDisplayName = `${cls.className}老师`;

      const teacher: TeacherDef = {
        externalId: teacherExternalId,
        displayName: teacherDisplayName,
        subject,
        externalSchoolId: cls.externalSchoolId,
        gradeName: cls.gradeName,
        className: cls.className,
      };
      teachers.push(teacher);
      users.push({
        externalId: teacher.externalId,
        role: "TEACHER",
        displayName: teacher.displayName,
        externalUserId: null,
        externalSchoolId: teacher.externalSchoolId,
        gradeName: teacher.gradeName,
        className: teacher.className,
        subject: teacher.subject,
        gender: null,
        learningStyle: null,
        personality: null,
        groupBehavior: null,
        aiContentSatisfaction: null,
        resourceHelpfulness: null,
        posterSatisfaction: null,
        teachingPreference: null,
        helpSource: null,
      });

      const studentCount = this.rng.nextInt(
        this.options.minStudentsPerClass,
        this.options.maxStudentsPerClass,
      );

      for (let i = 1; i <= studentCount; i++) {
        const externalId = `${classKey}:s${padTwo(i)}`;
        const displayName = this.generateName();
        const gender = this.rng.pick(GENDERS);

        const student: StudentDef = {
          externalId,
          displayName,
          gender,
          externalSchoolId: cls.externalSchoolId,
          gradeName: cls.gradeName,
          className: cls.className,
        };
        students.push(student);
        users.push({
          externalId: student.externalId,
          role: "STUDENT",
          displayName: student.displayName,
          externalUserId: student.externalId,
          externalSchoolId: student.externalSchoolId,
          gradeName: student.gradeName,
          className: student.className,
          subject: null,
          gender: student.gender,
          learningStyle: null,
          personality: null,
          groupBehavior: null,
          aiContentSatisfaction: null,
          resourceHelpfulness: null,
          posterSatisfaction: null,
          teachingPreference: null,
          helpSource: null,
        });
      }
    }

    return { students, teachers, users };
  }

  private generateName(): string {
    const surname = this.rng.pick(SURNAMES);
    const givenName = this.rng.pick(GIVEN_NAMES);
    return `${surname}${givenName}`;
  }

  private buildKnowledges(): NormalizedKnowledge[] {
    const count = this.options.knowledgesCount;
    const knowledges: NormalizedKnowledge[] = [];
    for (let i = 1; i <= count; i++) {
      const template = KNOWLEDGE_TEMPLATES[(i - 1) % KNOWLEDGE_TEMPLATES.length];
      knowledges.push({
        externalId: `${this.scenarioCode.toLowerCase()}_knowledge_${i}`,
        displayName: template.displayName,
        content: template.content,
        knowledgeType: null,
        category: template.category,
        externalSchoolId: null,
        gradeName: null,
        gradeNames: [],
        resourceExternalId: null,
      });
    }
    return knowledges;
  }

  private buildSessions(
    classes: NormalizedClassGroup[],
    schools: NormalizedSchool[],
  ): NormalizedSession[] {
    const schoolNameById = new Map(schools.map((s) => [s.externalId, s.name]));
    const sessions: NormalizedSession[] = [];

    for (const cls of classes) {
      const sessionCount = this.rng.nextInt(
        1,
        Math.max(1, this.options.sessionsPerClass),
      );
      for (let i = 1; i <= sessionCount; i++) {
        const schoolName =
          schoolNameById.get(cls.externalSchoolId) ?? cls.externalSchoolId;
        const division = cls.gradeName <= 6 ? "小学部" : "初中部";
        const suffix =
          this.scenarioCode === "TEACHER_QA" ? "课后答疑" : "家庭学习";
        const sessionName = `${schoolName}${division}${cls.gradeName}年级${cls.className} ${suffix}`;

        sessions.push({
          externalId: `${this.buildClassKey(
            cls.externalSchoolId,
            cls.gradeName,
            cls.className,
          )}:session${i}`,
          externalSchoolId: cls.externalSchoolId,
          gradeName: cls.gradeName,
          className: cls.className,
          sessionName,
          occurredAt: this.randomOccurredAt(),
        });
      }
    }

    return sessions;
  }

  private randomOccurredAt(): Date {
    const now = new Date();
    const daysAgo = this.rng.nextInt(0, 29);
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    date.setHours(this.rng.nextInt(8, 17), this.rng.nextInt(0, 59), 0, 0);
    return date;
  }

  private buildStudentKnowledgeRelations(
    students: StudentDef[],
    sessions: NormalizedSession[],
    knowledges: NormalizedKnowledge[],
  ): NormalizedStudentKnowledgeRelation[] {
    const sessionByClassKey = this.buildSessionByClassKey(sessions);

    const relations: NormalizedStudentKnowledgeRelation[] = [];

    for (const student of students) {
      const sessionKey = this.buildClassKey(
        student.externalSchoolId,
        student.gradeName,
        student.className,
      );
      const classSessions = sessionByClassKey.get(sessionKey);
      if (!classSessions || classSessions.length === 0) continue;
      // Preserve the previous overwrite behavior by using the last session.
      const session = classSessions[classSessions.length - 1];

      const relationCount = this.rng.nextInt(2, 4);
      const shuffled = this.shuffleArray([...knowledges]);
      const selected = shuffled.slice(0, relationCount);

      for (const knowledge of selected) {
        const strength = this.randomStrength(0.5, 1);
        relations.push({
          studentExternalId: student.externalId,
          knowledgeExternalId: knowledge.externalId,
          sessionExternalId: session.externalId,
          strength,
          actionType: "STUDY",
        });
      }
    }

    return relations;
  }

  private buildInteractions(
    students: StudentDef[],
    teachers: TeacherDef[],
    sessions: NormalizedSession[],
  ): NormalizedInteraction[] {
    const sessionByClassKey = this.buildSessionByClassKey(sessions);

    const studentsByClass = new Map<string, StudentDef[]>();
    for (const student of students) {
      const key = this.buildClassKey(
        student.externalSchoolId,
        student.gradeName,
        student.className,
      );
      const list = studentsByClass.get(key) ?? [];
      list.push(student);
      studentsByClass.set(key, list);
    }

    const teachersByClass = new Map<string, TeacherDef>();
    for (const teacher of teachers) {
      const key = this.buildClassKey(
        teacher.externalSchoolId,
        teacher.gradeName,
        teacher.className,
      );
      teachersByClass.set(key, teacher);
    }

    const interactions: NormalizedInteraction[] = [];
    const seenKeys = new Set<string>();

    const addInteraction = (
      sourceExternalUserId: string,
      targetExternalUserId: string,
      sessionExternalId: string,
      actionType: string,
      strength: number,
    ): void => {
      const key = `${sessionExternalId}|${sourceExternalUserId}|${targetExternalUserId}|${actionType}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      interactions.push({
        sourceExternalUserId,
        targetExternalUserId,
        sessionExternalId,
        interactionType: "PLATFORM",
        actionType,
        strength,
      });
    };

    for (const [classKey, classStudents] of Array.from(studentsByClass.entries())) {
      const classSessions = sessionByClassKey.get(classKey);
      const teacher = teachersByClass.get(classKey);
      if (!classSessions || classSessions.length === 0 || !teacher) continue;
      // Preserve the previous overwrite behavior by using the last session.
      const session = classSessions[classSessions.length - 1];

      // Teacher -> Student: TEACHING, one interaction per student.
      for (const student of classStudents) {
        const strength = this.randomStrength(0.6, 1);
        addInteraction(
          teacher.externalId,
          student.externalId,
          session.externalId,
          "TEACHING",
          strength,
        );
      }

      // Student -> Teacher: HELP_SEEKING, roughly 30% of students.
      const helpSeekers = this.shuffleArray([...classStudents]).slice(
        0,
        Math.max(1, Math.floor(classStudents.length * 0.3)),
      );
      for (const student of helpSeekers) {
        const strength = this.randomStrength(0.6, 1);
        addInteraction(
          student.externalId,
          teacher.externalId,
          session.externalId,
          "HELP_SEEKING",
          strength,
        );
      }

      // Student -> Student: COLLABORATION, sparse edges for about 20% of pairs.
      const pairCount = Math.max(
        0,
        Math.floor((classStudents.length * (classStudents.length - 1)) / 2) *
          0.2,
      );
      const shuffledStudents = this.shuffleArray([...classStudents]);
      let generatedPairs = 0;
      for (let i = 0; i < shuffledStudents.length && generatedPairs < pairCount; i++) {
        for (
          let j = i + 1;
          j < shuffledStudents.length && generatedPairs < pairCount;
          j++
        ) {
          const source = shuffledStudents[i];
          const target = shuffledStudents[j];
          const strength = this.randomStrength(0.5, 1);
          addInteraction(
            source.externalId,
            target.externalId,
            session.externalId,
            "COLLABORATION",
            strength,
          );
          generatedPairs++;
        }
      }
    }

    return interactions;
  }

  private buildCognitiveProfiles(
    students: StudentDef[],
  ): NormalizedCognitiveProfile[] {
    const profiles: NormalizedCognitiveProfile[] = [];

    for (const student of students) {
      const dimensions: NormalizedCognitiveScore[] = [];
      let totalScore = 0;

      for (const dimensionCode of DIMENSION_CODES) {
        const scoreValue = this.rng.nextInt(0, 100);
        totalScore += scoreValue;
        dimensions.push({
          dimensionCode,
          scoreValue,
          scoreLevel: resolveScoreLevel(scoreValue),
        });
      }

      profiles.push({
        studentExternalId: student.externalId,
        profileVersion: "v1",
        generatedAt: new Date(),
        totalScore: Number((totalScore / DIMENSION_CODES.length).toFixed(2)),
        dimensions,
      });
    }

    return profiles;
  }

  /**
   * Shuffles the array in-place using the Fisher-Yates algorithm and the
   * local random number generator.
   */
  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /** Builds a deterministic key for a class scoped by school and grade. */
  private buildClassKey(
    externalSchoolId: string,
    gradeName: number,
    className: string,
  ): string {
    return `${externalSchoolId}:${gradeName}:${className}`;
  }

  /** Groups sessions by their class key. */
  private buildSessionByClassKey(
    sessions: NormalizedSession[],
  ): Map<string, NormalizedSession[]> {
    const map = new Map<string, NormalizedSession[]>();
    for (const session of sessions) {
      const key = this.buildClassKey(
        session.externalSchoolId,
        session.gradeName,
        session.className,
      );
      const list = map.get(key) ?? [];
      list.push(session);
      map.set(key, list);
    }
    return map;
  }

  /** Returns a random strength value in the range [min, max). */
  private randomStrength(
    min: number,
    max: number,
    decimals = 2,
  ): number {
    return Number((this.rng.next() * (max - min) + min).toFixed(decimals));
  }
}
