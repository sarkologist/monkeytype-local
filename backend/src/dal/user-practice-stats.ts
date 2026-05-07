import { Collection, ObjectId } from "mongodb";
import * as db from "../init/db";
import { CompletedEventPracticeStats } from "@monkeytype/schemas/results";
import { Language } from "@monkeytype/schemas/languages";

type PracticeStatType = "word" | "biword";

export type UserPracticeStat = {
  _id: ObjectId;
  uid: string;
  language: Language;
  type: PracticeStatType;
  key: string;
  attempts: number;
  misses: number;
  burstSum: number;
  burstCount: number;
  lastSeen: number;
  decayedAt: number;
};

export type FocusItem = {
  key: string;
  type: PracticeStatType;
  attempts: number;
  misses: number;
  averageBurst?: number;
  score: number;
};

const HALF_LIFE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const getCollection = (): Collection<UserPracticeStat> =>
  db.collection<UserPracticeStat>("userPracticeStats");

function decayValue(value: number, decayedAt: number, now: number): number {
  const days = Math.max(0, now - decayedAt) / DAY_MS;
  return value * Math.pow(0.5, days / HALF_LIFE_DAYS);
}

function roundStat(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampWeight(weight: number | undefined): number {
  return Math.max(0, Math.min(1, weight ?? 1));
}

async function updateEntry(
  uid: string,
  language: Language,
  type: PracticeStatType,
  entry: CompletedEventPracticeStats["words"][number],
  weight: number,
  now: number,
): Promise<void> {
  const filter = { uid, language, type, key: entry.key };
  const existing = await getCollection().findOne(filter);
  const weighted = {
    attempts: entry.attempts * weight,
    misses: entry.misses * weight,
    burstSum: entry.burstSum * weight,
    burstCount: entry.burstCount * weight,
  };

  if (existing === null) {
    await getCollection().insertOne({
      _id: new ObjectId(),
      ...filter,
      attempts: roundStat(weighted.attempts),
      misses: roundStat(weighted.misses),
      burstSum: roundStat(weighted.burstSum),
      burstCount: roundStat(weighted.burstCount),
      lastSeen: now,
      decayedAt: now,
    });
    return;
  }

  await getCollection().updateOne(filter, {
    $set: {
      attempts: roundStat(
        decayValue(existing.attempts, existing.decayedAt, now) +
          weighted.attempts,
      ),
      misses: roundStat(
        decayValue(existing.misses, existing.decayedAt, now) + weighted.misses,
      ),
      burstSum: roundStat(
        decayValue(existing.burstSum, existing.decayedAt, now) +
          weighted.burstSum,
      ),
      burstCount: roundStat(
        decayValue(existing.burstCount, existing.decayedAt, now) +
          weighted.burstCount,
      ),
      lastSeen: now,
      decayedAt: now,
    },
  });
}

export async function updateStats(
  uid: string,
  practiceStats: CompletedEventPracticeStats,
  now = Date.now(),
): Promise<void> {
  await getCollection().createIndex(
    { uid: 1, language: 1, type: 1, key: 1 },
    { unique: true },
  );
  const weight = clampWeight(practiceStats.weight);

  for (const entry of practiceStats.words) {
    await updateEntry(uid, practiceStats.language, "word", entry, weight, now);
  }
  for (const entry of practiceStats.biwords) {
    await updateEntry(
      uid,
      practiceStats.language,
      "biword",
      entry,
      weight,
      now,
    );
  }
}

function scoreItem(stat: UserPracticeStat, baselineBurst: number): FocusItem {
  const attempts = Math.max(0, stat.attempts);
  const misses = Math.max(0, stat.misses);
  const missRate = attempts > 0 ? misses / attempts : 0;
  const averageBurst =
    stat.burstCount > 0 ? stat.burstSum / stat.burstCount : undefined;
  const slowScore =
    baselineBurst > 0 && averageBurst !== undefined
      ? Math.max(0, (baselineBurst - averageBurst) / baselineBurst)
      : 0;
  const confidence = Math.min(1, attempts / 8);
  const score = confidence * (missRate * 0.7 + slowScore * 0.3);

  return {
    key: stat.key,
    type: stat.type,
    attempts: roundStat(attempts),
    misses: roundStat(misses),
    averageBurst:
      averageBurst === undefined ? undefined : roundStat(averageBurst),
    score: roundStat(score),
  };
}

type PracticeStatsSummary = {
  totalWords: number;
  totalBiwords: number;
  totalAttempts: number;
  missRate: number;
  averageBurst: number;
};

export async function getFocusItems(
  uid: string,
  language: Language,
  now = Date.now(),
): Promise<{
  summary: PracticeStatsSummary;
  words: FocusItem[];
  biwords: FocusItem[];
}> {
  const stats = await getCollection().find({ uid, language }).toArray();
  const decayed = stats.map((stat) => ({
    ...stat,
    attempts: decayValue(stat.attempts, stat.decayedAt, now),
    misses: decayValue(stat.misses, stat.decayedAt, now),
    burstSum: decayValue(stat.burstSum, stat.decayedAt, now),
    burstCount: decayValue(stat.burstCount, stat.decayedAt, now),
  }));
  const burstStats = decayed.filter((stat) => stat.burstCount > 0);
  const baselineBurst =
    burstStats.reduce((sum, stat) => sum + stat.burstSum, 0) /
    Math.max(
      1,
      burstStats.reduce((sum, stat) => sum + stat.burstCount, 0),
    );

  const qualifyingItems = decayed.filter(
    (stat) =>
      (stat.type === "word" && stat.attempts >= 3) ||
      (stat.type === "biword" && stat.attempts >= 2),
  );
  const totalAttempts = qualifyingItems.reduce((sum, s) => sum + s.attempts, 0);
  const totalMisses = qualifyingItems.reduce((sum, s) => sum + s.misses, 0);
  const summary: PracticeStatsSummary = {
    totalWords: decayed.filter((s) => s.type === "word").length,
    totalBiwords: decayed.filter((s) => s.type === "biword").length,
    totalAttempts: roundStat(totalAttempts),
    missRate: roundStat(totalAttempts > 0 ? totalMisses / totalAttempts : 0),
    averageBurst: roundStat(baselineBurst),
  };

  const scored = qualifyingItems
    .map((stat) => scoreItem(stat, baselineBurst))
    .filter((stat) => stat.score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    summary,
    words: scored.filter((stat) => stat.type === "word"),
    biwords: scored.filter((stat) => stat.type === "biword"),
  };
}
