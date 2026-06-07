export type WordLayoutElement = {
  getOffsetTop: () => number;
  hasClass: (className: string) => boolean;
};

export function shouldCenterWords(options: {
  mode: string;
  tapeMode: string;
  wordsHaveNewline: boolean;
  currentTestLine: number;
  wordElements: readonly WordLayoutElement[];
}): boolean {
  if (
    options.mode === "zen" ||
    options.tapeMode !== "off" ||
    options.wordsHaveNewline ||
    options.currentTestLine > 0
  ) {
    return false;
  }

  let firstTop: number | undefined;
  for (const word of options.wordElements) {
    if (word.hasClass("hidden")) continue;

    const top = word.getOffsetTop();
    if (firstTop === undefined) {
      firstTop = top;
    } else if (top !== firstTop) {
      return false;
    }
  }

  return firstTop !== undefined;
}
