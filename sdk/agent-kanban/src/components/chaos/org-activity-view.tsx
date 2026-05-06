"use client";

import * as React from "react";
import {
  ArrowSquareOutIcon,
  CalendarBlankIcon,
  FolderIcon,
  GithubLogoIcon,
  UsersThreeIcon,
  XIcon,
} from "@phosphor-icons/react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { ByProjectPanel } from "./projects-view";
import type { ActivityPayload, Person, Range, Rollup } from "./types";

const RANGE_OPTIONS: { key: Range; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "all", label: "All" },
];

const STATUS_LABELS: Record<Rollup["status"], string> = {
  done: "Done",
  merged: "Merged",
  in_review: "In review",
  in_progress: "In progress",
  open: "Open",
};

const PAGE_DAYS = 30;
const DISPLAY_TZ = "America/Los_Angeles";

const WEEKS_FOR_RANGE: Record<Range, number | "all"> = {
  today: 4,
  "24h": 4,
  "7d": 6,
  "30d": 13,
  all: "all",
};

type Tab = "byproject" | "byday" | "byperson";

export function OrgActivityView() {
  const [range, setRange] = React.useState<Range>("7d");
  const [tab, setTab] = React.useState<Tab>("byproject");
  const [data, setData] = React.useState<ActivityPayload | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [featureId, setFeatureId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    const loadingTimer = window.setTimeout(() => {
      if (live) setLoading(true);
    }, 0);
    fetch(`/api/chaos/activity?range=${range}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ActivityPayload;
      })
      .then((d) => {
        if (!live) return;
        setData(d);
        setErr(null);
      })
      .catch((e) => {
        if (live) setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      window.clearTimeout(loadingTimer);
    };
  }, [range]);

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight">Org activity</h1>
          <p className="text-xs text-muted-foreground">
            What shipped — by project, by day, by person. Sourced from chaos.
          </p>
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </header>

      <div className="flex items-center gap-1">
        <TabButton
          active={tab === "byproject"}
          onClick={() => setTab("byproject")}
          icon={FolderIcon}
          label="By project"
        />
        <TabButton
          active={tab === "byday"}
          onClick={() => setTab("byday")}
          icon={CalendarBlankIcon}
          label="By day"
        />
        <TabButton
          active={tab === "byperson"}
          onClick={() => setTab("byperson")}
          icon={UsersThreeIcon}
          label="By person"
        />
      </div>

      {err && tab !== "byproject" ? (
        <Card className="border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {err}
        </Card>
      ) : null}

      {!data && loading && tab !== "byproject" ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : null}

      {tab === "byproject" ? (
        <ByProjectPanel
          range={range}
          activity={data}
          activityErr={err}
          activityLoading={loading}
        />
      ) : null}
      {data && tab === "byday" ? (
        <ByDay data={data} onSelectFeature={setFeatureId} />
      ) : null}
      {data && tab === "byperson" ? (
        <ByPerson data={data} onSelectFeature={setFeatureId} />
      ) : null}

      {featureId ? (
        <FeatureDrawer
          id={featureId}
          onClose={() => setFeatureId(null)}
        />
      ) : null}
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

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "ghost"}
      size="sm"
      onClick={onClick}
      className="gap-1.5 text-xs"
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </Button>
  );
}

// ───────────────────────── By day ─────────────────────────

interface DayBucket {
  displayName: string;
  features: Rollup[];
}

function ByDay({
  data,
  onSelectFeature,
}: {
  data: ActivityPayload;
  onSelectFeature: (id: string) => void;
}) {
  const grouped = React.useMemo(() => {
    const peopleById = new Map(data.people.map((p) => [p.id, p]));
    const byDay = new Map<string, Map<string, DayBucket>>();
    for (const r of data.rollups) {
      const key = pacificDayKey(r.lastSeen);
      if (!byDay.has(key)) byDay.set(key, new Map());
      const perPerson = byDay.get(key)!;
      if (!perPerson.has(r.personId)) {
        const p = peopleById.get(r.personId);
        if (!p) continue;
        perPerson.set(r.personId, {
          displayName: p.displayName,
          features: [],
        });
      }
      perPerson.get(r.personId)!.features.push(r);
    }
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [data]);

  if (grouped.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No activity in this window.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {grouped.map(([day, perPerson]) => (
        <section key={day}>
          <div className="mb-2 px-1 text-xs uppercase tracking-wider text-muted-foreground">
            {formatPacificDayHeader(day)}
          </div>
          <Card className="divide-y divide-border py-0">
            {[...perPerson.entries()].map(([personId, bucket]) => (
              <PersonDayBucket
                key={`${day}:${personId}`}
                bucket={bucket}
                onSelectFeature={onSelectFeature}
              />
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

function PersonDayBucket({
  bucket,
  onSelectFeature,
}: {
  bucket: DayBucket;
  onSelectFeature: (id: string) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const hidden = Math.max(0, bucket.features.length - 3);
  const visible = expanded ? bucket.features : bucket.features.slice(0, 3);

  return (
    <div className="px-4 py-3">
      <div className="mb-1 text-sm">{bucket.displayName}</div>
      <div className="divide-y divide-border">
        {visible.map((f) => (
          <FeatureRow
            key={f.detailId}
            rollup={f}
            onClick={() => onSelectFeature(f.detailId)}
          />
        ))}
      </div>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="pt-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {expanded ? "Show less" : `+${hidden} more`}
        </button>
      ) : null}
    </div>
  );
}

// ───────────────────────── By person ─────────────────────────

function ByPerson({
  data,
  onSelectFeature,
}: {
  data: ActivityPayload;
  onSelectFeature: (id: string) => void;
}) {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);

  const rollupsByPerson = React.useMemo(() => {
    const m = new Map<string, Rollup[]>();
    for (const r of data.rollups) {
      if (!m.has(r.personId)) m.set(r.personId, []);
      m.get(r.personId)!.push(r);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
    }
    return m;
  }, [data]);

  if (selected) {
    const p = data.people.find((x) => x.id === selected);
    if (!p) {
      setSelected(null);
      return null;
    }
    const all = rollupsByPerson.get(selected) ?? [];
    const latestSeen = all.reduce(
      (latest, r) => Math.max(latest, new Date(r.lastSeen).getTime()),
      0,
    );
    const cutoff = latestSeen - page * PAGE_DAYS * 86_400_000;
    const visible = all.filter(
      (r) => new Date(r.lastSeen).getTime() >= cutoff,
    );

    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setPage(1);
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to people
        </button>
        <div className="flex items-center gap-3">
          <div className="flex size-10 select-none items-center justify-center rounded-full bg-muted text-foreground">
            {initials(p.displayName)}
          </div>
          <div className="text-base">{p.displayName}</div>
        </div>
        <PersonLocChart personId={p.id} range={data.range} />
        <Card className="divide-y divide-border px-4 py-0">
          {visible.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">
              No activity.
            </div>
          ) : null}
          {visible.map((f) => (
            <FeatureRow
              key={(f.featureKey ?? "anon") + f.firstSeen}
              rollup={f}
              onClick={() => onSelectFeature(f.detailId)}
            />
          ))}
        </Card>
        {visible.length < all.length ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((n) => n + 1)}
            >
              Load another {PAGE_DAYS} days
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const team = data.people.filter((p) => !p.external);
  const others = data.people.filter((p) => p.external);

  const renderCard = (p: Person) => {
    const rs = rollupsByPerson.get(p.id) ?? [];
    const keyedFeatures = rs.filter((r) => r.featureKey).length;
    const count = keyedFeatures + p.significantAnonCommits;
    const tip =
      `${keyedFeatures} feature${keyedFeatures === 1 ? "" : "s"} · ` +
      `${p.significantAnonCommits} significant standalone commit${p.significantAnonCommits === 1 ? "" : "s"} ` +
      `(>150 LOC) · ${p.ticketsClosed} ticket${p.ticketsClosed === 1 ? "" : "s"} closed`;
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => setSelected(p.id)}
        className="rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/60"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {initials(p.displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{p.displayName}</div>
          </div>
          <div className="tabular-nums text-xs text-muted-foreground" title={tip}>
            {count}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {team.map(renderCard)}
      </div>
      {others.length > 0 ? (
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Other contributors
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {others.map(renderCard)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ───────────────────────── FeatureRow ─────────────────────────

function FeatureRow({
  rollup,
  onClick,
}: {
  rollup: Rollup;
  onClick: () => void;
}) {
  const summary = rollupSummary(rollup);
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mx-1 flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-muted/60"
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
    </button>
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

// ───────────────────────── Person LOC chart ─────────────────────────

interface WeekPoint {
  date: string;
  additions: number;
  deletions: number;
  removedFromMe: number;
}
interface PersonLocPayload {
  personId: string;
  totalAdditions: number;
  totalDeletions: number;
  totalRemovedFromMe: number;
  points: WeekPoint[];
}

const ADDED_COLOR = "#3b82f6";
const REMOVED_COLOR = "#ef4444";
const AXIS_TEXT_COLOR = "rgba(245,245,245,0.62)";
const GRID_COLOR = "rgba(245,245,245,0.08)";
const LOC_AXIS_STEP = 5_000;

function PersonLocChart({
  personId,
  range,
}: {
  personId: string;
  range: Range;
}) {
  const [data, setData] = React.useState<PersonLocPayload | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    const resetTimer = window.setTimeout(() => {
      if (!live) return;
      setData(null);
      setErr(null);
    }, 0);
    fetch(`/api/chaos/person-loc?personId=${encodeURIComponent(personId)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as PersonLocPayload;
      })
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
      window.clearTimeout(resetTimer);
    };
  }, [personId]);

  const visiblePoints = React.useMemo(() => {
    if (!data?.points) return [];
    const spec = WEEKS_FOR_RANGE[range];
    if (spec === "all" || spec === undefined) return data.points;
    return data.points.slice(-spec);
  }, [data, range]);
  const axisMax = React.useMemo(
    () => locAxisMax(visiblePoints),
    [visiblePoints],
  );
  const axisTicks = React.useMemo(() => locAxisTicks(axisMax), [axisMax]);
  const hasVisibleOwnedLinesDropped = visiblePoints.some(
    (point) => point.removedFromMe > 0,
  );

  if (err) {
    return (
      <Card className="px-4 py-3 text-xs text-muted-foreground">
        Couldn&apos;t load contribution history: {err}
      </Card>
    );
  }
  if (!data) {
    return (
      <Card className="px-4 py-8 text-center text-xs text-muted-foreground">
        Loading contribution history…
      </Card>
    );
  }

  const hasData =
    data.totalAdditions > 0 ||
    data.totalRemovedFromMe > 0;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <div className="text-sm font-medium">
            Lines added / owned lines dropped
          </div>
          <div className="text-xs text-muted-foreground">
            Last {visiblePoints.length} week
            {visiblePoints.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex gap-4 text-xs tabular-nums">
          <div>
            <span className="text-muted-foreground">lines added </span>
            <span className="font-medium text-[#3b82f6]">
              {formatLoc(data.totalAdditions)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">owned lines dropped </span>
            <span className="font-medium text-[#ef4444]">
              {formatLoc(data.totalRemovedFromMe)}
            </span>
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          No enriched commits yet for this contributor.
        </div>
      ) : (
        <div className="-ml-2 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={visiblePoints}
              margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="g-person-added" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ADDED_COLOR} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={ADDED_COLOR} stopOpacity={0} />
                </linearGradient>
                <linearGradient
                  id="g-person-owned-dropped"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={REMOVED_COLOR} stopOpacity={0.24} />
                  <stop offset="100%" stopColor={REMOVED_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke={AXIS_TEXT_COLOR}
                tick={{ fill: AXIS_TEXT_COLOR, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="loc"
                orientation="right"
                domain={[0, axisMax]}
                ticks={axisTicks}
                tickFormatter={formatLoc}
                stroke={AXIS_TEXT_COLOR}
                tick={{ fill: AXIS_TEXT_COLOR, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip content={<PersonTooltip />} />
              {hasVisibleOwnedLinesDropped ? (
                <Area
                  yAxisId="loc"
                  type="monotone"
                  dataKey="removedFromMe"
                  name="Owned lines dropped"
                  stroke={REMOVED_COLOR}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  fill="url(#g-person-owned-dropped)"
                  isAnimationActive
                  animationDuration={600}
                />
              ) : null}
              <Area
                yAxisId="loc"
                type="monotone"
                dataKey="additions"
                name="Lines added"
                stroke={ADDED_COLOR}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                fill="url(#g-person-added)"
                isAnimationActive
                animationDuration={600}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function PersonTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number; payload?: WeekPoint }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0 || !label) return null;
  const pt = payload[0]?.payload;
  const added = pt?.additions ?? payload[0]?.value ?? 0;
  const removedFromMe = pt?.removedFromMe ?? 0;
  if (added === 0 && removedFromMe === 0) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
      <div className="mb-1 font-medium">{formatDate(label)}</div>
      <div className="flex items-center gap-2">
        <span
          className="size-1.5 rounded-full"
          style={{ background: ADDED_COLOR }}
        />
        <span>lines added</span>
        <span className="ml-auto tabular-nums text-muted-foreground">
          {formatLoc(added)}
        </span>
      </div>
      {removedFromMe > 0 ? (
        <div className="mt-0.5 flex items-center gap-2">
          <span
            className="size-1.5 rounded-full"
            style={{ background: REMOVED_COLOR }}
          />
          <span>owned lines dropped</span>
          <span className="ml-auto tabular-nums text-muted-foreground">
            {formatLoc(removedFromMe)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function locAxisMax(points: WeekPoint[]): number {
  const maxValue = points.reduce(
    (max, point) =>
      Math.max(max, point.additions ?? 0, point.removedFromMe ?? 0),
    0,
  );
  return Math.max(LOC_AXIS_STEP, Math.ceil(maxValue / LOC_AXIS_STEP) * LOC_AXIS_STEP);
}

function locAxisTicks(axisMax: number): number[] {
  const maxIntervals = 8;
  const intervalCount = Math.max(1, Math.ceil(axisMax / LOC_AXIS_STEP));
  const step =
    LOC_AXIS_STEP * Math.max(1, Math.ceil(intervalCount / maxIntervals));
  const ticks: number[] = [];
  for (let tick = 0; tick < axisMax; tick += step) {
    ticks.push(tick);
  }
  ticks.push(axisMax);
  return ticks;
}

// ───────────────────────── Feature drawer ─────────────────────────

interface FeatureActivityRow {
  id: string;
  source: string;
  type: string;
  title: string;
  url: string | null;
  occurredAt: string;
  metadata: Record<string, unknown> | null;
}
interface FeaturePayload {
  featureKey: string | null;
  title: string;
  summary?: string | null;
  source: string;
  person: { id: string; displayName: string } | null;
  activities: FeatureActivityRow[];
}

const TYPE_LABEL: Record<string, string> = {
  commit: "Commit",
  pr_opened: "PR opened",
  pr_merged: "PR merged",
  pr_reviewed: "PR reviewed",
  issue_created: "Issue created",
  issue_in_progress: "Moved to in progress",
  issue_done: "Marked done",
};

function FeatureDrawer({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const [data, setData] = React.useState<FeaturePayload | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/chaos/feature?id=${encodeURIComponent(id)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as FeaturePayload;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-end bg-foreground/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="flex w-full max-w-2xl flex-col border-l bg-background">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-background px-5 py-3">
          <div className="min-w-0">
            {data ? (
              <>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {data.source === "jira"
                    ? data.featureKey
                    : data.featureKey?.startsWith("pr:")
                      ? "Pull request"
                      : data.featureKey?.startsWith("branch:")
                        ? "Branch"
                        : "Activity"}
                </div>
                <h2 className="mt-1 truncate text-base font-medium">
                  {data.title}
                </h2>
                {data.person ? (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {data.person.displayName}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Loading…</div>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <XIcon />
          </Button>
        </header>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-5">
            {err ? (
              <Card className="border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {err}
              </Card>
            ) : null}
            {data ? (
              <Card className="divide-y divide-border py-0">
                {data.activities.map((a) => (
                  <FeatureActivityRow key={a.id} row={a} />
                ))}
                {data.activities.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground">
                    No activity recorded.
                  </div>
                ) : null}
              </Card>
            ) : null}
          </div>
        </ScrollArea>
      </aside>
    </div>
  );
}

function FeatureActivityRow({ row }: { row: FeatureActivityRow }) {
  const meta = row.metadata ?? {};
  const extra: string[] = [];
  if (row.source === "github" && typeof meta.repo === "string") {
    const owner = String(meta.owner ?? "");
    extra.push(`${owner}/${meta.repo}`);
    if (typeof meta.branch === "string" && meta.branch) extra.push(meta.branch);
    if (typeof meta.sha === "string") extra.push(meta.sha.slice(0, 7));
    if (typeof meta.prNumber === "number") extra.push(`#${meta.prNumber}`);
    if (Array.isArray(meta.labels) && meta.labels.length > 0) {
      extra.push((meta.labels as string[]).slice(0, 3).join(", "));
    }
  } else if (row.source === "jira") {
    if (typeof meta.status === "string" && meta.status) extra.push(meta.status);
    if (Array.isArray(meta.labels) && meta.labels.length > 0) {
      extra.push((meta.labels as string[]).slice(0, 3).join(", "));
    }
  }

  return (
    <div className="flex items-start gap-4 px-4 py-3">
      <div className="w-28 shrink-0 pt-0.5 text-xs text-muted-foreground">
        {formatPacific(row.occurredAt)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {TYPE_LABEL[row.type] ?? row.type}
          </span>
          {extra.length > 0 ? <span>· {extra.join(" · ")}</span> : null}
        </div>
        {row.url ? (
          <a
            href={row.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-sm hover:underline"
          >
            {row.title}
            <ArrowSquareOutIcon
              aria-hidden="true"
              className="ml-1 inline size-3 -translate-y-px text-muted-foreground/60"
            />
          </a>
        ) : (
          <div className="truncate text-sm">{row.title}</div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── helpers ─────────────────────────

function pacificDayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function formatPacificDayHeader(key: string): string {
  const today = pacificDayKey(new Date().toISOString());
  if (key === today) return "Today";
  const yesterdayIso = new Date(Date.now() - 86_400_000).toISOString();
  if (key === pacificDayKey(yesterdayIso)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).formatToParts(new Date(Date.UTC(y!, (m ?? 1) - 1, d, 12)));
  return parts.map((p) => p.value).join("");
}

function formatPacific(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
