import { describe, expect, it } from "vitest";
import {
  mergeRawCommitActivities,
  type RawCommitActivity,
} from "../src/lib/github";

function commit(input: Partial<RawCommitActivity> & { sha: string }): RawCommitActivity {
  return {
    kind: "commit",
    sha: input.sha,
    owner: input.owner ?? "acme",
    repo: input.repo ?? "backend",
    message: input.message ?? "Implement checkout",
    authorLogin: input.authorLogin ?? "maya",
    authorName: input.authorName ?? "Maya Rodriguez",
    branch: input.branch ?? null,
    defaultBranch: input.defaultBranch ?? "main",
    url: input.url ?? `https://github.com/acme/backend/commit/${input.sha}`,
    occurredAt: input.occurredAt ?? new Date("2026-01-01T00:00:00.000Z"),
    associatedPrNumber: input.associatedPrNumber ?? null,
    associatedPrTitle: input.associatedPrTitle ?? null,
  };
}

describe("mergeRawCommitActivities", () => {
  it("prefers merged PR commit rows over default-branch rows with the same SHA", () => {
    const defaultBranch = [
      commit({
        sha: "abc123",
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      commit({ sha: "def456", message: "Direct commit" }),
    ];
    const prCommits = [
      commit({
        sha: "abc123",
        branch: "feature/checkout",
        occurredAt: new Date("2026-01-10T00:00:00.000Z"),
        associatedPrNumber: 42,
        associatedPrTitle: "Implement checkout",
      }),
    ];

    const merged = mergeRawCommitActivities(defaultBranch, prCommits);
    const bySha = new Map(merged.map((item) => [item.sha, item]));

    expect(merged).toHaveLength(2);
    expect(bySha.get("abc123")?.associatedPrNumber).toBe(42);
    expect(bySha.get("abc123")?.branch).toBe("feature/checkout");
    expect(bySha.get("abc123")?.occurredAt.toISOString()).toBe(
      "2026-01-10T00:00:00.000Z",
    );
    expect(bySha.get("def456")?.message).toBe("Direct commit");
  });
});
