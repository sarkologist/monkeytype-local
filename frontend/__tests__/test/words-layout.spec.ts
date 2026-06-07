import { describe, expect, it } from "vitest";
import { shouldCenterWords } from "../../src/ts/test/words-layout";

const word = (top: number, hidden = false) => ({
  getOffsetTop: () => top,
  hasClass: (className: string) => hidden && className === "hidden",
});

describe("shouldCenterWords", () => {
  const defaults = {
    mode: "words",
    tapeMode: "off",
    wordsHaveNewline: false,
    currentTestLine: 0,
  };

  it("centers when all visible words are on one line", () => {
    expect(
      shouldCenterWords({
        ...defaults,
        wordElements: [word(12), word(12), word(12)],
      }),
    ).toBe(true);
  });

  it("does not center when words wrap to multiple lines", () => {
    expect(
      shouldCenterWords({
        ...defaults,
        wordElements: [word(12), word(12), word(44)],
      }),
    ).toBe(false);
  });

  it("ignores hidden words when checking line count", () => {
    expect(
      shouldCenterWords({
        ...defaults,
        wordElements: [word(12), word(44, true), word(12)],
      }),
    ).toBe(true);
  });

  it("does not center zen mode", () => {
    expect(
      shouldCenterWords({
        ...defaults,
        mode: "zen",
        wordElements: [word(12)],
      }),
    ).toBe(false);
  });

  it("does not center tape mode", () => {
    expect(
      shouldCenterWords({
        ...defaults,
        tapeMode: "word",
        wordElements: [word(12)],
      }),
    ).toBe(false);
  });

  it("does not center tests with explicit newlines", () => {
    expect(
      shouldCenterWords({
        ...defaults,
        wordsHaveNewline: true,
        wordElements: [word(12)],
      }),
    ).toBe(false);
  });

  it("does not center after a line jump", () => {
    expect(
      shouldCenterWords({
        ...defaults,
        currentTestLine: 1,
        wordElements: [word(12)],
      }),
    ).toBe(false);
  });
});
