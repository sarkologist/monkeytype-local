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

function Sparkline(props: {
  values: number[];
  width?: number;
  height?: number;
}): JSXElement {
  const width = () => props.width ?? 120;
  const height = () => props.height ?? 28;
  const points = createMemo(() => {
    const vs = props.values;
    if (vs.length < 2) return "";
    const max = Math.max(...vs);
    const min = Math.min(...vs);
    const range = max - min || 1;
    const w = width();
    const h = height();
    return vs
      .map((v, i) => {
        const x = (i / (vs.length - 1)) * w;
        const y = h - ((v - min) / range) * h;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  });
  return (
    <svg
      width={width()}
      height={height()}
      class="text-text"
      viewBox={`0 0 ${width()} ${height()}`}
    >
      <polyline
        points={points()}
        fill="none"
        stroke="currentColor"
        // oxlint-disable-next-line no-unknown-property
        stroke-width="1.5"
        // oxlint-disable-next-line no-unknown-property
        stroke-linejoin="round"
        // oxlint-disable-next-line no-unknown-property
        stroke-linecap="round"
      ></polyline>
    </svg>
  );
}

function TrendTile(props: {
  label: string;
  values: number[];
  formatValue: (v: number) => string;
}): JSXElement {
  const first = () => props.values[0] ?? 0;
  const last = () => props.values[props.values.length - 1] ?? 0;
  return (
    <div class="flex flex-col gap-1">
      <div class="text-em-sm text-sub">{props.label}</div>
      <Sparkline values={props.values} />
      <div class="flex justify-between text-xs text-sub">
        <span>{props.formatValue(first())}</span>
        <span class="text-text">{props.formatValue(last())}</span>
      </div>
    </div>
  );
}

export function FocusedPracticeStats(): JSXElement {
  const language = () => getConfig.language;
  const [stats] = createResource(language, async (lang) => {
    const response = await Ape.users.getPracticeStats({
      query: { language: lang },
    });
    if (response.status !== 200) return null;
    return response.body.data;
  });
  const [history] = createResource(language, async (lang) => {
    const response = await Ape.users.getPracticeStatsHistory({
      query: { language: lang },
    });
    if (response.status !== 200) return null;
    return response.body.data.snapshots;
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
                <div class="text-em-sm text-sub">attempts logged</div>
                <div class="text-em-2xl leading-8">
                  {Math.round(d().summary.totalAttempts).toLocaleString()}
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
            <Show when={(history() ?? []).length >= 2}>
              {(_) => {
                const snaps = () => history() ?? [];
                return (
                  <div class="flex flex-col gap-2">
                    <div class="text-sm text-sub">
                      {`trend (${snaps().length} weekly snapshots)`}
                    </div>
                    <div class="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4">
                      <TrendTile
                        label="miss rate"
                        values={snaps().map((s) => s.missRate)}
                        formatValue={(v) => `${(v * 100).toFixed(1)}%`}
                      />
                      <Show when={snaps().some((s) => s.averageBurst > 0)}>
                        <TrendTile
                          label="avg burst"
                          values={snaps().map((s) => s.averageBurst)}
                          formatValue={(v) => format().typingSpeed(v)}
                        />
                      </Show>
                      <TrendTile
                        label="attempts logged"
                        values={snaps().map((s) => s.totalAttempts)}
                        formatValue={(v) => Math.round(v).toLocaleString()}
                      />
                      <TrendTile
                        label="items tracked"
                        values={snaps().map(
                          (s) => s.totalWords + s.totalBiwords,
                        )}
                        formatValue={(v) => Math.round(v).toString()}
                      />
                    </div>
                  </div>
                );
              }}
            </Show>
            <Show when={topItems().length > 0}>
              <div class="flex flex-col gap-2">
                <div class="text-sm text-sub">top struggling</div>
                <div class="grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-x-6 gap-y-1 text-sm">
                  <div class="text-xs text-sub">word</div>
                  <div class="text-xs text-sub">type</div>
                  <div class="text-xs text-sub">attempts</div>
                  <div class="text-xs text-sub">miss rate</div>
                  <div class="text-xs text-sub">avg burst</div>
                  <div class="text-xs text-sub">score</div>
                  <For each={topItems()}>
                    {(item) => (
                      <>
                        <div class="font-mono">{item.key}</div>
                        <div class="text-sub">{item.type}</div>
                        <div>{Math.round(item.attempts)}</div>
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
            <Show when={d().graduated.length > 0}>
              <div class="flex flex-col gap-2">
                <div class="text-sm text-sub">graduated</div>
                <div class="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-6 gap-y-1 text-sm">
                  <div class="text-xs text-sub">word</div>
                  <div class="text-xs text-sub">type</div>
                  <div class="text-xs text-sub">peak miss rate</div>
                  <div class="text-xs text-sub">now</div>
                  <For each={d().graduated}>
                    {(item) => (
                      <>
                        <div class="font-mono">{item.key}</div>
                        <div class="text-sub">{item.type}</div>
                        <div class="text-sub">{`${(item.peakMissRate * 100).toFixed(1)}%`}</div>
                        <div>{`${(item.missRate * 100).toFixed(1)}%`}</div>
                      </>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </Show>
        </div>
      )}
    </Show>
  );
}
