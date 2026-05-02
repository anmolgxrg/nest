"use client";

import * as React from "react";
import { ArrowSquareOutIcon, GithubLogoIcon } from "@phosphor-icons/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type {
  ActivityPayload,
  ProjectLocPayload,
  Range,
  Rollup,
} from "./types";

const CHAOS_PUBLIC_URL = "https://chaos.reasoning.company";

const RANGE_OPTIONS: { key: Range; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "all", label: "All" },
];

// LOC is coarse-grained (weekly), so Today/24h would otherwise be a single
// data point — widen the visible window but bias toward recent.
const WEEKS_FOR_RANGE: Record<Range, number | "all"> = {
  today: 4,
  "24h": 4,
  "7d": 6,
  "30d": 13,
  all: "all",
};

const LOC_COLORS = [
  "#c15f3c", // terracotta
  "#6b8e4e", // sage
  "#4e6b8e", // slate blue
  "#8e6b4e", // warm brown
  "#574d9c", // muted indigo
  "#9c4d8b", // plum
  "#3a8e85", // teal
  "#c49a3c", // mustard
  "#8a4ec1", // violet
  "#547b3f", // deep olive
  "#b85c7a", // rose
  "#456e95", // steel
];

interface Bucket {
  project: string;
  source: "jira" | "github" | "mixed";
  features: Rollup[];
}

const STATUS_LABELS: Record<Rollup["status"], string> = {
  done: "Done",
  merged: "Merged",
  in_review: "In review",
  in_progress: "In progress",
  open: "Open",
};

