import { Octokit } from "@octokit/rest";
import type { PersonConfig, Sources } from "./config";
import { githubToken } from "./config";

export interface RawCommitActivity {
  kind: "commit";
  sha: string;
  owner: string;
  repo: string;
  message: string;
  authorLogin: string | null;
  authorName: string | null;
  branch: string | null;
  defaultBranch: string;
  url: string;
  occurredAt: Date;
  associatedPrNumber: number | null;
  associatedPrTitle: string | null;
  filesChanged?: number;
}

export interface RawPrActivity {
  kind: "pr";
  owner: string;
  repo: string;
  number: number;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  mergedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  authorLogin: string | null;
  url: string;
  labels: string[];
  headRef: string;
  baseRef: string;
  mergeCommitSha: string | null;
}

function buildClient(token: string) {
  return new Octokit({ auth: token, userAgent: "chaos/0.1" });
}

export async function fetchCommitsSince(
  cfg: Sources,
  owner: string,
  repo: string,
  since: Date,
): Promise<RawCommitActivity[]> {
  const token = githubToken(cfg);
  if (!token) return [];
  const gh = buildClient(token);

  const repoInfo = await gh.repos.get({ owner, repo });
  const defaultBranch = repoInfo.data.default_branch;

  const out: RawCommitActivity[] = [];
  let page = 1;
  while (true) {
    const resp = await gh.repos.listCommits({
      owner,
      repo,
      since: since.toISOString(),
      per_page: 100,
      page,
    });
    if (resp.data.length === 0) break;

    for (const c of resp.data) {
      out.push({
        kind: "commit",
        sha: c.sha,
        owner,
        repo,
        message: c.commit.message,
        authorLogin: c.author?.login ?? null,
        authorName: c.commit.author?.name ?? null,
        branch: null,
        defaultBranch,
        url: c.html_url,
        occurredAt: new Date(c.commit.author?.date ?? c.commit.committer?.date ?? Date.now()),
        associatedPrNumber: null,
        associatedPrTitle: null,
      });
    }

    if (resp.data.length < 100) break;
    page += 1;
    if (page > 20) break; // hard cap per repo per sync
  }
  return out;
}

export async function fetchPullRequestsSince(
  cfg: Sources,
  owner: string,
  repo: string,
  since: Date,
): Promise<RawPrActivity[]> {
  const token = githubToken(cfg);
  if (!token) return [];
  const gh = buildClient(token);

  const out: RawPrActivity[] = [];
  let page = 1;
  outer: while (true) {
    const resp = await gh.pulls.list({
      owner,
      repo,
      state: "all",
      sort: "updated",
      direction: "desc",
      per_page: 100,
      page,
    });
    if (resp.data.length === 0) break;
    for (const pr of resp.data) {
      const updated = new Date(pr.updated_at);
      if (updated < since) break outer;
      out.push({
        kind: "pr",
        owner,
        repo,
        number: pr.number,
        title: pr.title,
        state: pr.state === "open" ? "open" : "closed",
        merged: Boolean(pr.merged_at),
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        createdAt: new Date(pr.created_at),
        updatedAt: updated,
        authorLogin: pr.user?.login ?? null,
        url: pr.html_url,
        labels: (pr.labels || []).map((l) => (typeof l === "string" ? l : l.name ?? "")).filter(Boolean),
        headRef: pr.head.ref,
        baseRef: pr.base.ref,
        mergeCommitSha: pr.merge_commit_sha ?? null,
      });
    }
    if (resp.data.length < 100) break;
    page += 1;
    if (page > 10) break;
  }
  return out;
}

export async function fetchMergedPullRequestCommitsSince(
  cfg: Sources,
  owner: string,
  repo: string,
  prs: RawPrActivity[],
  since: Date,
): Promise<RawCommitActivity[]> {
  const token = githubToken(cfg);
  if (!token) return [];
  const gh = buildClient(token);

  const out: RawCommitActivity[] = [];
  for (const pr of prs) {
    if (!pr.merged || !pr.mergedAt || pr.mergedAt < since) continue;

    let page = 1;
    while (true) {
      const resp = await gh.pulls.listCommits({
        owner,
        repo,
        pull_number: pr.number,
        per_page: 100,
        page,
      });
      if (resp.data.length === 0) break;

      for (const c of resp.data) {
        out.push({
          kind: "commit",
          sha: c.sha,
          owner,
          repo,
          message: c.commit.message,
          authorLogin: c.author?.login ?? null,
          authorName: c.commit.author?.name ?? null,
          branch: pr.headRef,
          defaultBranch: pr.baseRef,
          url: c.html_url,
          // For merged PR commits, this dashboard is measuring shipped code,
          // so bucket the commit under the date it reached the base branch.
          occurredAt: pr.mergedAt,
          associatedPrNumber: pr.number,
          associatedPrTitle: pr.title,
        });
      }

      if (resp.data.length < 100) break;
      page += 1;
      if (page > 20) break;
    }
  }

  return out;
}

export function mergeRawCommitActivities(
  defaultBranchCommits: RawCommitActivity[],
  pullRequestCommits: RawCommitActivity[],
): RawCommitActivity[] {
  const bySha = new Map<string, RawCommitActivity>();
  for (const commit of defaultBranchCommits) bySha.set(commit.sha, commit);

  // Prefer PR-associated rows. They carry the PR number/title and the merge
  // timestamp, which is the moment the code actually shipped.
  for (const commit of pullRequestCommits) bySha.set(commit.sha, commit);

  return [...bySha.values()];
}

export function resolvePersonByGithubLogin(
  people: PersonConfig[],
  login: string | null,
): PersonConfig | null {
  if (!login) return null;
  const lower = login.toLowerCase();
  const match = people.find((p) => {
    if (p.github && p.github.toLowerCase() === lower) return true;
    return (p.github_aliases ?? []).some((a) => a.toLowerCase() === lower);
  });
  return match ?? null;
}
