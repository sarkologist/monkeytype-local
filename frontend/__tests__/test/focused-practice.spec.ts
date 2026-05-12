import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusItem } from "@monkeytype/contracts/users";
import { __testing as ConfigTesting } from "../../src/ts/config/testing";
import * as FocusedPractice from "../../src/ts/test/focused-practice";
import { before as practiceBefore } from "../../src/ts/test/practise-words";

const mocks = vi.hoisted(() => ({
  getPracticeStats: vi.fn(),
  getLanguage: vi.fn(),
  setConfig: vi.fn(),
  getData: vi.fn(),
  setPipeDelimiter: vi.fn(),
  setText: vi.fn(),
  setLimitMode: vi.fn(),
  setMode: vi.fn(),
  setLimitValue: vi.fn(),
  setCustomTextName: vi.fn(),
  showErrorNotification: vi.fn(),
  showNoticeNotification: vi.fn(),
}));

vi.mock("../../src/ts/ape", () => ({
  default: {
    users: {
      getPracticeStats: mocks.getPracticeStats,
    },
  },
}));

vi.mock("../../src/ts/config/setters", () => ({
  setConfig: mocks.setConfig,
}));

vi.mock("../../src/ts/test/custom-text", () => ({
  getData: mocks.getData,
  setPipeDelimiter: mocks.setPipeDelimiter,
  setText: mocks.setText,
  setLimitMode: mocks.setLimitMode,
  setMode: mocks.setMode,
  setLimitValue: mocks.setLimitValue,
}));

vi.mock("../../src/ts/utils/json-data", () => ({
  getLanguage: mocks.getLanguage,
}));

vi.mock("../../src/ts/legacy-states/custom-text-name", () => ({
  setCustomTextName: mocks.setCustomTextName,
}));

vi.mock("../../src/ts/states/notifications", () => ({
  showErrorNotification: mocks.showErrorNotification,
  showNoticeNotification: mocks.showNoticeNotification,
}));

function focusResponse(
  data: Partial<{
    words: unknown[];
    biwords: unknown[];
    retentionWords: unknown[];
    retentionBiwords: unknown[];
  }> = {},
): unknown {
  return {
    status: 200,
    body: {
      data: {
        summary: {
          totalWords: 0,
          totalBiwords: 0,
          totalAttempts: 0,
          missRate: 0,
          averageBurst: 0,
        },
        words: [],
        biwords: [],
        retentionWords: [],
        retentionBiwords: [],
        graduated: [],
        topSubstitutions: [],
        ...data,
      },
    },
  };
}

function item(key: string, type: "word" | "biword", score = 1): FocusItem {
  return {
    key,
    type,
    attempts: 8,
    misses: 4,
    score,
  };
}

function countWords(words: string[], key: string): number {
  return words.filter((word) => word === key).length;
}

