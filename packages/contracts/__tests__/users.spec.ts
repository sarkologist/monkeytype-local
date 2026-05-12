import { describe, expect, it } from "vitest";
import { GetPracticeStatsResponseSchema } from "../src/users";

describe("GetPracticeStatsResponseSchema", () => {
  it("validates the focused-practice response shape", () => {
    const response = {
      message: "Practice stats retrieved",
      data: {
        summary: {
          totalWords: 2,
          totalBiwords: 1,
          totalAttempts: 12,
          missRate: 0.25,
          averageBurst: 95,
        },
        words: [
          {
            key: "about",
            type: "word",
            attempts: 8,
            misses: 2,
            averageBurst: 95,
            score: 0.75,
          },
        ],
        biwords: [
          {
            key: "think about",
            type: "biword",
            attempts: 4,
            misses: 1,
            score: 0.5,
          },
        ],
        retentionWords: [
          {
            key: "kept",
            type: "word",
            attempts: 10,
            misses: 0,
            score: 0.2,
          },
        ],
        retentionBiwords: [],
        graduated: [
          {
            key: "better",
            type: "word",
            attempts: 12,
            missRate: 0.01,
            peakMissRate: 0.2,
            peakMissRateAt: 1000,
          },
        ],
        topSubstitutions: [{ target: "e", typed: "r", count: 4 }],
      },
    };

    expect(GetPracticeStatsResponseSchema.safeParse(response).success).toBe(
      true,
    );
  });

  it("rejects malformed focused-practice responses", () => {
    const response = {
      message: "Practice stats retrieved",
      data: {
        words: [],
        biwords: [],
        retentionWords: [],
        retentionBiwords: [],
        graduated: [],
        topSubstitutions: [],
      },
    };

    expect(GetPracticeStatsResponseSchema.safeParse(response).success).toBe(
      false,
    );
  });
});
