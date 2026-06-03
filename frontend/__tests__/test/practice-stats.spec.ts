import { describe, expect, it } from "vitest";
import {
  buildPracticeStats,
  PracticeStatsConfig,
} from "../../src/ts/test/practice-stats";

const baseConfig = {
  mode: "time",
  punctuation: false,
  numbers: false,
  language: "english",
  focusedPracticeRepeatedTestWeight: 0.25,
  focusedPracticeWeight: 0.5,
} satisfies PracticeStatsConfig;

function build(
  overrides: Partial<Parameters<typeof buildPracticeStats>[0]> = {},
): ReturnType<typeof buildPracticeStats> {
  const targetWords = overrides.targetWords ?? ["alpha", "beta"];
  return buildPracticeStats({
    config: baseConfig,
    focusedPracticeActive: false,
    focusedPracticeSessionId: undefined,
    isRepeated: false,
    hasWordMutatingFunbox: false,
    typedWords: ["alpha", "beta"],
    targetWords,
    missedWords: {},
    burstHistory: [100, 120],
    ...overrides,
  });
}

describe("practice stats collector", () => {
  it("collects only generated wordlist modes unless focused practice is active", () => {
    expect(build({ config: { ...baseConfig, mode: "time" } })).toBeDefined();
    expect(build({ config: { ...baseConfig, mode: "words" } })).toBeDefined();

    for (const mode of ["quote", "custom", "zen"] as const) {
      expect(build({ config: { ...baseConfig, mode } })).toBeUndefined();
    }

    expect(
      build({
        config: { ...baseConfig, mode: "custom" },
        focusedPracticeActive: true,
        focusedPracticeSessionId: "session-1",
      })?.weight,
    ).toBe(baseConfig.focusedPracticeWeight);
  });

  it("emits repeated generated stats with repeated-test weight", () => {
    expect(build({ isRepeated: true })?.weight).toBe(
      baseConfig.focusedPracticeRepeatedTestWeight,
    );
    expect(build({ isRepeated: true })?.source).toBe("repeated");
  });

  it("skips repeated generated stats when repeated-test weight is zero", () => {
    expect(
      build({
        isRepeated: true,
        config: {
          ...baseConfig,
          focusedPracticeRepeatedTestWeight: 0,
        },
      }),
    ).toBeUndefined();
  });

  it("skips non-focused custom tests", () => {
    expect(
      build({ config: { ...baseConfig, mode: "custom" } }),
    ).toBeUndefined();
  });

  it("emits focused-practice stats with focused-practice weight", () => {
    const stats = build({
      config: { ...baseConfig, mode: "custom" },
      focusedPracticeActive: true,
      focusedPracticeSessionId: "session-1",
    });

    expect(stats?.weight).toBe(baseConfig.focusedPracticeWeight);
    expect(stats?.source).toBe("focused");
    expect(stats?.practiceSessionId).toBe("session-1");
  });

  it("emits generated stats source for normal generated tests", () => {
    expect(build()?.source).toBe("generated");
  });

  it("skips focused-practice stats without a session id", () => {
    expect(
      build({
        config: { ...baseConfig, mode: "custom" },
        focusedPracticeActive: true,
      }),
    ).toBeUndefined();
  });

  it("skips focused-practice stats when focused-practice weight is zero", () => {
    expect(
      build({
        config: { ...baseConfig, mode: "custom", focusedPracticeWeight: 0 },
        focusedPracticeActive: true,
      }),
    ).toBeUndefined();
  });

  it("keeps focused-practice punctuation, numbers, and word-funbox guards", () => {
    const focused = {
      config: { ...baseConfig, mode: "custom" },
      focusedPracticeActive: true,
    } as const;

    expect(
      build({ ...focused, config: { ...focused.config, punctuation: true } }),
    ).toBeUndefined();
    expect(
      build({ ...focused, config: { ...focused.config, numbers: true } }),
    ).toBeUndefined();
    expect(build({ ...focused, hasWordMutatingFunbox: true })).toBeUndefined();
  });

  it("aggregates misses and bursts per normalized word", () => {
    const stats = build({
      targetWords: ["About", "there", "about"],
      typedWords: ["about", "their", "about"],
      burstHistory: [120, 80, 100],
    });

    expect(stats?.words).toEqual([
      {
        key: "about",
        attempts: 2,
        misses: 0,
        burstSum: 220,
        burstSqSum: 24400,
        burstCount: 2,
      },
      {
        key: "there",
        attempts: 1,
        misses: 1,
        burstSum: 80,
        burstSqSum: 6400,
        burstCount: 1,
      },
    ]);
    expect(stats?.chars).toEqual([
      { target: "r", typed: "i", count: 1 },
      { target: "e", typed: "r", count: 1 },
    ]);
  });

  it("keeps attempts and misses while ignoring huge or infinite burst samples", () => {
    const stats = build({
      targetWords: ["alpha", "beta"],
      typedWords: ["alpha", "wrong"],
      burstHistory: [12000, Infinity],
    });

    expect(stats?.words).toEqual([
      {
        key: "alpha",
        attempts: 1,
        misses: 0,
        burstSum: 0,
        burstSqSum: 0,
        burstCount: 0,
      },
      {
        key: "beta",
        attempts: 1,
        misses: 1,
        burstSum: 0,
        burstSqSum: 0,
        burstCount: 0,
      },
    ]);
    expect(stats?.biwords).toEqual([
      {
        key: "alpha beta",
        attempts: 1,
        misses: 1,
        burstSum: 0,
        burstSqSum: 0,
        burstCount: 0,
      },
    ]);
  });

  it("builds biwords from previous and current target words", () => {
    const stats = build({
      targetWords: ["alpha", "beta"],
      typedWords: ["wrong", "beta"],
      burstHistory: [90, 110],
    });

    expect(stats?.biwords).toEqual([
      {
        key: "alpha beta",
        attempts: 1,
        misses: 0,
        burstSum: 110,
        burstSqSum: 12100,
        burstCount: 1,
      },
    ]);
  });
});
