import { describe, expect, it } from "vitest";
import { CompletedEventSchema } from "../src/results";

function completedEvent(
  practiceStats?: unknown,
): Parameters<typeof CompletedEventSchema.safeParse>[0] {
  return {
    acc: 95,
    afkDuration: 0,
    bailedOut: false,
    blindMode: false,
    charStats: [10, 0, 0, 0],
    charTotal: 10,
    chartData: { wpm: [80], burst: [80], err: [0] },
    consistency: 100,
    difficulty: "normal",
    funbox: [],
    hash: "hash",
    incompleteTestSeconds: 0,
    incompleteTests: [],
    keyConsistency: 100,
    keyDuration: [1],
    keyOverlap: 0,
    keySpacing: [1],
    language: "english",
    lastKeyToEnd: 0,
    lazyMode: false,
    mode: "time",
    mode2: "15",
    numbers: false,
    punctuation: false,
    rawWpm: 80,
    restartCount: 0,
    startToFirstKey: 0,
    stopOnLetter: false,
    tags: [],
    testDuration: 15,
    timestamp: 1,
    uid: "uid",
    wpm: 80,
    wpmConsistency: 100,
    ...(practiceStats === undefined ? {} : { practiceStats }),
  };
}

function entry(index: number): {
  key: string;
  attempts: number;
  misses: number;
  burstSum: number;
  burstSqSum: number;
  burstCount: number;
} {
  return {
    key: `word_${index}`,
    attempts: 1,
    misses: 0,
    burstSum: 100,
    burstSqSum: 10000,
    burstCount: 1,
  };
}

describe("CompletedEventSchema practiceStats", () => {
  it("accepts completed events without practice stats", () => {
    expect(CompletedEventSchema.safeParse(completedEvent()).success).toBe(true);
  });

  it("accepts bounded optional practice stats", () => {
    const practiceStats = {
      source: "generated",
      language: "english",
      weight: 0.5,
      words: Array.from({ length: 200 }, (_, index) => entry(index)),
      biwords: Array.from({ length: 200 }, (_, index) => ({
        ...entry(index),
        key: `left_${index} right_${index}`,
      })),
      chars: Array.from({ length: 200 }, (_, index) => ({
        target: "e",
        typed: "r",
        count: index + 1,
      })),
    };

    expect(
      CompletedEventSchema.safeParse(completedEvent(practiceStats)).success,
    ).toBe(true);
  });

  it("rejects unbounded practice stats payloads", () => {
    const practiceStats = {
      source: "generated",
      language: "english",
      words: Array.from({ length: 201 }, (_, index) => entry(index)),
      biwords: [],
    };

    expect(
      CompletedEventSchema.safeParse(completedEvent(practiceStats)).success,
    ).toBe(false);
  });
});
