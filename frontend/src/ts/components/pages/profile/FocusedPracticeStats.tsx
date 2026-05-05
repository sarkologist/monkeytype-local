import {
  createMemo,
  createResource,
  createSignal,
  For,
  JSXElement,
  Show,
} from "solid-js";

import Ape from "../../../ape";
import { getConfig } from "../../../config/store";
import { Formatting } from "../../../utils/format";

const PAGE_SIZE = 10;

export function FocusedPracticeStats(): JSXElement {
  const language = () => getConfig.language;
  const [stats] = createResource(language, async (lang) => {
    const response = await Ape.users.getPracticeStats({
      query: { language: lang },
    });
    if (response.status !== 200) return null;
    return response.body.data;
  });

  const format = createMemo(() => new Formatting(getConfig));

  const [visibleCount, setVisibleCount] = createSignal(PAGE_SIZE);

  const allItems = createMemo(() => {
    const d = stats();
    if (!d) return [];
    return [...d.words, ...d.biwords].sort((a, b) => b.score - a.score);
  });

  const topItems = createMemo(() => allItems().slice(0, visibleCount()));

  return (
    <Show when={stats()}>
      {(d) => (
        <div class="grid w-full gap-4 rounded bg-sub-alt p-4">
          <div class="text-sub">focused practice</div>
          <Show
            when={d().summary.totalWords + d().summary.totalBiwords > 0}
            fallback={
              <div class="text-sm text-sub">no focused practice data yet</div>
            }
          >
            <div class="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2">
              <div class="flex flex-col">
                <div class="text-em-sm text-sub">words tracked</div>
                <div class="text-em-2xl leading-8">
                  {d().summary.totalWords}
                </div>
              </div>
              <div class="flex flex-col">
                <div class="text-em-sm text-sub">biwords tracked</div>
                <div class="text-em-2xl leading-8">
                  {d().summary.totalBiwords}
                </div>
              </div>
              <div class="flex flex-col">
                <div class="text-em-sm text-sub">miss rate</div>
                <div class="text-em-2xl leading-8">
                  {`${(d().summary.missRate * 100).toFixed(1)}%`}
                </div>
              </div>
              <Show when={d().summary.averageBurst > 0}>
                <div class="flex flex-col">
                  <div class="text-em-sm text-sub">avg burst</div>
                  <div class="text-em-2xl leading-8">
                    {format().typingSpeed(d().summary.averageBurst)}
                  </div>
                </div>
              </Show>
            </div>
            <Show when={topItems().length > 0}>
              <div class="flex flex-col gap-2">
                <div class="text-sm text-sub">top struggling</div>
                <div class="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-6 gap-y-1 text-sm">
                  <div class="text-xs text-sub">word</div>
                  <div class="text-xs text-sub">type</div>
                  <div class="text-xs text-sub">miss rate</div>
                  <div class="text-xs text-sub">avg burst</div>
                  <div class="text-xs text-sub">score</div>
                  <For each={topItems()}>
                    {(item) => (
                      <>
                        <div class="font-mono">{item.key}</div>
                        <div class="text-sub">{item.type}</div>
                        <div>
                          {item.attempts > 0
                            ? `${((item.misses / item.attempts) * 100).toFixed(1)}%`
                            : "-"}
                        </div>
                        <div>
                          {item.averageBurst !== undefined
                            ? format().typingSpeed(item.averageBurst)
                            : "-"}
                        </div>
                        <div>{`${(item.score * 100).toFixed(1)}%`}</div>
                      </>
                    )}
                  </For>
                </div>
                <Show when={visibleCount() < allItems().length}>
                  <button
                    type="button"
                    class="w-fit text-sm text-sub hover:text-text"
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  >
                    load more
                  </button>
                </Show>
              </div>
            </Show>
          </Show>
        </div>
      )}
    </Show>
  );
}