describe("focused-practice", () => {
  beforeEach(() => {
    ConfigTesting.replaceConfig({
      language: "english",
      mode: "time",
      punctuation: false,
      numbers: false,
      focusedPracticeWordCount: 10,
      focusedPracticeFillerProbability: 0,
    });
    FocusedPractice.reset();
    practiceBefore.mode = null;
    practiceBefore.punctuation = null;
    practiceBefore.numbers = null;
    practiceBefore.customText = null;
    vi.clearAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0);
    mocks.getData.mockReturnValue({
      text: ["old"],
      mode: "repeat",
      limit: { value: 1, mode: "word" },
      pipeDelimiter: false,
    });
    mocks.getLanguage.mockResolvedValue({
      name: "english",
      orderedByFrequency: false,
      words: ["alpha", "bravo", "charlie"],
    });
  });

  it("returns false and reports an error when stats fail to load", async () => {
    mocks.getPracticeStats.mockResolvedValue({ status: 500 });

    await expect(FocusedPractice.init()).resolves.toBe(false);

    expect(mocks.showErrorNotification).toHaveBeenCalledOnce();
    expect(mocks.setText).not.toHaveBeenCalled();
    expect(FocusedPractice.isFocusedPracticeActive()).toBe(false);
  });

  it("bootstraps a full filler session when no focus data exists", async () => {
    mocks.getPracticeStats.mockResolvedValue(focusResponse());

    await expect(FocusedPractice.init()).resolves.toBe(true);

    expect(mocks.showNoticeNotification).toHaveBeenCalledOnce();
    expect(mocks.setConfig).toHaveBeenCalledWith("mode", "custom", {
      nosave: true,
    });
    expect(mocks.setPipeDelimiter).toHaveBeenCalledWith(true);
    expect(mocks.setText).toHaveBeenCalledWith(Array(10).fill("alpha"));
    expect(mocks.setLimitMode).toHaveBeenCalledWith("section");
    expect(mocks.setMode).toHaveBeenCalledWith("shuffle");
    expect(mocks.setLimitValue).toHaveBeenCalledWith(10);
    expect(mocks.setCustomTextName).toHaveBeenCalledWith(
      "focused practice",
      undefined,
    );
    expect(FocusedPractice.isFocusedPracticeActive()).toBe(true);
  });

  it("allocates struggle and retention slots before filler", async () => {
    mocks.getPracticeStats.mockResolvedValue(
      focusResponse({
        words: [item("weak", "word")],
        biwords: [item("very weak", "biword")],
        retentionWords: [item("kept", "word")],
        retentionBiwords: [item("still kept", "biword")],
      }),
    );

    await expect(FocusedPractice.init()).resolves.toBe(true);

    expect(mocks.setText).toHaveBeenCalledWith([
      "weak",
      "weak",
      "weak",
      "weak",
      "kept",
      "very weak",
      "very weak",
      "very weak",
      "very weak",
      "still kept",
    ]);
  });

  it("builds practice text with more exposure for higher-score items", () => {
    const text = FocusedPractice.buildFocusedPracticeText({
      words: [item("high", "word", 9), item("low", "word", 1)],
      biwords: [],
      retentionWords: [],
      retentionBiwords: [],
      targetLength: 20,
      fillerProbability: 0,
      rng: () => 0.5,
      pickFiller: () => "fill",
    });

    expect(text).toHaveLength(20);
    expect(countWords(text, "high")).toBeGreaterThan(countWords(text, "low"));
  });

  it("preserves retention quota and backfills unavailable slots with filler", () => {
    const text = FocusedPractice.buildFocusedPracticeText({
      words: [item("weak", "word")],
      biwords: [],
      retentionWords: [item("kept", "word")],
      retentionBiwords: [],
      targetLength: 10,
      fillerProbability: 0,
      rng: () => 0,
      pickFiller: () => "fill",
    });

    expect(text).toHaveLength(10);
    expect(countWords(text, "weak")).toBe(4);
    expect(countWords(text, "kept")).toBe(1);
    expect(countWords(text, "fill")).toBe(5);
  });

  it("reduces simulated hidden weakness more than random filler practice", () => {
    const initialBurden: Record<string, number> = {
      weak: 10,
      common: 1,
      fillerA: 1,
      fillerB: 1,
    };
    const reduceBurden = (text: string[]): number => {
      const burden = { ...initialBurden };
      for (const word of text) {
        burden[word] = (burden[word] ?? 0) * 0.8;
      }
      return Object.values(burden).reduce((sum, value) => sum + value, 0);
    };

    const focused = FocusedPractice.buildFocusedPracticeText({
      words: [item("weak", "word", 9)],
      biwords: [item("common", "biword", 1)],
      retentionWords: [],
      retentionBiwords: [],
      targetLength: 10,
      fillerProbability: 0,
      rng: () => 0,
      pickFiller: () => "fillerA",
    });
    const randomBaseline = Array.from({ length: 10 }, (_, index) =>
      index % 2 === 0 ? "fillerA" : "fillerB",
    );

    const focusedReduction = reduceBurden(focused);
    const randomReduction = reduceBurden(randomBaseline);
    expect(focusedReduction).toBeLessThan(randomReduction);
  });
});
