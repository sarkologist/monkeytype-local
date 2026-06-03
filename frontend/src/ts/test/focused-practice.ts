import Ape from "../ape";
import { Config } from "../config/store";
import { setConfig } from "../config/setters";
import * as CustomText from "./custom-text";
import * as JSONData from "../utils/json-data";
import {
  showErrorNotification,
  showNoticeNotification,
} from "../states/notifications";
import { setCustomTextName } from "../legacy-states/custom-text-name";
import type {
  FocusItem,
  PracticeStatsSessionItem,
} from "@monkeytype/contracts/users";
import { before } from "./practise-words";
import { configEvent } from "../events/config";
import { restartTestEvent } from "../events/test";
import { zipfyRandomArrayIndex } from "../utils/misc";

let focusedPracticeActive = false;
let activePracticeSessionId: string | undefined;

const RETENTION_RATIO = 0.1;

type FocusedPracticeItems = {
  words: FocusItem[];
  biwords: FocusItem[];
  retentionWords: FocusItem[];
  retentionBiwords: FocusItem[];
  holdoutWords: FocusItem[];
  holdoutBiwords: FocusItem[];
};

type BuildFocusedPracticeTextOptions = FocusedPracticeItems & {
  targetLength: number;
  fillerProbability: number;
  seed?: number;
  rng?: () => number;
  pickFiller: () => string;
};

function allocateSlots(
  struggleCount: number,
  retentionCount: number,
  totalSlots: number,
): { struggle: number; retention: number } {
  if (totalSlots === 0) return { struggle: 0, retention: 0 };
  if (struggleCount === 0 && retentionCount === 0) {
    return { struggle: 0, retention: 0 };
  }
  if (struggleCount === 0) return { struggle: 0, retention: totalSlots };
  if (retentionCount === 0) return { struggle: totalSlots, retention: 0 };
  const retention = Math.max(1, Math.round(totalSlots * RETENTION_RATIO));
  return { struggle: totalSlots - retention, retention };
}

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleWeightedItems(
  items: FocusItem[],
  count: number,
  rng: () => number,
): FocusItem[] {
  if (items.length === 0 || count === 0) return [];
  const weights = items.map((item) => Math.max(item.score, 1e-6));
  const total = weights.reduce((s, w) => s + w, 0);
  const result: FocusItem[] = [];
  for (let i = 0; i < count; i++) {
    let r = rng() * total;
    let picked = items[items.length - 1] ?? items[0];
    for (let j = 0; j < weights.length; j++) {
      r -= weights[j] ?? 0;
      if (r <= 0) {
        picked = items[j] ?? picked;
        break;
      }
    }
    if (picked !== undefined) result.push(picked);
  }
  return result;
}

function planFromItems(
  items: FocusItem[],
  role: PracticeStatsSessionItem["role"],
): PracticeStatsSessionItem[] {
  const counts = new Map<string, { item: FocusItem; count: number }>();
  for (const item of items) {
    const existing = counts.get(`${item.type}:${item.key}`);
    if (existing === undefined) {
      counts.set(`${item.type}:${item.key}`, { item, count: 1 });
    } else {
      existing.count++;
    }
  }

  return [...counts.values()].map(({ item, count }) => ({
    key: item.key,
    type: item.type,
    role,
    score: item.score,
    attempts: item.attempts,
    misses: item.misses,
    count,
  }));
}

