import { Collection, ObjectId } from "mongodb";
import * as db from "../init/db";
import { CompletedEventPracticeStats } from "@monkeytype/schemas/results";
import { Language } from "@monkeytype/schemas/languages";
import * as PracticeSnapshotsDAL from "./user-practice-snapshots";
import * as CharSubstitutionsDAL from "./user-char-substitutions";

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
  peakMissRate?: number;
  peakMissRateAt?: number;
};

export type FocusItem = {
  key: string;
  type: PracticeStatType;
  attempts: number;
  misses: number;
  averageBurst?: number;
  score: number;
};

export type GraduatedItem = {
  key: string;
  type: PracticeStatType;
  attempts: number;
  missRate: number;
  peakMissRate: number;
  peakMissRateAt: number;
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

const PEAK_MIN_ATTEMPTS = 5;

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
    const attempts = roundStat(weighted.attempts);
    const misses = roundStat(weighted.misses);
    const missRate = attempts > 0 ? misses / attempts : 0;
    const peak =
      attempts >= PEAK_MIN_ATTEMPTS
        ? { peakMissRate: roundStat(missRate), peakMissRateAt: now }
        : {};
    await getCollection().insertOne({
      _id: new ObjectId(),
      ...filter,
      attempts,
      misses,
      burstSum: roundStat(weighted.burstSum),
      burstCount: roundStat(weighted.burstCount),
      lastSeen: now,
      decayedAt: now,
      ...peak,
    });
    return;
  }

  const newAttempts = roundStat(
    decayValue(existing.attempts, existing.decayedAt, now) + weighted.attempts,
  );
  const newMisses = roundStat(
    decayValue(existing.misses, existing.decayedAt, now) + weighted.misses,
  );
  const newMissRate = newAttempts > 0 ? newMisses / newAttempts : 0;
  const peakUpdate: Partial<UserPracticeStat> = {};
  if (
    newAttempts >= PEAK_MIN_ATTEMPTS &&
    (existing.peakMissRate === undefined || newMissRate > existing.peakMissRate)
  ) {
    peakUpdate.peakMissRate = roundStat(newMissRate);
    peakUpdate.peakMissRateAt = now;
  }

  await getCollection().updateOne(filter, {
    $set: {
      attempts: newAttempts,
      misses: newMisses,
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
      ...peakUpdate,
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

  if (practiceStats.chars !== undefined && practiceStats.chars.length > 0) {
    await CharSubstitutionsDAL.updateStats(
      uid,
      practiceStats.language,
      practiceStats.chars,
      practiceStats.weight,
      now,
    );
  }

  if (
    await PracticeSnapshotsDAL.shouldTakeSnapshot(
      uid,
      practiceStats.language,
      now,
    )
  ) {
    const summary = await computeSummary(uid, practiceStats.language, now);
    await PracticeSnapshotsDAL.recordSnapshot(
      uid,
      practiceStats.language,
      summary,
      now,
    );
  }
}

const CHAR_AFFINITY_WEIGHT = 0.15;
const RECENCY_BOOST = 0.5;
const RECENCY_WINDOW_DAYS = 30;

function charAffinity(
  key: string,
  charWeights: Record<string, number>,
): number {
  let sum = 0;
  let n = 0;
  for (const c of key) {
    if (!/^[a-zÀ-ɏ]$/i.test(c)) continue;
    sum += charWeights[c] ?? 0;
    n++;
  }
  return n > 0 ? sum / n : 0;
}

function recencyMultiplier(
  peakMissRateAt: number | undefined,
  now: number,
): number {
  if (peakMissRateAt === undefined) return 1;
  const days = Math.max(0, now - peakMissRateAt) / DAY_MS;
  const freshness = Math.max(0, 1 - days / RECENCY_WINDOW_DAYS);
  return 1 + RECENCY_BOOST * freshness;
}

function scoreItem(
  stat: UserPracticeStat,
  baselineBurst: number,
  charWeights: Record<string, number>,
  now: number,
): FocusItem {
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
  const recency = recencyMultiplier(stat.peakMissRateAt, now);
  const affinity = charAffinity(stat.key, charWeights);
  const baseScore = confidence * (missRate * 0.7 + slowScore * 0.3) * recency;
  const score = baseScore + CHAR_AFFINITY_WEIGHT * affinity;

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

const GRADUATED_PEAK_THRESHOLD = 0.1;
const GRADUATED_CURRENT_THRESHOLD = 0.05;
const GRADUATED_MIN_ATTEMPTS = 5;

type DecayedStat = UserPracticeStat & {
  attempts: number;
  misses: number;
  burstSum: number;
  burstCount: number;
};

function decayAll(stats: UserPracticeStat[], now: number): DecayedStat[] {
  return stats.map((stat) => ({
    ...stat,
    attempts: decayValue(stat.attempts, stat.decayedAt, now),
    misses: decayValue(stat.misses, stat.decayedAt, now),
    burstSum: decayValue(stat.burstSum, stat.decayedAt, now),
    burstCount: decayValue(stat.burstCount, stat.decayedAt, now),
  }));
}

function summarizeDecayed(decayed: DecayedStat[]): {
  summary: PracticeStatsSummary;
  baselineBurst: number;
  qualifyingItems: DecayedStat[];
} {
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
  return { summary, baselineBurst, qualifyingItems };
}

export async function computeSummary(
  uid: string,
  language: Language,
  now: number,
): Promise<PracticeStatsSummary> {
  const stats = await getCollection().find({ uid, language }).toArray();
  return summarizeDecayed(decayAll(stats, now)).summary;
}

export async function getFocusItems(
  uid: string,
  language: Language,
  now = Date.now(),
): Promise<{
  summary: PracticeStatsSummary;
  words: FocusItem[];
  biwords: FocusItem[];
  graduated: GraduatedItem[];
  topSubstitutions: CharSubstitutionsDAL.TopSubstitution[];
}> {
  const stats = await getCollection().find({ uid, language }).toArray();
  const decayed = decayAll(stats, now);
  const { summary, baselineBurst, qualifyingItems } = summarizeDecayed(decayed);
  const { topSubstitutions, charWeights } =
    await CharSubstitutionsDAL.getCharStats(uid, language, now);

  const scored = qualifyingItems
    .map((stat) => scoreItem(stat, baselineBurst, charWeights, now))
    .filter((stat) => stat.score > 0)
    .sort((a, b) => b.score - a.score);

  const graduated: GraduatedItem[] = decayed
    .filter((stat) => {
      if (
        stat.peakMissRate === undefined ||
        stat.peakMissRateAt === undefined
      ) {
        return false;
      }
      if (stat.attempts < GRADUATED_MIN_ATTEMPTS) return false;
      if (stat.peakMissRate < GRADUATED_PEAK_THRESHOLD) return false;
      const currentMissRate =
        stat.attempts > 0 ? stat.misses / stat.attempts : 0;
      return currentMissRate < GRADUATED_CURRENT_THRESHOLD;
    })
    .map((stat) => ({
      key: stat.key,
      type: stat.type,
      attempts: roundStat(stat.attempts),
      missRate: roundStat(stat.attempts > 0 ? stat.misses / stat.attempts : 0),
      peakMissRate: stat.peakMissRate as number,
      peakMissRateAt: stat.peakMissRateAt as number,
    }))
    .sort((a, b) => b.peakMissRate - a.peakMissRate);

  return {
    summary,
    words: scored.filter((stat) => stat.type === "word"),
    biwords: scored.filter((stat) => stat.type === "biword"),
    graduated,
    topSubstitutions,
  };
}
