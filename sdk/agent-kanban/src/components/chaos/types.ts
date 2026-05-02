// Mirror of the chaos public API shapes consumed by the Projects + User SDAs
// views. NEST proxies chaos through /api/chaos/* and renders these payloads.

export type Range = "today" | "24h" | "7d" | "30d" | "all";

export interface Person {
  id: string;
  displayName: string;
  role: string | null;
  githubLogin: string | null;
  external: boolean;
  significantCommits: number;
  significantAnonCommits: number;
  ticketsClosed: number;
}

export interface Rollup {
  featureKey: string | null;
  title: string;
  source: string;
  url: string | null;
  personId: string;
  status: "done" | "merged" | "in_review" | "in_progress" | "open";
  commitCount: number;
  prCount: number;
  mergedCount: number;
  issueDoneCount: number;
  firstSeen: string;
  lastSeen: string;
  detailId: string;
  project: string | null;
}

export interface ActivityPayload {
  range: Range;
  since: string;
  people: Person[];
  rollups: Rollup[];
  unmappedCount: number;
}

export interface ProjectSeries {
  project: string;
  points: { date: string; loc: number }[];
}
export interface ProjectLocPayload {
  projects: ProjectSeries[];
  weeks: string[];
  cachedAt: string;
  computing: boolean;
}

export type SessionStatus = "active" | "idle" | "stale" | "ended";

export interface SessionRow {
  id: string;
  sessionUuid: string;
  user: string;
  host: string | null;
  cwd: string | null;
  startedAt: string;
  lastEventAt: string;
  endedAt: string | null;
  toolUseCount: number;
  promptCount: number;
  errorCount: number;
  durationMs: number;
  status: SessionStatus;
  firstPrompt: string | null;
  /** Tagged at fetch time so the merged view can route detail-drawer
   *  fetches to the right backend. */
  toolKind: "claude" | "codex";
}

export interface SessionsResponse {
  sessions: Omit<SessionRow, "toolKind">[];
  serverTime: string;
}

export interface EventRow {
  id: string;
  type: string;
  tool: string | null;
  durationMs: number | null;
  ts: string;
}

export interface SessionDetail extends SessionRow {
  events: EventRow[];
}
