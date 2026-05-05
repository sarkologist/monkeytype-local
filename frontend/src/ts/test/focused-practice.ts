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

function weightedItems(items: FocusItem[], limit: number): string[] {
  const selected: string[] = [];
  const top = items.slice(0, limit);

  top.forEach((item, index) => {
    const repeats = Math.max(1, Math.min(5, top.length - index));
    for (let i = 0; i < repeats; i++) {
      selected.push(item.key);
    }
  });

  return selected;
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

  const focusItems = response.body.data;
  const practiceText = [
    ...weightedItems(focusItems.words, Config.focusedPracticeItemCount),
    ...weightedItems(focusItems.biwords, Config.focusedPracticeItemCount),
  ];

  if (practiceText.length === 0) {
    showNoticeNotification("Not enough focused practice data yet.");
    return false;
  }

  const language = await JSONData.getLanguage(Config.language);
  const filler = language.words.slice(0, 100);
  const fillerCount = Math.ceil(practiceText.length * 0.3);

  for (let i = 0; i < fillerCount; i++) {
    const word = filler[Math.floor(Math.random() * filler.length)];
    if (word !== undefined) practiceText.push(word);
  }

  before.mode = before.mode ?? Config.mode;
  before.punctuation = before.punctuation ?? Config.punctuation;
  before.numbers = before.numbers ?? Config.numbers;
  before.customText = before.customText ?? CustomText.getData();

  setConfig("mode", "custom", { nosave: true });
  CustomText.setPipeDelimiter(true);
  CustomText.setText(practiceText);
  CustomText.setLimitMode("section");
  CustomText.setMode("shuffle");
  const n = Config.focusedPracticeItemCount;
  const perCat = n <= 4 ? (n * (n + 1)) / 2 : 5 * n - 10;
  const totalBeforeFiller = 2 * perCat;
  const targetLength = totalBeforeFiller + Math.ceil(totalBeforeFiller * 0.3);
  CustomText.setLimitValue(Math.min(100, Math.max(20, targetLength)));
  setCustomTextName("focused practice", undefined);
  focusedPracticeActive = true;

  return true;
}

export function reset(): void {
  focusedPracticeActive = false;
}

configEvent.subscribe(({ key, newValue }) => {
  if (key === "mode" && newValue !== "custom") reset();
  if (key === "focusedPracticeItemCount" && focusedPracticeActive) {
    void init().then((started) => {
      if (started) restartTestEvent.dispatch({ practiseMissed: true });
    });
  }
});
