import { describe, expect, it } from "vitest";
import {
  mergeProjectLocCommits,
  type CommitDiff,
} from "../src/lib/project-loc";

function commit(input: Partial<CommitDiff> & { oid: string }): CommitDiff {
  const additions = input.additions ?? 10;
  const deletions = input.deletions ?? 1;
  return {
    owner: input.owner ?? "acme",
    name: input.name ?? "backend",
    oid: input.oid,
    title: input.title ?? "Implement checkout",
    date: input.date ?? "2026-01-01T00:00:00.000Z",
    additions,
    deletions,
    parentCount: input.parentCount ?? 1,
    authorLogin: input.authorLogin ?? "maya",
    authorName: input.authorName ?? "Maya Rodriguez",
    net: input.net ?? additions - deletions,
  };
}

describe("mergeProjectLocCommits", () => {
  it("replaces a merge commit with every real commit from the merged PR", () => {
    const result = mergeProjectLocCommits(
      [
        commit({
          oid: "merge-sha",
          title: "Merge pull request #42 from acme/checkout",
          additions: 500,
          deletions: 10,
          parentCount: 2,
          date: "2026-01-10T00:00:00.000Z",
        }),
        commit({
          oid: "feature-1",
          date: "2026-01-03T00:00:00.000Z",
          additions: 20,
        }),
        commit({
          oid: "direct",
          title: "Fix production config",
          date: "2026-01-04T00:00:00.000Z",
          additions: 5,
        }),
      ],
      [
        commit({
          oid: "feature-1",
          date: "2026-01-10T00:00:00.000Z",
          additions: 20,
        }),
        commit({
          oid: "feature-2",
          date: "2026-01-10T00:00:00.000Z",
          additions: 30,
        }),
      ],
      new Set(["merge-sha"]),
    );

    expect(result.map((item) => item.oid)).toEqual([
      "direct",
      "feature-1",
      "feature-2",
    ]);
    expect(result.find((item) => item.oid === "feature-1")?.date).toBe(
      "2026-01-10T00:00:00.000Z",
    );
  });

  it("does not count merge commits from inside the pull request", () => {
    const result = mergeProjectLocCommits(
      [],
      [
        commit({
          oid: "branch-merge",
          title: "Merge main into feature/checkout",
          parentCount: 2,
        }),
        commit({ oid: "feature-commit" }),
      ],
      new Set(),
    );

    expect(result.map((item) => item.oid)).toEqual(["feature-commit"]);
  });
});