function fillerPlanItems(fillers: string[]): PracticeStatsSessionItem[] {
  const counts = new Map<string, number>();
  for (const filler of fillers) {
    counts.set(filler, (counts.get(filler) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => ({
    key,
    type: "word",
    role: "filler",
    count,
  }));
}

export function buildFocusedPracticeSession({
  words,
  biwords,
  retentionWords,
  retentionBiwords,
  holdoutWords,
  holdoutBiwords,
  targetLength,
  fillerProbability,
  seed,
  rng,
  pickFiller,
}: BuildFocusedPracticeTextOptions): {
  text: string[];
  planItems: PracticeStatsSessionItem[];
} {
  const sessionRng = rng ?? createSeededRng(seed ?? Date.now());
  const practiceCount = Math.round(targetLength * (1 - fillerProbability));
  let fillerCount = targetLength - practiceCount;
  const wordSlots = Math.ceil(practiceCount / 2);
  const biwordSlots = practiceCount - wordSlots;

  const wordAlloc = allocateSlots(
    words.length,
    retentionWords.length,
    wordSlots,
  );
  const biwordAlloc = allocateSlots(
    biwords.length,
    retentionBiwords.length,
    biwordSlots,
  );

  const sampledStruggleWords = sampleWeightedItems(
    words,
    wordAlloc.struggle,
    sessionRng,
  );
  const sampledRetentionWords = sampleWeightedItems(
    retentionWords,
    wordAlloc.retention,
    sessionRng,
  );
  const sampledStruggleBiwords = sampleWeightedItems(
    biwords,
    biwordAlloc.struggle,
    sessionRng,
  );
  const sampledRetentionBiwords = sampleWeightedItems(
    retentionBiwords,
    biwordAlloc.retention,
    sessionRng,
  );
  const sampledWords = [...sampledStruggleWords, ...sampledRetentionWords];
  const sampledBiwords = [
    ...sampledStruggleBiwords,
    ...sampledRetentionBiwords,
  ];
  fillerCount +=
    wordSlots - sampledWords.length + (biwordSlots - sampledBiwords.length);
  const fillers = Array.from({ length: fillerCount }, pickFiller).filter(
    Boolean,
  );

  const pool = [
    ...sampledWords.map((item) => item.key),
    ...sampledBiwords.map((item) => item.key),
    ...fillers,
  ].filter(Boolean);

  for (let i = pool.length; i < targetLength; i++) {
    const filler = pickFiller();
    if (filler === "") break;
    pool.push(filler);
    fillers.push(filler);
  }

  return {
    text: pool.slice(0, targetLength),
    planItems: [
      ...planFromItems(sampledStruggleWords, "struggle"),
      ...planFromItems(sampledStruggleBiwords, "struggle"),
      ...planFromItems(sampledRetentionWords, "retention"),
      ...planFromItems(sampledRetentionBiwords, "retention"),
      ...fillerPlanItems(fillers),
      ...planFromItems([...holdoutWords, ...holdoutBiwords], "holdout").map(
        (item) => ({ ...item, count: 0 }),
      ),
    ],
  };
}

export function buildFocusedPracticeText(
  options: BuildFocusedPracticeTextOptions,
): string[] {
  return buildFocusedPracticeSession(options).text;
}

export function isFocusedPracticeActive(): boolean {
  return focusedPracticeActive;
}

export function getActivePracticeSessionId(): string | undefined {
  return activePracticeSessionId;
}

export async function init(): Promise<boolean> {
  const response = await Ape.users.getPracticeStats({
    query: { language: Config.language },
  });

  if (response.status !== 200) {
    showErrorNotification("Failed to load focused practice", { response });
    return false;
  }

  const {
    words,
    biwords,
    retentionWords,
    retentionBiwords,
    holdoutWords,
    holdoutBiwords,
  } = response.body.data;

  const targetLength = Config.focusedPracticeWordCount;

  if (words.length === 0 && biwords.length === 0) {
    showNoticeNotification(
      "Building up your stats — using common words for now.",
    );
  }

  const language = await JSONData.getLanguage(Config.language);
  const pickFiller = language.orderedByFrequency
    ? () => language.words[zipfyRandomArrayIndex(language.words.length)] ?? ""
    : (() => {
        const pool = language.words.slice(0, 100);
        return () => pool[Math.floor(Math.random() * pool.length)] ?? "";
      })();

  const seed = Math.floor(Math.random() * 2 ** 32);
  const sessionId = `fp_${Date.now()}_${seed}`;
  const session = buildFocusedPracticeSession({
    words,
    biwords,
    retentionWords,
    retentionBiwords,
    holdoutWords,
    holdoutBiwords,
    targetLength,
    fillerProbability: Config.focusedPracticeFillerProbability,
    seed,
    pickFiller,
  });

  before.mode = before.mode ?? Config.mode;
  before.punctuation = before.punctuation ?? Config.punctuation;
  before.numbers = before.numbers ?? Config.numbers;
  before.customText = before.customText ?? CustomText.getData();

  setConfig("mode", "custom", { nosave: true });
  CustomText.setPipeDelimiter(true);
  CustomText.setText(session.text);
  CustomText.setLimitMode("section");
  CustomText.setMode("shuffle");
  CustomText.setLimitValue(targetLength);
  setCustomTextName("focused practice", undefined);
  activePracticeSessionId = sessionId;
  focusedPracticeActive = true;

  void Ape.users
    .recordPracticeStatsSession({
      body: {
        sessionId,
        language: Config.language,
        source: "focused",
        seed,
        config: {
          wordCount: targetLength,
          fillerProbability: Config.focusedPracticeFillerProbability,
        },
        items: session.planItems,
      },
    })
    .then((recordResponse) => {
      if (recordResponse.status !== 200) {
        console.log("Error recording focused practice session", recordResponse);
      }
    })
    .catch((error: unknown) => {
      console.log("Error recording focused practice session", error);
    });

  return true;
}

export function reset(): void {
  focusedPracticeActive = false;
  activePracticeSessionId = undefined;
}

configEvent.subscribe(({ key, newValue }) => {
  if (key === "mode" && newValue !== "custom") reset();
  if (
    (key === "focusedPracticeWordCount" ||
      key === "focusedPracticeFillerProbability") &&
    focusedPracticeActive
  ) {
    void init().then((started) => {
      if (started) restartTestEvent.dispatch({ practiseMissed: true });
    });
  }
});
