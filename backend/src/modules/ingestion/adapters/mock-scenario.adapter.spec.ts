import { describe, expect, it } from "@jest/globals";
import { MockScenarioAdapter } from "./mock-scenario.adapter";

function classKey(cls: {
  externalSchoolId: string;
  gradeName: number;
  className: string;
}): string {
  return `${cls.externalSchoolId}:${cls.gradeName}:${cls.className}`;
}

describe("MockScenarioAdapter", () => {
  describe("TEACHER_QA scenario", () => {
    it("should generate expected platform data", async () => {
      const adapter = new MockScenarioAdapter("TEACHER_QA");
      const data = await adapter.parse();

      expect(data.scenario.code).toBe("TEACHER_QA");
      expect(data.schools).toHaveLength(2);
      expect(data.classes.length).toBeGreaterThanOrEqual(4);
      expect(data.classes.length).toBeLessThanOrEqual(6);
      expect(data.knowledges).toHaveLength(10);
      expect(data.sessions).toHaveLength(data.classes.length);

      const studentUsers = data.users.filter((u) => u.role === "STUDENT");
      const teacherUsers = data.users.filter((u) => u.role === "TEACHER");

      expect(teacherUsers).toHaveLength(data.classes.length);
      expect(data.cognitiveProfiles).toHaveLength(studentUsers.length);

      for (const cls of data.classes) {
        const classStudents = studentUsers.filter(
          (s) =>
            s.externalSchoolId === cls.externalSchoolId &&
            s.gradeName === cls.gradeName &&
            s.className === cls.className,
        );
        expect(classStudents.length).toBeGreaterThanOrEqual(20);
        expect(classStudents.length).toBeLessThanOrEqual(40);
      }

      const studentExternalIds = studentUsers.map((s) => s.externalId);
      expect(new Set(studentExternalIds).size).toBe(studentExternalIds.length);

      const classKeys = data.classes.map(classKey);
      expect(new Set(classKeys).size).toBe(classKeys.length);

      for (const cls of data.classes) {
        expect(cls.className).toMatch(/^\d+班$/);
      }

      for (const session of data.sessions) {
        const school = data.schools.find(
          (s) => s.externalId === session.externalSchoolId,
        );
        expect(school).toBeDefined();
        expect(session.sessionName).toContain(school!.name);
        expect(session.sessionName).toContain(String(session.gradeName));
        expect(session.sessionName).toContain(session.className);
        expect(session.sessionName).toContain("课后答疑");
        const division = session.gradeName <= 6 ? "小学部" : "初中部";
        expect(session.sessionName).toContain(division);
      }
    });
  });

  describe("HOME_LEARNING scenario", () => {
    it("should generate classes, teachers, students and interactions", async () => {
      const adapter = new MockScenarioAdapter("HOME_LEARNING", {
        classesPerSchool: 2,
      });
      const data = await adapter.parse();

      expect(data.scenario.code).toBe("HOME_LEARNING");
      expect(data.classes).toHaveLength(4);

      const teachers = data.users.filter((u) => u.role === "TEACHER");
      const students = data.users.filter((u) => u.role === "STUDENT");
      expect(teachers.length).toBeGreaterThan(0);
      expect(students.length).toBeGreaterThan(0);
      expect(data.interactions.length).toBeGreaterThan(0);
    });
  });

  describe("unsupported scenario", () => {
    it("should throw an error for unsupported scenario code", async () => {
      const adapter = new MockScenarioAdapter("UNSUPPORTED" as any);
      await expect(adapter.parse()).rejects.toThrow("Unsupported scenario code");
    });
  });

  describe("configurable options", () => {
    it("should generate exactly 10 students per class when min and max are 10", async () => {
      const adapter = new MockScenarioAdapter("TEACHER_QA", {
        minStudentsPerClass: 10,
        maxStudentsPerClass: 10,
      });
      const data = await adapter.parse();

      const studentUsers = data.users.filter((u) => u.role === "STUDENT");
      for (const cls of data.classes) {
        const classStudents = studentUsers.filter(
          (s) =>
            s.externalSchoolId === cls.externalSchoolId &&
            s.gradeName === cls.gradeName &&
            s.className === cls.className,
        );
        expect(classStudents).toHaveLength(10);
      }
    });

    it("should generate exactly 4 classes when classesPerSchool is 2", async () => {
      const adapter = new MockScenarioAdapter("HOME_LEARNING", {
        classesPerSchool: 2,
      });
      const data = await adapter.parse();
      expect(data.classes).toHaveLength(4);
    });
  });
});
