import { Collection, ObjectId } from "mongodb";
import * as db from "../init/db";
import { Language } from "@monkeytype/schemas/languages";
import { PracticeCharSubstitution } from "@monkeytype/schemas/results";

export type UserCharSubstitution = {
  _id: ObjectId;
  uid: string;
  language: Language;
  target: string;
  typed: string;
  count: number;
  lastSeen: number;
  decayedAt: number;
};

export type TopSubstitution = {
  target: string;
  typed: string;
  count: number;
};

const HALF_LIFE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_LIMIT = 10;

export const getCollection = (): Collection<UserCharSubstitution> =>
  db.collection<UserCharSubstitution>("userCharSubstitutions");

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
  entry: PracticeCharSubstitution,
  weight: number,
  now: number,
): Promise<void> {
  const filter = { uid, language, target: entry.target, typed: entry.typed };
  const existing = await getCollection().findOne(filter);
  const weightedCount = entry.count * weight;
  if (existing === null) {
    await getCollection().insertOne({
      _id: new ObjectId(),
      ...filter,
      count: roundStat(weightedCount),
      lastSeen: now,
      decayedAt: now,
    });
    return;
  }
  await getCollection().updateOne(filter, {
    $set: {
      count: roundStat(
        decayValue(existing.count, existing.decayedAt, now) + weightedCount,
      ),
      lastSeen: now,
      decayedAt: now,
    },
  });
}

export async function updateStats(
  uid: string,
  language: Language,
  chars: PracticeCharSubstitution[],
  weight: number | undefined,
  now = Date.now(),
): Promise<void> {
  if (chars.length === 0) return;
  await getCollection().createIndex(
    { uid: 1, language: 1, target: 1, typed: 1 },
    { unique: true },
  );
  const w = clampWeight(weight);
  for (const entry of chars) {
    await updateEntry(uid, language, entry, w, now);
  }
}

export type CharStats = {
  topSubstitutions: TopSubstitution[];
  charWeights: Record<string, number>;
};

export async function getCharStats(
  uid: string,
  language: Language,
  now = Date.now(),
): Promise<CharStats> {
  const docs = await getCollection().find({ uid, language }).toArray();
  const decayed = docs.map((d) => ({
    target: d.target,
    typed: d.typed,
    count: roundStat(decayValue(d.count, d.decayedAt, now)),
  }));

  const topSubstitutions = decayed
    .filter((d) => d.count >= 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_LIMIT);

  const targetCounts: Record<string, number> = {};
  for (const d of decayed) {
    targetCounts[d.target] = (targetCounts[d.target] ?? 0) + d.count;
  }
  const max = Math.max(0, ...Object.values(targetCounts));
  const charWeights: Record<string, number> = {};
  if (max > 0) {
    for (const [c, count] of Object.entries(targetCounts)) {
      charWeights[c] = roundStat(count / max);
    }
  }

  return { topSubstitutions, charWeights };
}

export async function getTopSubstitutions(
  uid: string,
  language: Language,
  now = Date.now(),
): Promise<TopSubstitution[]> {
  return (await getCharStats(uid, language, now)).topSubstitutions;
}
