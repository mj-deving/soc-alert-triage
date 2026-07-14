import type { DedupRecord } from "./types";

// The n8n node keeps its window in $getWorkflowStaticData('global'), which persists
// across executions of one workflow. A Worker has no such object, so the window is
// an interface with an in-memory implementation, and the caller passes the clock.
//
// What that costs is stated rather than hidden: this Map lives in a Worker isolate.
// Cloudflare may start a second isolate for a second visitor, and it retires an idle
// one, so the window here is per-isolate and short-lived. Bind a Durable Object and
// the same interface holds real state. The demo does not, because a demo does not
// need one and the honest thing is to say which one it is running.

export const DEDUP_WINDOW_MS = 3_600_000; // one hour, as in the workflow

export interface DedupStore {
  record(ip: string | null, nowMs: number): DedupRecord | null;
}

export class MemoryDedupStore implements DedupStore {
  private seen = new Map<string, DedupRecord>();

  /** Returns null for an alert with no source IP: there is nothing to key on, and
   *  bucketing them all under "unknown" would report unrelated alerts as repeats. */
  record(ip: string | null, nowMs: number = Date.now()): DedupRecord | null {
    this.prune(nowMs);
    if (!ip) return null;

    const previous = this.seen.get(ip);
    const entry: DedupRecord = previous
      ? { is_duplicate: true, count: previous.count + 1, first_seen_ms: previous.first_seen_ms, last_seen_ms: nowMs }
      : { is_duplicate: false, count: 1, first_seen_ms: nowMs, last_seen_ms: nowMs };

    this.seen.set(ip, entry);
    return entry;
  }

  size(): number {
    return this.seen.size;
  }

  private prune(nowMs: number): void {
    for (const [ip, entry] of this.seen) {
      if (nowMs - entry.last_seen_ms > DEDUP_WINDOW_MS) this.seen.delete(ip);
    }
  }
}
