import { describe, it, expect, afterEach } from "vitest";
import * as PracticeStatsDal from "../../../src/dal/user-practice-stats";
import * as PracticeSnapshotsDal from "../../../src/dal/user-practice-snapshots";
import * as CharSubstitutionsDal from "../../../src/dal/user-char-substitutions";
import { CompletedEventPracticeStats } from "@monkeytype/schemas/results";

const uid = "practice-test-user";

function stats(
  wordAttempts: number,
  wordMisses: number,
): CompletedEventPracticeStats {
  return {
    source: "generated",
    language: "english",
    words: [
      {
        key: "about",
        attempts: wordAttempts,
        misses: wordMisses,
        burstSum: 200,
        burstCount: 1,
      },
    ],
    biwords: [
      {
        key: "think about",
        attempts: 1,
        misses: 1,
        burstSum: 150,
        burstCount: 1,
      },
    ],
  };
}

describe("UserPracticeStatsDal", () => {
  afterEach(async () => {
    await PracticeStatsDal.getCollection().deleteMany({ uid });
    await PracticeSnapshotsDal.getCollection().deleteMany({ uid });
    await CharSubstitutionsDal.getCollection().deleteMany({ uid });
  });

  it("increments repeated keys", async () => {
    await PracticeStatsDal.updateStats(uid, stats(2, 1), 1000);
    await PracticeStatsDal.updateStats(uid, stats(3, 2), 1000);

    const doc = await PracticeStatsDal.getCollection().findOne({
      uid,
      language: "english",
      type: "word",
      key: "about",
    });

    expect(doc?.attempts).toBe(5);
    expect(doc?.misses).toBe(3);
  });

  it("scales payloads by weight", async () => {
    await PracticeStatsDal.updateStats(
      uid,
      { ...stats(4, 2), weight: 0.25 },
      1000,
    );

    const doc = await PracticeStatsDal.getCollection().findOne({
      uid,
      language: "english",
      type: "word",
      key: "about",
    });

    expect(doc?.attempts).toBe(1);
    expect(doc?.misses).toBe(0.5);
    expect(doc?.burstSum).toBe(50);
    expect(doc?.burstCount).toBe(0.25);
  });

  it("clamps payload weight", async () => {
    await PracticeStatsDal.updateStats(
      uid,
      { ...stats(4, 2), weight: 2 },
      1000,
    );

    const doc = await PracticeStatsDal.getCollection().findOne({
      uid,
      language: "english",
      type: "word",
      key: "about",
    });

    expect(doc?.attempts).toBe(4);
    expect(doc?.misses).toBe(2);
  });

  it("decays before incrementing", async () => {
    await PracticeStatsDal.updateStats(uid, stats(8, 4), 0);
    await PracticeStatsDal.updateStats(
      uid,
      {
        ...stats(0, 0),
        words: [
          {
            key: "about",
            attempts: 0,
            misses: 0,
            burstSum: 0,
            burstCount: 0,
          },
        ],
        biwords: [],
      },
      30 * 24 * 60 * 60 * 1000,
    );

    const doc = await PracticeStatsDal.getCollection().findOne({
      uid,
      language: "english",
      type: "word",
      key: "about",
    });

    expect(doc?.attempts).toBe(4);
    expect(doc?.misses).toBe(2);
  });

  it("scores focus items", async () => {
    await PracticeStatsDal.updateStats(uid, stats(8, 4), 1000);

    const focus = await PracticeStatsDal.getFocusItems(uid, "english", 1000);

    expect(focus.words[0]?.key).toBe("about");
    expect(focus.words[0]?.score).toBeGreaterThan(0);
    expect(focus.biwords).toHaveLength(0);
  });

  it("surfaces graduated items after peak struggle resolves", async () => {
    // peak: 8 attempts, 4 misses → 50% miss rate; sets peakMissRate
    await PracticeStatsDal.updateStats(uid, stats(8, 4), 1000);

    // many clean attempts later — current miss rate drops below threshold
    await PracticeStatsDal.updateStats(
      uid,
      {
        source: "generated",
        language: "english",
        words: [
          {
            key: "about",
            attempts: 200,
            misses: 0,
            burstSum: 40000,
            burstCount: 200,
          },
        ],
        biwords: [],
      },
      1000,
    );

    const focus = await PracticeStatsDal.getFocusItems(uid, "english", 1000);
    const grad = focus.graduated.find((g) => g.key === "about");
    expect(grad).toBeDefined();
    expect(grad?.peakMissRate).toBeGreaterThanOrEqual(0.1);
    expect(grad?.missRate).toBeLessThan(0.05);
  });

  it("does not graduate items still struggling", async () => {
    await PracticeStatsDal.updateStats(uid, stats(8, 4), 1000);

    const focus = await PracticeStatsDal.getFocusItems(uid, "english", 1000);
    expect(focus.graduated.find((g) => g.key === "about")).toBeUndefined();
  });

  it("boosts items composed of high-substitution chars", async () => {
    // user types "hello" 8 times perfectly — would score 0 normally
    // but mistypes 'e' frequently, so "hello" should still enter the pool
    await PracticeStatsDal.updateStats(
      uid,
      {
        source: "generated",
        language: "english",
        words: [
          {
            key: "hello",
            attempts: 8,
            misses: 0,
            burstSum: 1600,
            burstCount: 8,
          },
          {
            key: "lull",
            attempts: 8,
            misses: 0,
            burstSum: 1600,
            burstCount: 8,
          },
        ],
        biwords: [],
        chars: [{ target: "e", typed: "r", count: 30 }],
      },
      1000,
    );

    const focus = await PracticeStatsDal.getFocusItems(uid, "english", 1000);
    const hello = focus.words.find((w) => w.key === "hello");
    const lull = focus.words.find((w) => w.key === "lull");
    // hello contains 'e' (top substitution target) → score > 0
    expect(hello).toBeDefined();
    expect(hello?.score).toBeGreaterThan(0);
    // lull has no e/affinity → no miss/slow signal → still excluded
    expect(lull).toBeUndefined();
  });

  it("aggregates and surfaces top character substitutions", async () => {
    await PracticeStatsDal.updateStats(
      uid,
      {
        ...stats(1, 0),
        chars: [
          { target: "e", typed: "r", count: 3 },
          { target: "a", typed: "s", count: 1 },
        ],
      },
      1000,
    );
    await PracticeStatsDal.updateStats(
      uid,
      {
        ...stats(1, 0),
        chars: [{ target: "e", typed: "r", count: 2 }],
      },
      1000,
    );

    const focus = await PracticeStatsDal.getFocusItems(uid, "english", 1000);
    expect(focus.topSubstitutions[0]).toMatchObject({
      target: "e",
      typed: "r",
      count: 5,
    });
    expect(focus.topSubstitutions[1]).toMatchObject({
      target: "a",
      typed: "s",
      count: 1,
    });
  });

  it("records weekly snapshots", async () => {
    const week = 7 * 24 * 60 * 60 * 1000;
    await PracticeStatsDal.updateStats(uid, stats(8, 4), 1000);
    await PracticeStatsDal.updateStats(uid, stats(2, 0), 1000 + 1000);
    await PracticeStatsDal.updateStats(uid, stats(2, 0), 1000 + week + 1);

    const snaps = await PracticeSnapshotsDal.getSnapshots(uid, "english");
    expect(snaps).toHaveLength(2);
    expect(snaps[0]?.takenAt).toBe(1000);
    expect(snaps[1]?.takenAt).toBe(1000 + week + 1);
  });
});
