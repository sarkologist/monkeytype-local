import { describe, it, expect, afterEach } from "vitest";
import * as PracticeStatsDal from "../../../src/dal/user-practice-stats";
import * as PracticeSnapshotsDal from "../../../src/dal/user-practice-snapshots";
import * as CharSubstitutionsDal from "../../../src/dal/user-char-substitutions";
import * as PracticeSessionsDal from "../../../src/dal/user-practice-sessions";
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
    await PracticeStatsDal.getSourceCollection().deleteMany({ uid });
    await PracticeSnapshotsDal.getCollection().deleteMany({ uid });
    await CharSubstitutionsDal.getCollection().deleteMany({ uid });
    await PracticeSessionsDal.getCollection().deleteMany({ uid });
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

  it("records source-specific stats alongside selection stats", async () => {
    await PracticeStatsDal.updateStats(
      uid,
      { ...stats(2, 1), source: "focused", practiceSessionId: "session-1" },
      1000,
    );

    const aggregate = await PracticeStatsDal.getCollection().findOne({
      uid,
      language: "english",
      type: "word",
      key: "about",
    });
    const sourceAggregate =
      await PracticeStatsDal.getSourceCollection().findOne({
        uid,
        language: "english",
        source: "focused",
        type: "word",
        key: "about",
      });

    expect(aggregate?.attempts).toBe(2);
    expect(sourceAggregate?.attempts).toBe(2);
    expect(sourceAggregate?.misses).toBe(1);
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

  it("returns deterministic holdout and excludes it from focus pools", async () => {
    await PracticeStatsDal.updateStats(
      uid,
      {
        source: "generated",
        language: "english",
        words: Array.from({ length: 40 }, (_, index) => ({
          key: `weak${index}`,
          attempts: 8,
          misses: 4,
          burstSum: 1600,
          burstCount: 8,
        })),
        biwords: [],
      },
      1000,
    );

    const first = await PracticeStatsDal.getFocusItems(uid, "english", 1000);
    const second = await PracticeStatsDal.getFocusItems(uid, "english", 1000);
    const holdoutKeys = new Set(first.holdoutWords.map((w) => w.key));

    expect(first.holdoutWords.length).toBeGreaterThanOrEqual(2);
    expect(first.holdoutWords.length).toBeLessThanOrEqual(6);
    expect(second.holdoutWords.map((w) => w.key)).toEqual(
      first.holdoutWords.map((w) => w.key),
    );
    expect(first.words.some((w) => holdoutKeys.has(w.key))).toBe(false);
  });

  it("idempotently records bounded session plans", async () => {
    await PracticeSessionsDal.recordSession(
      uid,
      {
        sessionId: "session-1",
        language: "english",
        source: "focused",
        seed: 123,
        config: { wordCount: 10, fillerProbability: 0.3 },
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
        ],
      },
      1000,
    );
    await PracticeSessionsDal.recordSession(
      uid,
      {
        sessionId: "session-1",
        language: "english",
        source: "focused",
        seed: 456,
        config: { wordCount: 20, fillerProbability: 0.1 },
        items: [],
      },
      2000,
    );

    const sessions = await PracticeSessionsDal.getCollection()
      .find({ uid })
      .toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      uid,
      sessionId: "session-1",
      seed: 456,
      createdAt: 2000,
      items: [],
    });
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

  it("returns graduated items in retention pool with score = peakMissRate", async () => {
    await PracticeStatsDal.updateStats(uid, stats(8, 4), 1000);
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
    const retention = focus.retentionWords.find((w) => w.key === "about");
    expect(retention).toBeDefined();
    expect(retention?.score).toBeGreaterThanOrEqual(0.1);
  });

  it("does not graduate items still struggling", async () => {
    await PracticeStatsDal.updateStats(uid, stats(8, 4), 1000);

    const focus = await PracticeStatsDal.getFocusItems(uid, "english", 1000);
    expect(focus.graduated.find((g) => g.key === "about")).toBeUndefined();
  });

  it("scores high-variance items higher than consistent ones", async () => {
    await PracticeStatsDal.updateStats(
      uid,
      {
        source: "generated",
        language: "english",
        words: [
          {
            // bursts [20, 80, 20, 80, 50] — same mean as steady, big variance
            key: "swingy",
            attempts: 5,
            misses: 0,
            burstSum: 250,
            burstSqSum: 16100,
            burstCount: 5,
          },
          {
            // bursts [50, 50, 50, 50, 50] — zero variance
            key: "steady",
            attempts: 5,
            misses: 0,
            burstSum: 250,
            burstSqSum: 12500,
            burstCount: 5,
          },
        ],
        biwords: [],
      },
      1000,
    );

    const focus = await PracticeStatsDal.getFocusItems(uid, "english", 1000);
    const swingy = focus.words.find((w) => w.key === "swingy");
    const steady = focus.words.find((w) => w.key === "steady");
    expect(swingy).toBeDefined();
    expect(swingy!.score).toBeGreaterThan(0);
    // steady item with zero variance and zero misses scores nothing
    expect(steady).toBeUndefined();
  });

  it("amplifies score for items with more accumulated evidence", async () => {
    // both items at 30% miss rate, but one has 80 attempts and one has 8
    await PracticeStatsDal.updateStats(
      uid,
      {
        source: "generated",
        language: "english",
        words: [
          {
            key: "highevi",
            attempts: 80,
            misses: 24,
            burstSum: 16000,
            burstCount: 80,
          },
          {
            key: "lowevi",
            attempts: 8,
            misses: 2.4,
            burstSum: 1600,
            burstCount: 8,
          },
        ],
        biwords: [],
      },
      1000,
    );

    const focus = await PracticeStatsDal.getFocusItems(uid, "english", 1000);
    const high = focus.words.find((w) => w.key === "highevi");
    const low = focus.words.find((w) => w.key === "lowevi");
    expect(high).toBeDefined();
    expect(low).toBeDefined();
    expect(high!.score).toBeGreaterThan(low!.score);
  });

  it("boosts recently identified weaknesses over old ones", async () => {
    const day = 24 * 60 * 60 * 1000;
    // recently struggled word — peak set at "now"
    await PracticeStatsDal.updateStats(
      uid,
      {
        source: "generated",
        language: "english",
        words: [
          {
            key: "recent",
            attempts: 8,
            misses: 4,
            burstSum: 1600,
            burstCount: 8,
          },
        ],
        biwords: [],
      },
      30 * day,
    );
    // older struggled word — peak set 30 days ago, by then decayed flat
    await PracticeStatsDal.updateStats(
      uid,
      {
        source: "generated",
        language: "english",
        words: [
          {
            key: "stale",
            attempts: 8,
            misses: 4,
            burstSum: 1600,
            burstCount: 8,
          },
        ],
        biwords: [],
      },
      0,
    );

    const focus = await PracticeStatsDal.getFocusItems(
      uid,
      "english",
      30 * day,
    );
    const recent = focus.words.find((w) => w.key === "recent");
    const stale = focus.words.find((w) => w.key === "stale");
    expect(recent).toBeDefined();
    expect(stale).toBeDefined();
    expect(recent!.score).toBeGreaterThan(stale!.score);
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

  it("normalizes char weights by occurrence rate, not raw count", async () => {
    // raw count: e=30 > t=10
    // occurrences: e=200 (100 attempts × 2), t=20 (10 attempts × 2)
    // rate: e=30/200=0.15, t=10/20=0.5 → 't' is the per-occurrence weakness
    await PracticeStatsDal.updateStats(
      uid,
      {
        source: "generated",
        language: "english",
        words: [
          {
            key: "ee",
            attempts: 100,
            misses: 0,
            burstSum: 20000,
            burstCount: 100,
          },
          {
            key: "tt",
            attempts: 10,
            misses: 0,
            burstSum: 2000,
            burstCount: 10,
          },
        ],
        biwords: [],
        chars: [
          { target: "e", typed: "r", count: 30 },
          { target: "t", typed: "y", count: 10 },
        ],
      },
      1000,
    );

    const focus = await PracticeStatsDal.getFocusItems(uid, "english", 1000);
    const ee = focus.words.find((w) => w.key === "ee");
    const tt = focus.words.find((w) => w.key === "tt");
    expect(ee).toBeDefined();
    expect(tt).toBeDefined();
    expect(tt!.score).toBeGreaterThan(ee!.score);
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

  it("ranks mixed-profile items by expected practice lift", async () => {
    await PracticeStatsDal.updateStats(
      uid,
      {
        source: "generated",
        language: "english",
        words: [
          {
            key: "accuracy",
            attempts: 80,
            misses: 40,
            burstSum: 16000,
            burstCount: 80,
          },
          {
            key: "hesitate",
            attempts: 80,
            misses: 0,
            burstSum: 8000,
            burstCount: 80,
          },
          {
            key: "erratic",
            attempts: 8,
            misses: 0,
            burstSum: 400,
            burstSqSum: 25800,
            burstCount: 8,
          },
          {
            key: "stable",
            attempts: 80,
            misses: 0,
            burstSum: 16000,
            burstSqSum: 3200000,
            burstCount: 80,
          },
        ],
        biwords: [],
        chars: [{ target: "z", typed: "x", count: 20 }],
      },
      1000,
    );
    await PracticeStatsDal.updateStats(
      uid,
      {
        source: "generated",
        language: "english",
        words: [
          {
            key: "zest",
            attempts: 8,
            misses: 0,
            burstSum: 1600,
            burstCount: 8,
          },
        ],
        biwords: [],
      },
      1000,
    );

    const focus = await PracticeStatsDal.getFocusItems(uid, "english", 1000);
    const keys = focus.words.map((word) => word.key);

    expect(keys.slice(0, 4)).toEqual([
      "accuracy",
      "erratic",
      "hesitate",
      "zest",
    ]);
    expect(keys).not.toContain("stable");
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
