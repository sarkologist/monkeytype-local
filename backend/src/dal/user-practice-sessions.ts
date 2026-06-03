import { Collection, ObjectId } from "mongodb";
import * as db from "../init/db";
import { Language } from "@monkeytype/schemas/languages";
import type { RecordPracticeStatsSessionRequest } from "@monkeytype/contracts/users";

export type UserPracticeSession = RecordPracticeStatsSessionRequest & {
  _id: ObjectId;
  uid: string;
  language: Language;
  createdAt: number;
};

export const getCollection = (): Collection<UserPracticeSession> =>
  db.collection<UserPracticeSession>("userPracticeSessions");

export async function recordSession(
  uid: string,
  session: RecordPracticeStatsSessionRequest,
  now = Date.now(),
): Promise<void> {
  await getCollection().createIndex({ uid: 1, sessionId: 1 }, { unique: true });
  await getCollection().updateOne(
    { uid, sessionId: session.sessionId },
    {
      $set: {
        ...session,
        uid,
        createdAt: now,
      },
      $setOnInsert: {
        _id: new ObjectId(),
      },
    },
    { upsert: true },
  );
}
