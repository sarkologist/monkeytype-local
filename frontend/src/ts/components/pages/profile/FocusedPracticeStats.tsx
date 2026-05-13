import type {
  FocusItem,
  GraduatedItem,
  TopSubstitution,
} from "@monkeytype/contracts/users";

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
import { cn } from "../../../utils/cn";
import { Formatting } from "../../../utils/format";

const PAGE_SIZE = 10;
const CHART_LIMIT = 6;

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function itemMissRate(item: FocusItem): number {
  return item.attempts > 0 ? item.misses / item.attempts : 0;
}

function ChartBlock(props: {
  title: string;
  children: JSXElement;
}): JSXElement {
  return (
    <div class="grid min-w-0 gap-2 border-t border-sub pt-3">
      <div class="text-sm text-sub">{props.title}</div>
      {props.children}
    </div>
  );
}

function WeaknessMixChart(props: { items: FocusItem[] }): JSXElement {
  const items = createMemo(() =>
    props.items.filter((item) => item.breakdown !== undefined).slice(0, 5),
  );
  const segmentDefs = [
    { key: "missRate", label: "miss", weight: 0.6, class: "bg-error" },
    { key: "slowScore", label: "slow", weight: 0.25, class: "bg-main" },
    { key: "inconsistency", label: "swing", weight: 0.15, class: "bg-sub" },
    { key: "affinity", label: "chars", weight: 0.15, class: "bg-text" },
  ] as const;

  return (
    <Show when={items().length > 0}>
      <ChartBlock title="weakness mix">
        <div class="grid gap-2 text-xs">
          <div class="flex flex-wrap gap-x-3 gap-y-1 text-sub">
            <For each={segmentDefs}>
              {(segment) => (
                <span class="flex items-center gap-1">
                  <span class={cn("h-2 w-2 rounded-sm", segment.class)}></span>
                  {segment.label}
                </span>
              )}
            </For>
          </div>
          <For each={items()}>
            {(item) => {
              const values = () =>
                segmentDefs.map((segment) => ({
                  ...segment,
                  value: (item.breakdown?.[segment.key] ?? 0) * segment.weight,
                }));
              const total = () =>
                values().reduce((sum, segment) => sum + segment.value, 0) || 1;
              return (
                <div class="grid grid-cols-[minmax(0,8rem)_1fr] items-center gap-2">
                  <div class="truncate font-mono">{item.key}</div>
                  <div class="flex h-2 overflow-hidden rounded bg-bg">
                    <For each={values()}>
                      {(segment) => (
                        <div
                          class={segment.class}
                          style={{
                            width: `${(segment.value / total()) * 100}%`,
                          }}
                          title={`${segment.label}: ${formatPercent(
                            segment.value,
                          )}`}
                        ></div>
                      )}
                    </For>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </ChartBlock>
    </Show>
  );
}

function AttemptsMissScatter(props: { items: FocusItem[] }): JSXElement {
  const width = 260;
  const height = 120;
  const pad = 16;
  const items = createMemo(() => props.items.slice(0, 20));
  const maxAttempts = createMemo(() =>
    Math.max(1, ...items().map((item) => item.attempts)),
  );
  const maxMissRate = createMemo(() =>
    Math.max(0.01, ...items().map(itemMissRate)),
  );

  return (
    <Show when={items().length > 0}>
      <ChartBlock title="attempts vs misses">
        <div class="grid gap-1 text-xs text-sub">
          <svg
            width="100%"
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            class="overflow-visible"
          >
            <line
              x1={pad}
              y1={height - pad}
              x2={width - pad}
              y2={height - pad}
              class="stroke-sub"
              // oxlint-disable-next-line no-unknown-property
              stroke-width="1"
            ></line>
            <line
              x1={pad}
              y1={pad}
              x2={pad}
              y2={height - pad}
              class="stroke-sub"
              // oxlint-disable-next-line no-unknown-property
              stroke-width="1"
            ></line>
            <For each={items()}>
              {(item) => {
                const x =
                  pad + (item.attempts / maxAttempts()) * (width - pad * 2);
                const y =
                  height -
                  pad -
                  (itemMissRate(item) / maxMissRate()) * (height - pad * 2);
                return (
                  <circle
                    cx={x}
                    cy={y}
                    r={Math.max(3, Math.min(7, 3 + item.score * 5))}
                    class={cn(
                      "fill-[currentColor]",
                      item.type === "word" ? "text-main" : "text-error",
                    )}
                  >
                    <title>{`${item.key}: ${Math.round(
                      item.attempts,
                    )} attempts, ${formatPercent(itemMissRate(item))} misses`}</title>
                  </circle>
                );
              }}
            </For>
          </svg>
          <div class="flex justify-between">
            <span>0 attempts</span>
            <span>{`${Math.round(maxAttempts())} attempts`}</span>
          </div>
        </div>
      </ChartBlock>
    </Show>
  );
}

function ScoreDistributionChart(props: { items: FocusItem[] }): JSXElement {
  const buckets = createMemo(() => {
    const ranges = [
      { label: "0-20%", min: 0, max: 0.2 },
      { label: "20-40%", min: 0.2, max: 0.4 },
      { label: "40-60%", min: 0.4, max: 0.6 },
      { label: "60-80%", min: 0.6, max: 0.8 },
      { label: "80%+", min: 0.8, max: Infinity },
    ];
    return ranges.map((range) => ({
      ...range,
      count: props.items.filter(
        (item) => item.score >= range.min && item.score < range.max,
      ).length,
    }));
  });
  const maxCount = createMemo(() =>
    Math.max(1, ...buckets().map((bucket) => bucket.count)),
  );

  return (
    <Show when={props.items.length > 0}>
      <ChartBlock title="score distribution">
        <div class="grid gap-1 text-xs">
          <For each={buckets()}>
            {(bucket) => (
              <div class="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2">
                <div class="text-sub">{bucket.label}</div>
                <div class="h-2 overflow-hidden rounded bg-bg">
                  <div
                    class="h-full rounded bg-main"
                    style={{
                      width: `${(bucket.count / maxCount()) * 100}%`,
                    }}
                  ></div>
                </div>
                <div>{bucket.count}</div>
              </div>
            )}
          </For>
        </div>
      </ChartBlock>
    </Show>
  );
}

function MistakeHeatmap(props: {
  substitutions: TopSubstitution[];
}): JSXElement {
  const substitutions = createMemo(() => props.substitutions.slice(0, 10));
  const maxCount = createMemo(() =>
    Math.max(1, ...substitutions().map((item) => item.count)),
  );

  return (
    <Show when={substitutions().length > 0}>
      <ChartBlock title="mistake heatmap">
        <div class="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
          <For each={substitutions()}>
            {(item) => (
              <>
                <div
                  class="h-5 w-5 rounded-sm bg-main"
                  style={{
                    opacity: `${0.25 + 0.75 * (item.count / maxCount())}`,
                  }}
                ></div>
                <div class="font-mono">{`${item.typed} -> ${item.target}`}</div>
                <div>{Math.round(item.count)}</div>
              </>
            )}
          </For>
        </div>
      </ChartBlock>
    </Show>
  );
}

function GraduationProgressChart(props: {
  items: GraduatedItem[];
}): JSXElement {
  const items = createMemo(() => props.items.slice(0, CHART_LIMIT));
  const maxMissRate = createMemo(() =>
    Math.max(0.01, ...items().map((item) => item.peakMissRate)),
  );
  const formatDate = (timestamp: number): string =>
    new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

  return (
    <Show when={items().length > 0}>
      <ChartBlock title="graduation progress">
        <div class="grid gap-2 text-xs">
          <For each={items()}>
            {(item) => {
              const nowX = (item.missRate / maxMissRate()) * 100;
              const peakX = (item.peakMissRate / maxMissRate()) * 100;
              return (
                <div class="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-2">
                  <div class="truncate font-mono">{item.key}</div>
                  <svg width="100%" height="18" viewBox="0 0 100 18">
                    <line
                      x1={nowX}
                      y1="9"
                      x2={peakX}
                      y2="9"
                      class="stroke-sub"
                      // oxlint-disable-next-line no-unknown-property
                      stroke-width="2"
                    ></line>
                    <circle
                      cx={peakX}
                      cy="9"
                      r="4"
                      class="fill-[currentColor] text-error"
                    ></circle>
                    <circle
                      cx={nowX}
                      cy="9"
                      r="4"
                      class="fill-[currentColor] text-main"
                    ></circle>
                  </svg>
                  <div class="text-right text-sub">
                    {`${formatPercent(item.peakMissRate)} -> ${formatPercent(
                      item.missRate,
                    )} ${formatDate(item.peakMissRateAt)}`}
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </ChartBlock>
    </Show>
  );
}

function RetentionQueueChart(props: {
  words: FocusItem[];
  biwords: FocusItem[];
}): JSXElement {
  const items = createMemo(() =>
    [...props.words, ...props.biwords]
      .sort((a, b) => b.score - a.score)
      .slice(0, CHART_LIMIT),
  );
  const maxScore = createMemo(() =>
    Math.max(0.01, ...items().map((item) => item.score)),
  );

  return (
    <Show when={items().length > 0}>
      <ChartBlock title="retention queue">
        <div class="grid gap-1 text-xs">
          <For each={items()}>
            {(item) => (
              <div class="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-2">
                <div class="truncate font-mono">{item.key}</div>
                <div class="h-2 overflow-hidden rounded bg-bg">
                  <div
                    class="h-full rounded bg-main"
                    style={{
                      width: `${(item.score / maxScore()) * 100}%`,
                    }}
                  ></div>
                </div>
                <div class="text-sub">{formatPercent(item.score)}</div>
              </div>
            )}
          </For>
        </div>
      </ChartBlock>
    </Show>
  );
}

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
            <div class="grid gap-4 lg:grid-cols-2">
              <WeaknessMixChart items={allItems()} />
              <AttemptsMissScatter items={allItems()} />
              <ScoreDistributionChart items={allItems()} />
              <MistakeHeatmap substitutions={d().topSubstitutions} />
              <GraduationProgressChart items={d().graduated} />
              <RetentionQueueChart
                words={d().retentionWords}
                biwords={d().retentionBiwords}
              />
            </div>
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