function formatLoc(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ProjectsView() {
  const [range, setRange] = React.useState<Range>("7d");
  const [activity, setActivity] = React.useState<ActivityPayload | null>(null);
  const [activityErr, setActivityErr] = React.useState<string | null>(null);
  const [activityLoading, setActivityLoading] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    setActivityLoading(true);
    fetch(`/api/chaos/activity?range=${range}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ActivityPayload;
      })
      .then((d) => {
        if (!live) return;
        setActivity(d);
        setActivityErr(null);
      })
      .catch((e) => {
        if (!live) return;
        setActivityErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (live) setActivityLoading(false);
      });
    return () => {
      live = false;
    };
  }, [range]);

  const buckets = React.useMemo<Bucket[]>(() => {
    if (!activity) return [];
    const m = new Map<string, Bucket>();
    for (const r of activity.rollups) {
      const name = r.project ?? "(unattributed)";
      let b = m.get(name);
      if (!b) {
        const src = r.source === "jira" ? "jira" : "github";
        b = { project: name, source: src, features: [] };
        m.set(name, b);
      } else if (
        (b.source === "jira" && r.source !== "jira") ||
        (b.source === "github" && r.source === "jira")
      ) {
        b.source = "mixed";
      }
      b.features.push(r);
    }
    for (const b of m.values()) {
      b.features.sort((a, z) => (a.lastSeen < z.lastSeen ? 1 : -1));
    }
    return [...m.values()].sort(
      (a, z) => z.features.length - a.features.length,
    );
  }, [activity]);

  return (
    <div className="space-y-5 p-4">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight">By project</h1>
          <p className="text-xs text-muted-foreground">
            Codebase size + shipped features per project, sourced from chaos.
          </p>
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </header>

      <ProjectLocChart range={range} />

      {activityErr ? (
        <Card className="border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Couldn&apos;t load activity: {activityErr}
        </Card>
      ) : null}

      {!activity && activityLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : null}

      {activity && buckets.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          No features in this window.
        </div>
      ) : null}

      <div className="space-y-5">
        {buckets.map((b) => (
          <section key={b.project}>
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="text-sm font-medium">{b.project}</span>
              <span className="text-xs text-muted-foreground">
                {b.features.length} feature
                {b.features.length === 1 ? "" : "s"}
              </span>
              {b.source !== "mixed" ? (
                <Badge variant="secondary" className="text-[10px]">
                  {b.source === "jira" ? "Jira" : "GitHub"}
                </Badge>
              ) : null}
            </div>
            <Card className="divide-y divide-border px-4 py-0">
              {b.features.map((f) => (
                <FeatureRow key={f.detailId} rollup={f} />
              ))}
            </Card>
          </section>
        ))}
      </div>
    </div>
  );
}

function RangeTabs({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border bg-background p-0.5">
      {RANGE_OPTIONS.map((opt) => {
        const active = value === opt.key;
        return (
          <Button
            key={opt.key}
            type="button"
            variant={active ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => onChange(opt.key)}
          >
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}

function FeatureRow({ rollup }: { rollup: Rollup }) {
  const summary = rollupSummary(rollup);
  return (
    <a
      href={`${CHAOS_PUBLIC_URL}/feature?id=${encodeURIComponent(rollup.detailId)}`}
      target="_blank"
      rel="noreferrer"
      className="-mx-1 flex items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-muted/60"
    >
      <SourceIcon source={rollup.source} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm">{rollup.title}</span>
          {rollup.project ? (
            <Badge variant="secondary" className="text-[10px]">
              {rollup.project}
            </Badge>
          ) : null}
          {rollup.source !== "github" ? (
            <Badge variant="outline" className="text-[10px]">
              {STATUS_LABELS[rollup.status]}
            </Badge>
          ) : null}
        </div>
        {summary ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{summary}</div>
        ) : null}
      </div>
      <ArrowSquareOutIcon
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground/60"
      />
    </a>
  );
}

function SourceIcon({ source }: { source: string }) {
  if (source === "jira") {
    return (
      <span
        className="inline-flex size-4 shrink-0 items-center justify-center rounded bg-[#0052cc] text-[10px] font-medium text-white"
        title="Jira"
      >
        J
      </span>
    );
  }
  return (
    <GithubLogoIcon
      aria-hidden="true"
      className="size-4 shrink-0 text-foreground"
    />
  );
}

function rollupSummary(r: Rollup): string {
  const parts: string[] = [];
  if (r.commitCount)
    parts.push(`${r.commitCount} commit${r.commitCount === 1 ? "" : "s"}`);
  if (r.mergedCount) parts.push(`${r.mergedCount} PR merged`);
  else if (r.prCount) parts.push(`${r.prCount} PR${r.prCount === 1 ? "" : "s"}`);
  if (r.issueDoneCount) parts.push(`${r.issueDoneCount} ticket closed`);
  return parts.join(" · ");
}

function ProjectLocChart({ range }: { range: Range }) {
  const [data, setData] = React.useState<ProjectLocPayload | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const r = await fetch("/api/chaos/project-stats", {
          cache: "no-store",
        });
        const ct = r.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) {
          throw new Error(
            `unexpected response (${r.status} ${ct || "no content-type"})`,
          );
        }
        const d = (await r.json()) as ProjectLocPayload;
        if (!live) return;
        setData(d);
        setErr(null);
        // Cold start: chaos returns an empty payload with computing:true while
        // the GitHub fan-out runs. Poll until cachedAt populates (~30–60s).
        if (d.computing && d.weeks.length === 0) {
          pollTimer = setTimeout(load, 8_000);
        }
      } catch (e) {
        if (live) setErr(e instanceof Error ? e.message : String(e));
      }
    }

    load();
    return () => {
      live = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, []);

  const visibleWeeks = React.useMemo(() => {
    if (!data) return [];
    const spec = WEEKS_FOR_RANGE[range];
    if (spec === "all" || spec === undefined) return data.weeks;
    return data.weeks.slice(-spec);
  }, [data, range]);

  const rows = React.useMemo(() => {
    if (!data) return [];
    return visibleWeeks.map((w) => {
      const row: Record<string, number | string> = { date: w };
      for (const p of data.projects) {
        const pt = p.points.find((x) => x.date === w);
        if (pt) row[p.project] = pt.loc;
      }
      return row;
    });
  }, [data, visibleWeeks]);

  if (err) {
    return (
      <Card className="px-4 py-3 text-xs text-muted-foreground">
        Couldn&apos;t load LOC history: {err}
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="px-4 py-8 text-center text-xs text-muted-foreground">
        Loading LOC history…
      </Card>
    );
  }

  if (data.projects.length === 0) {
    if (data.computing) {
      return (
        <Card className="px-4 py-6 text-center text-xs text-muted-foreground">
          GitHub is computing stats for these repos. This usually takes 30–60
          seconds on first run — refresh in a minute.
        </Card>
      );
    }
    return (
      <Card className="px-4 py-4 text-xs text-muted-foreground">
        No project ↔ repo mappings configured. Add{" "}
        <code className="rounded bg-muted px-1">repos:</code> to projects in{" "}
        <code className="rounded bg-muted px-1">config/sources.yaml</code> in
        chaos.
      </Card>
    );
  }

  const latestByProj = data.projects.map((p) => ({
    name: p.project,
    loc: p.points.at(-1)?.loc ?? 0,
  }));

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <div className="text-sm font-medium">Codebase size by project</div>
          <div className="text-xs text-muted-foreground">
            Cumulative lines of code · last {visibleWeeks.length} week
            {visibleWeeks.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {data.computing
            ? "refreshing…"
            : "updated " +
              new Date(data.cachedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
        </div>
      </div>

      <div className="-ml-2 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={rows}
            margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
          >
            <defs>
              {data.projects.map((p, i) => (
                <linearGradient
                  key={p.project}
                  id={`g-${p.project}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={LOC_COLORS[i % LOC_COLORS.length]}
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="100%"
                    stopColor={LOC_COLORS[i % LOC_COLORS.length]}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="rgba(20,20,19,0.06)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="rgba(20,20,19,0.4)"
              tick={{ fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatLoc}
              stroke="rgba(20,20,19,0.4)"
              tick={{ fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<LocTooltip />} />
            {data.projects.map((p, i) => (
              <Area
                key={p.project}
                type="monotone"
                dataKey={p.project}
                stroke={LOC_COLORS[i % LOC_COLORS.length]}
                strokeWidth={1.5}
                fill={`url(#g-${p.project})`}
                isAnimationActive
                animationDuration={600}
                connectNulls
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <Separator className="my-3" />

      <div className="flex flex-wrap gap-x-4 gap-y-1 pl-2 text-xs">
        {latestByProj.map((p, i) => (
          <div key={p.name} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: LOC_COLORS[i % LOC_COLORS.length] }}
            />
            <span>{p.name}</span>
            <span className="tabular-nums text-muted-foreground">
              {formatLoc(p.loc)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

interface TooltipItem {
  name?: string | number;
  value?: number;
  color?: string;
}
function LocTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0 || !label) return null;
  const nonZero = payload.filter((p) => (p.value ?? 0) > 0);
  if (nonZero.length === 0) return null;
  const total = nonZero.reduce((a, b) => a + (b.value ?? 0), 0);
  return (
    <div
      className={cn(
        "rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm",
      )}
    >
      <div className="mb-1 font-medium">{formatDate(label)}</div>
      <div className="space-y-0.5">
        {nonZero
          .slice()
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          .map((p) => (
            <div key={String(p.name)} className="flex items-center gap-2">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              <span>{p.name}</span>
              <span className="ml-auto tabular-nums text-muted-foreground">
                {formatLoc(p.value ?? 0)}
              </span>
            </div>
          ))}
      </div>
      <div className="mt-1 flex justify-between border-t pt-1 text-muted-foreground">
        <span>total</span>
        <span className="tabular-nums">{formatLoc(total)}</span>
      </div>
    </div>
  );
}
