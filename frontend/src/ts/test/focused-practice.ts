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
import { FocusItem } from "@monkeytype/contracts/users";
import { before } from "./practise-words";
import { configEvent } from "../events/config";
import { restartTestEvent } from "../events/test";

let focusedPracticeActive = false;

function sampleWeighted(items: FocusItem[], count: number): string[] {
  if (items.length === 0 || count === 0) return [];
  const weights = items.map((item) => Math.max(item.score, 1e-6));
  const total = weights.reduce((s, w) => s + w, 0);
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    let r = Math.random() * total;
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

  const { words, biwords } = response.body.data;

  if (words.length === 0 && biwords.length === 0) {
    showNoticeNotification("Not enough focused practice data yet.");
    return false;
  }

  const targetLength = Config.focusedPracticeWordCount;
  const practiceCount = Math.round(
    targetLength * (1 - Config.focusedPracticeFillerProbability),
  );
  const fillerCount = targetLength - practiceCount;
  const wordSlots = Math.ceil(practiceCount / 2);
  const biwordSlots = practiceCount - wordSlots;

  const language = await JSONData.getLanguage(Config.language);
  const fillerPool = language.words.slice(0, 100);

  const pool = [
    ...sampleWeighted(words, wordSlots),
    ...sampleWeighted(biwords, biwordSlots),
    ...Array.from(
      { length: fillerCount },
      () => fillerPool[Math.floor(Math.random() * fillerPool.length)] ?? "",
    ),
  ].filter(Boolean);

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
