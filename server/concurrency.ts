export type TaskPriority = "interactive" | "normal" | "background";
const rank: Record<TaskPriority, number> = { interactive: 0, normal: 1, background: 2 };
function cancelled() {
  const error = new Error("Task cancelled");
  error.name = "AbortError";
  return error;
}

// Share a process budget. Choose the next task when a slot actually becomes free.
export class TaskPool {
  private active = 0;
  private readonly waiting: {
    start(): void;
    priority(): TaskPriority;
    signal?: AbortSignal;
    abort(): void;
  }[] = [];
  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid concurrency limit");
  }
  async run<T>(
    task: () => Promise<T>,
    options: { priority?: TaskPriority | (() => TaskPriority); signal?: AbortSignal } = {},
  ): Promise<T> {
    if (options.signal?.aborted) throw cancelled();
    if (this.active >= this.limit) {
      await new Promise<void>((resolve, reject) => {
        const entry = {
          start: resolve,
          priority:
            typeof options.priority === "function"
              ? options.priority
              : () => (options.priority as TaskPriority) ?? "normal",
          signal: options.signal,
          abort: () => {
            const index = this.waiting.indexOf(entry);
            if (index >= 0) this.waiting.splice(index, 1);
            reject(cancelled());
          },
        };
        this.waiting.push(entry);
        options.signal?.addEventListener("abort", entry.abort, { once: true });
      });
    } else this.active++;
    try {
      if (options.signal?.aborted) throw cancelled();
      return await task();
    } finally {
      let index = 0;
      for (let i = 1; i < this.waiting.length; i++)
        if (rank[this.waiting[i].priority()] < rank[this.waiting[index].priority()]) index = i;
      const next = this.waiting.splice(index, 1)[0];
      if (next) {
        next.signal?.removeEventListener("abort", next.abort);
        next.start();
      } else this.active--;
    }
  }
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  visit: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await visit(items[index]);
      }
    }),
  );
  return results;
}
