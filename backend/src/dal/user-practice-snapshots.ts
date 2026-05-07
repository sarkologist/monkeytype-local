import { Collection, ObjectId } from "mongodb";
import * as db from "../init/db";
import { Language } from "@monkeytype/schemas/languages";

export type UserPracticeSnapshot = {
  _id: ObjectId;
  uid: string;
  language: Language;
  takenAt: number;
  totalWords: number;
  totalBiwords: number;
  totalAttempts: number;
  missRate: number;
  averageBurst: number;
};

export type SnapshotSummary = Omit<
  UserPracticeSnapshot,
  "_id" | "uid" | "language" | "takenAt"
>;

const SNAPSHOT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SNAPSHOTS = 26;

export const getCollection = (): Collection<UserPracticeSnapshot> =>
  db.collection<UserPracticeSnapshot>("userPracticeSnapshots");

export async function getLatestSnapshot(
  uid: string,
  language: Language,
): Promise<UserPracticeSnapshot | null> {
  return getCollection().findOne({ uid, language }, { sort: { takenAt: -1 } });
}

export async function recordSnapshot(
  uid: string,
  language: Language,
  summary: SnapshotSummary,
  now: number,
): Promise<void> {
  await getCollection().createIndex({ uid: 1, language: 1, takenAt: 1 });
  await getCollection().insertOne({
    _id: new ObjectId(),
    uid,
    language,
    takenAt: now,
    ...summary,
  });

  const all = await getCollection()
    .find({ uid, language })
    .sort({ takenAt: -1 })
    .toArray();
  if (all.length > MAX_SNAPSHOTS) {
    const toDelete = all.slice(MAX_SNAPSHOTS).map((s) => s._id);
    await getCollection().deleteMany({ _id: { $in: toDelete } });
  }
}

export async function shouldTakeSnapshot(
  uid: string,
  language: Language,
  now: number,
): Promise<boolean> {
  const latest = await getLatestSnapshot(uid, language);
  return latest === null || now - latest.takenAt >= SNAPSHOT_INTERVAL_MS;
}

export async function getSnapshots(
  uid: string,
  language: Language,
): Promise<UserPracticeSnapshot[]> {
  return getCollection().find({ uid, language }).sort({ takenAt: 1 }).toArray();
}
