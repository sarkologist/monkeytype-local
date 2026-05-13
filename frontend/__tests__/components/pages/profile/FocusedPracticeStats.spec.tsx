import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FocusedPracticeStats } from "../../../../src/ts/components/pages/profile/FocusedPracticeStats";
import { __testing as ConfigTesting } from "../../../../src/ts/config/testing";

const mocks = vi.hoisted(() => ({
  getPracticeStats: vi.fn(),
  getPracticeStatsHistory: vi.fn(),
}));

vi.mock("../../../../src/ts/ape", () => ({
  default: {
    users: {
      getPracticeStats: mocks.getPracticeStats,
      getPracticeStatsHistory: mocks.getPracticeStatsHistory,
    },
  },
}));

function practiceStatsResponse(): unknown {
  return {
    status: 200,
    body: {
      data: {
        summary: {
          totalWords: 3,
          totalBiwords: 1,
          totalAttempts: 46,
          missRate: 0.24,
          averageBurst: 92,
        },
        words: [
          {
            key: "about",
            type: "word",
            attempts: 20,
            misses: 5,
            averageBurst: 80,
            score: 0.64,
            breakdown: {
              missRate: 0.25,
              slowScore: 0.13,
              inconsistency: 0.4,
              affinity: 0.2,
              confidence: 1,
              recency: 1.1,
              evidence: 1.2,
            },
          },
          {
            key: "steady",
            type: "word",
            attempts: 12,
            misses: 1,
            averageBurst: 100,
            score: 0.18,
            breakdown: {
              missRate: 0.083,
              slowScore: 0,
              inconsistency: 0.35,
              affinity: 0,
              confidence: 1,
              recency: 1,
              evidence: 1.1,
            },
          },
        ],
        biwords: [
          {
            key: "think about",
            type: "biword",
            attempts: 14,
            misses: 4,
            averageBurst: 72,
            score: 0.52,
            breakdown: {
              missRate: 0.286,
              slowScore: 0.22,
              inconsistency: 0.2,
              affinity: 0.1,
              confidence: 1,
              recency: 1.3,
              evidence: 1.15,
            },
          },
        ],
        retentionWords: [
          {
            key: "kept",
            type: "word",
            attempts: 10,
            misses: 0,
            averageBurst: 110,
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
        topSubstitutions: [
          { target: "e", typed: "r", count: 6 },
          { target: "a", typed: "s", count: 3 },
        ],
      },
    },
  };
}

describe("FocusedPracticeStats", () => {
  beforeEach(() => {
    ConfigTesting.replaceConfig({ language: "english" });
    mocks.getPracticeStats.mockResolvedValue(practiceStatsResponse());
    mocks.getPracticeStatsHistory.mockResolvedValue({
      status: 200,
      body: { data: { snapshots: [] } },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders focused-practice chart summaries", async () => {
    render(() => <FocusedPracticeStats />);

    await screen.findByText("weakness mix");

    expect(screen.getByText("attempts vs misses")).toBeInTheDocument();
    expect(screen.getByText("score distribution")).toBeInTheDocument();
    expect(screen.getByText("mistake heatmap")).toBeInTheDocument();
    expect(screen.getByText("graduation progress")).toBeInTheDocument();
    expect(screen.getByText("retention queue")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("about").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("miss")).toBeInTheDocument();
    expect(screen.getByText("slow")).toBeInTheDocument();
    expect(screen.getByText("swing")).toBeInTheDocument();
    expect(screen.getByText("chars")).toBeInTheDocument();
    expect(screen.getByText("kept")).toBeInTheDocument();
    expect(screen.getAllByText("better").length).toBeGreaterThan(0);
  });
});
