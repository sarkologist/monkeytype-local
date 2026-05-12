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
import type { FocusItem } from "@monkeytype/contracts/users";
import { before } from "./practise-words";
import { configEvent } from "../events/config";
import { restartTestEvent } from "../events/test";
import { zipfyRandomArrayIndex } from "../utils/misc";

let focusedPracticeActive = false;

const RETENTION_RATIO = 0.1;

type FocusedPracticeItems = {
  words: FocusItem[];
  biwords: FocusItem[];
  retentionWords: FocusItem[];
  retentionBiwords: FocusItem[];
};

type BuildFocusedPracticeTextOptions = FocusedPracticeItems & {
  targetLength: number;
  fillerProbability: number;
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

function sampleWeighted(
  items: FocusItem[],
  count: number,
  rng: () => number,
): string[] {
  if (items.length === 0 || count === 0) return [];
  const weights = items.map((item) => Math.max(item.score, 1e-6));
  const total = weights.reduce((s, w) => s + w, 0);
  const result: string[] = [];
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
    if (picked !== undefined) result.push(picked.key);
  }
  return result;
}

export function buildFocusedPracticeText({
  words,
  biwords,
  retentionWords,
  retentionBiwords,
  targetLength,
  fillerProbability,
  rng = Math.random,
  pickFiller,
}: BuildFocusedPracticeTextOptions): string[] {
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

  const sampledWords = [
    ...sampleWeighted(words, wordAlloc.struggle, rng),
    ...sampleWeighted(retentionWords, wordAlloc.retention, rng),
  ];
  const sampledBiwords = [
    ...sampleWeighted(biwords, biwordAlloc.struggle, rng),
    ...sampleWeighted(retentionBiwords, biwordAlloc.retention, rng),
  ];
  fillerCount +=
    wordSlots - sampledWords.length + (biwordSlots - sampledBiwords.length);

  const pool = [
    ...sampledWords,
    ...sampledBiwords,
    ...Array.from({ length: fillerCount }, pickFiller),
  ].filter(Boolean);

  for (let i = pool.length; i < targetLength; i++) {
    const filler = pickFiller();
    if (filler === "") break;
    pool.push(filler);
  }

  return pool.slice(0, targetLength);
}

export function isFocusedPracticeActive(): boolean {
  return focusedPracticeActive;
}

export async function init(): Promise<boolean> {
  const response = await Ape.users.getPracticeStats({
    query: { language: Config.language },
  });

  if (response.status !== 200) {
    showErrorNotification("Failed to load focused practice", { response });
    return false;
  }

  const { words, biwords, retentionWords, retentionBiwords } =
    response.body.data;

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

  const pool = buildFocusedPracticeText({
    words,
    biwords,
    retentionWords,
    retentionBiwords,
    targetLength,
    fillerProbability: Config.focusedPracticeFillerProbability,
    pickFiller,
  });

  before.mode = before.mode ?? Config.mode;
  before.punctuation = before.punctuation ?? Config.punctuation;
  before.numbers = before.numbers ?? Config.numbers;
  before.customText = before.customText ?? CustomText.getData();

  setConfig("mode", "custom", { nosave: true });
  CustomText.setPipeDelimiter(true);
  CustomText.setText(pool);
  CustomText.setLimitMode("section");
  CustomText.setMode("shuffle");
  CustomText.setLimitValue(targetLength);
  setCustomTextName("focused practice", undefined);
  focusedPracticeActive = true;

  return true;
}

export function reset(): void {
  focusedPracticeActive = false;
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
