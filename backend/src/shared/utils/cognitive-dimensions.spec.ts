import {
  generateMockBaseDimensionScores,
  AGGREGATE_DIMENSION_KEYS,
  BASE_DIMENSION_CODES,
  AGGREGATE_TO_BASE_CODES,
} from "./cognitive-dimensions";

describe("generateMockBaseDimensionScores", () => {
  const fullScores = Object.fromEntries(
    AGGREGATE_DIMENSION_KEYS.map((key) => [key, 5]),
  );

  it("produces the same output for the same seed", () => {
    const first = generateMockBaseDimensionScores(fullScores, "student-1");
    const second = generateMockBaseDimensionScores(fullScores, "student-1");
    expect([...first.entries()]).toEqual([...second.entries()]);
  });

  it("emits all 16 base dimension codes when all 10 aggregate scores are positive", () => {
    const scores = generateMockBaseDimensionScores(fullScores, "seed-1");
    expect(scores.size).toBe(BASE_DIMENSION_CODES.length);
    for (const code of BASE_DIMENSION_CODES) {
      expect(scores.has(code)).toBe(true);
    }
  });

  it("clamps generated scores to the [0, 10] range", () => {
    const edgeScores = Object.fromEntries(
      AGGREGATE_DIMENSION_KEYS.map((key) => [key, 10]),
    );
    const scores = generateMockBaseDimensionScores(edgeScores, "seed-2");
    for (const value of scores.values()) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(10);
    }
  });

  it("skips zero, negative, and missing aggregate scores", () => {
    const mixedScores = {
      knowledgeReserve: 5,
      learningEngagement: 0,
      cognitiveLoad: -3,
      learningMotivation: 5,
      computationalThinking: 5,
      humanAiTrust: 5,
      learningMethod: 5,
      learningAttitude: 5,
      selfRegulatedLearning: 5,
      aiLiteracy: 5,
    } as const;

    const scores = generateMockBaseDimensionScores(mixedScores, "seed-3");

    const positiveKeys = AGGREGATE_DIMENSION_KEYS.filter(
      (key) =>
        key !== "learningEngagement" && key !== "cognitiveLoad",
    );
    const expectedCodes = new Set(
      positiveKeys.flatMap((key) => [...AGGREGATE_TO_BASE_CODES[key]]),
    );

    expect(scores.size).toBe(expectedCodes.size);
    for (const code of expectedCodes) {
      expect(scores.has(code)).toBe(true);
    }
    expect(scores.has("PRAC_PRACTICE")).toBe(false);
  });

  it("generates each score roughly equal to aggregateScore * 2, within ±1", () => {
    const targetScores = Object.fromEntries(
      AGGREGATE_DIMENSION_KEYS.map((key) => [key, 3]),
    );
    const scores = generateMockBaseDimensionScores(targetScores, "seed-4");
    for (const [code, value] of scores) {
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThanOrEqual(7);
    }
  });
});
