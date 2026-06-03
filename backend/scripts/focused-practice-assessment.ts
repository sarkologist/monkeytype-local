import { MongoClient } from "mongodb";

type StatDoc = {
  uid: string;
  language: string;
  source?: string;
  type: "word" | "biword";
  key: string;
  attempts: number;
  misses: number;
  burstSum: number;
  burstCount: number;
  decayedAt: number;
  peakMissRate?: number;
  peakMissRateAt?: number;
};

type SessionDoc = {
  uid: string;
  language: string;
  sessionId: string;
  createdAt: number;
  items: Array<{
    key: string;
    type: "word" | "biword";
    role: "struggle" | "retention" | "filler" | "holdout";
    count: number;
  }>;
};

type ResultDoc = {
  uid: string;
  language?: string;
  timestamp: number;
  wpm: number;
  acc: number;
  practiceSource?: "focused";
  practiceSessionId?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_LIFE_DAYS = 30;
const now = Date.now();

function decay(value: number, decayedAt: number): number {
  const days = Math.max(0, now - decayedAt) / DAY_MS;
  return value * Math.pow(0.5, days / HALF_LIFE_DAYS);
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeStats(stats: StatDoc[]): {
  docs: number;
  attempts: number;
  missRate: number;
  averageBurst: number;
} {
  const decayed = stats.map((stat) => ({
    attempts: decay(stat.attempts, stat.decayedAt),
    misses: decay(stat.misses, stat.decayedAt),
    burstSum: decay(stat.burstSum, stat.decayedAt),
    burstCount: decay(stat.burstCount, stat.decayedAt),
  }));
  const attempts = decayed.reduce((sum, stat) => sum + stat.attempts, 0);
  const misses = decayed.reduce((sum, stat) => sum + stat.misses, 0);
  const burstSum = decayed.reduce((sum, stat) => sum + stat.burstSum, 0);
  const burstCount = decayed.reduce((sum, stat) => sum + stat.burstCount, 0);
  return {
    docs: stats.length,
    attempts: round(attempts, 1),
    missRate: round(attempts > 0 ? misses / attempts : 0, 4),
    averageBurst: round(burstCount > 0 ? burstSum / burstCount : 0, 1),
  };
}

function resultTrend(results: ResultDoc[]): {
  count: number;
  first100Wpm: number;
  last100Wpm: number;
  first100Acc: number;
  last100Acc: number;
} {
  const sorted = [...results].sort((a, b) => a.timestamp - b.timestamp);
  const first = sorted.slice(0, 100);
  const last = sorted.slice(-100);
  return {
    count: sorted.length,
    first100Wpm: round(average(first.map((result) => result.wpm)), 2),
    last100Wpm: round(average(last.map((result) => result.wpm)), 2),
    first100Acc: round(average(first.map((result) => result.acc)), 2),
    last100Acc: round(average(last.map((result) => result.acc)), 2),
  };
}

function sessionExposure(sessions: SessionDoc[]): Map<string, number> {
  const exposure = new Map<string, number>();
  for (const session of sessions) {
    for (const item of session.items) {
      if (item.role !== "struggle" && item.role !== "retention") continue;
      const id = `${session.uid}:${session.language}:${item.type}:${item.key}`;
      exposure.set(id, (exposure.get(id) ?? 0) + item.count);
    }
  }
  return exposure;
}

function roleSet(
  sessions: SessionDoc[],
  role: SessionDoc["items"][number]["role"],
): Set<string> {
  const ids = new Set<string>();
  for (const session of sessions) {
    for (const item of session.items) {
      if (item.role !== role) continue;
      ids.add(`${session.uid}:${session.language}:${item.type}:${item.key}`);
    }
  }
  return ids;
}

async function main(): Promise<void> {
  const client = new MongoClient(
    process.env["DB_URI"] ?? "mongodb://localhost:27017",
  );
  await client.connect();
  const database = client.db(process.env["DB_NAME"] ?? "monkeytype");

  const sourceStats = await database
    .collection<StatDoc>("userPracticeSourceStats")
    .find({})
    .toArray();
  const aggregateStats = await database
    .collection<StatDoc>("userPracticeStats")
    .find({})
    .toArray();
  const sessions = await database
    .collection<SessionDoc>("userPracticeSessions")
    .find({})
    .toArray();
  const focusedResults = await database
    .collection<ResultDoc>("results")
    .find({ practiceSource: "focused" })
    .toArray();

  const coverage = new Map<string, StatDoc[]>();
  for (const stat of sourceStats) {
    const key = `${stat.uid}/${stat.language}/${stat.source ?? "unknown"}`;
    coverage.set(key, [...(coverage.get(key) ?? []), stat]);
  }

  const exposure = sessionExposure(sessions);
  const holdoutIds = roleSet(sessions, "holdout");
  const practicedIds = new Set(exposure.keys());
  const practiced = aggregateStats.filter((stat) =>
    practicedIds.has(`${stat.uid}:${stat.language}:${stat.type}:${stat.key}`),
  );
  const holdout = aggregateStats.filter((stat) =>
    holdoutIds.has(`${stat.uid}:${stat.language}:${stat.type}:${stat.key}`),
  );
  const retention = aggregateStats.filter((stat) =>
    roleSet(sessions, "retention").has(
      `${stat.uid}:${stat.language}:${stat.type}:${stat.key}`,
    ),
  );

  const doseBuckets = [1, 5, 10, 20].map((min) => {
    const ids = [...exposure.entries()]
      .filter(([, count]) => count >= min)
      .map(([id]) => id);
    const stats = aggregateStats.filter((stat) =>
      ids.includes(`${stat.uid}:${stat.language}:${stat.type}:${stat.key}`),
    );
    return { minSessionCount: min, ...summarizeStats(stats) };
  });

  console.log(
    JSON.stringify(
      {
        assessedAt: new Date(now).toISOString(),
        coverage: [...coverage.entries()].map(([key, stats]) => ({
          key,
          ...summarizeStats(stats),
        })),
        focusedResults: resultTrend(focusedResults),
        practicedVsHoldout: {
          practiced: summarizeStats(practiced),
          holdout: summarizeStats(holdout),
        },
        retentionRelapse: summarizeStats(retention),
        doseResponse: doseBuckets,
      },
      null,
      2,
    ),
  );

  await client.close();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
