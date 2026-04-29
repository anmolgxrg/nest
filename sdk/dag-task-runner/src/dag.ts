/**
 * DAG schema parsing, validation, and topological ranking for the runner.
 *
 * The DAG file shape is intentionally tiny — see ../examples/example_dag.json.
 */

export type Complexity = "HIGH" | "MED" | "LOW";

export interface RawTask {
  id: string;
  depends_on: string[];
  complexity: Complexity;
  subtask_prompt: string;
}

export interface DAG {
  title: string;
  tasks: RawTask[];
}

const COMPLEXITY_VALUES = new Set<Complexity>(["HIGH", "MED", "LOW"]);

export function parseDAG(raw: unknown): DAG {
  if (!raw || typeof raw !== "object") {
    throw new Error("DAG file must be a JSON object.");
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.title !== "string" || obj.title.trim() === "") {
    throw new Error("DAG.title must be a non-empty string.");
  }
  if (!Array.isArray(obj.tasks) || obj.tasks.length === 0) {
    throw new Error("DAG.tasks must be a non-empty array.");
  }

  const tasks: RawTask[] = obj.tasks.map((t, i) => validateTask(t, i));
  const ids = new Set<string>();
  for (const t of tasks) {
    if (ids.has(t.id)) {
      throw new Error(`Duplicate task id: ${t.id}`);
    }
    ids.add(t.id);
  }
  for (const t of tasks) {
    for (const dep of t.depends_on) {
      if (!ids.has(dep)) {
        throw new Error(`Task ${t.id} depends_on unknown id: ${dep}`);
      }
      if (dep === t.id) {
        throw new Error(`Task ${t.id} depends on itself.`);
      }
    }
  }

  detectCycle(tasks);

  return { title: obj.title, tasks };
}

function validateTask(raw: unknown, index: number): RawTask {
  if (!raw || typeof raw !== "object") {
    throw new Error(`tasks[${index}] must be an object.`);
  }
  const t = raw as Record<string, unknown>;
  const id = t.id;
  if (typeof id !== "string" || id.trim() === "") {
    throw new Error(`tasks[${index}].id must be a non-empty string.`);
  }
  const depends_on = t.depends_on ?? [];
  if (!Array.isArray(depends_on) || depends_on.some((d) => typeof d !== "string")) {
    throw new Error(`tasks[${index}].depends_on must be an array of strings.`);
  }
  const complexity = t.complexity;
  if (typeof complexity !== "string" || !COMPLEXITY_VALUES.has(complexity as Complexity)) {
    throw new Error(`tasks[${index}].complexity must be one of HIGH | MED | LOW.`);
  }
  const subtask_prompt = t.subtask_prompt;
  if (typeof subtask_prompt !== "string" || subtask_prompt.trim() === "") {
    throw new Error(`tasks[${index}].subtask_prompt must be a non-empty string.`);
  }
  return {
    id,
    depends_on: [...new Set(depends_on as string[])],
    complexity: complexity as Complexity,
    subtask_prompt,
  };
}

/** Throws on the first cycle found. Uses iterative DFS with a recursion stack. */
function detectCycle(tasks: RawTask[]): void {
  const adj = new Map<string, string[]>();
  for (const t of tasks) adj.set(t.id, []);
  for (const t of tasks) {
    for (const dep of t.depends_on) {
      adj.get(dep)!.push(t.id);
    }
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const t of tasks) color.set(t.id, WHITE);

  for (const start of tasks) {
    if (color.get(start.id) !== WHITE) continue;
    const stack: Array<{ id: string; childIdx: number; pathIdx: number }> = [
      { id: start.id, childIdx: 0, pathIdx: 0 },
    ];
    const path: string[] = [];
    color.set(start.id, GRAY);
    path.push(start.id);

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const children = adj.get(top.id)!;
      if (top.childIdx >= children.length) {
        color.set(top.id, BLACK);
        path.pop();
        stack.pop();
        continue;
      }
      const child = children[top.childIdx++];
      const cColor = color.get(child) ?? WHITE;
      if (cColor === GRAY) {
        const cycleStart = path.indexOf(child);
        const cycle = [...path.slice(cycleStart), child].join(" -> ");
        throw new Error(`Cycle detected: ${cycle}`);
      }
      if (cColor === WHITE) {
        color.set(child, GRAY);
        path.push(child);
        stack.push({ id: child, childIdx: 0, pathIdx: path.length - 1 });
      }
    }
  }
}

/**
 * Kahn's algorithm — return tasks grouped into ranks. Tasks within a rank
 * have no inter-dependencies and can run in parallel.
 */
export function computeRanks(dag: DAG): RawTask[][] {
  const remaining = new Map<string, number>();
  const byId = new Map<string, RawTask>();
  for (const t of dag.tasks) {
    remaining.set(t.id, t.depends_on.length);
    byId.set(t.id, t);
  }
  const dependents = new Map<string, string[]>();
  for (const t of dag.tasks) dependents.set(t.id, []);
  for (const t of dag.tasks) {
    for (const dep of t.depends_on) {
      dependents.get(dep)!.push(t.id);
    }
  }

  const ranks: RawTask[][] = [];
  let frontier = dag.tasks.filter((t) => remaining.get(t.id) === 0);
  while (frontier.length > 0) {
    ranks.push(frontier);
    const next: RawTask[] = [];
    for (const t of frontier) {
      for (const child of dependents.get(t.id)!) {
        const r = remaining.get(child)! - 1;
        remaining.set(child, r);
        if (r === 0) next.push(byId.get(child)!);
      }
    }
    frontier = next;
  }

  const placed = ranks.reduce((n, r) => n + r.length, 0);
  if (placed !== dag.tasks.length) {
    throw new Error("Topological sort failed — DAG contains a cycle.");
  }
  return ranks;
}

export function modelForComplexity(c: Complexity): string {
  switch (c) {
    case "HIGH":
      return "gpt-5.3-codex";
    case "MED":
      return "composer-2";
    case "LOW":
      return "composer-2-fast";
  }
}
