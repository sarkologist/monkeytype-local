import { describe, expect, it } from "vitest";
import {
  GetPracticeStatsResponseSchema,
  RecordPracticeStatsSessionRequestSchema,
} from "../src/users";

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
            breakdown: {
              missRate: 0.25,
              slowScore: 0.12,
              inconsistency: 0.3,
              affinity: 0.4,
              confidence: 1,
              recency: 1.2,
              evidence: 1,
            },
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
        holdoutWords: [
          {
            key: "withheld",
            type: "word",
            attempts: 12,
            misses: 6,
            score: 0.5,
          },
        ],
        holdoutBiwords: [],
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

    const parsed = GetPracticeStatsResponseSchema.safeParse(response);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.data.words[0]?.breakdown).toEqual({
        missRate: 0.25,
        slowScore: 0.12,
        inconsistency: 0.3,
        affinity: 0.4,
        confidence: 1,
        recency: 1.2,
        evidence: 1,
      });
    }
  });

  it("rejects malformed focused-practice responses", () => {
    const response = {
      message: "Practice stats retrieved",
      data: {
        words: [],
        biwords: [],
        retentionWords: [],
        retentionBiwords: [],
        holdoutWords: [],
        holdoutBiwords: [],
        graduated: [],
        topSubstitutions: [],
      },
    };

    expect(GetPracticeStatsResponseSchema.safeParse(response).success).toBe(
      false,
    );
  });
});

describe("RecordPracticeStatsSessionRequestSchema", () => {
  it("validates focused-practice session plans", () => {
    const response = {
      sessionId: "session_123",
      language: "english",
      source: "focused",
      seed: 123,
      config: {
        wordCount: 50,
        fillerProbability: 0.3,
      },
      items: [
        {
          key: "about",
          type: "word",
          role: "struggle",
          score: 0.5,
          attempts: 8,
          misses: 4,
          count: 2,
        },
        {
          key: "withheld",
          type: "word",
          role: "holdout",
          score: 0.4,
          attempts: 8,
          misses: 4,
          count: 0,
        },
      ],
    };

    expect(
      RecordPracticeStatsSessionRequestSchema.safeParse(response).success,
    ).toBe(true);
  });
});
