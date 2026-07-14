import { describe, expect, test } from "bun:test";
import { MemoryDedupStore, DEDUP_WINDOW_MS } from "./dedup";

// The n8n node keeps the window in $getWorkflowStaticData('global'). A Worker has
// no such thing, so the window is a store behind an interface and the logic is a
// pure function of (store, ip, now). The test drives the clock; it does not wait.

// record() returns null only for an alert with no source IP, which the last test
// covers on its own. Everywhere else a record is expected, so assert that once here
// rather than in every line below.
function seen(store: MemoryDedupStore, ip: string, atMs: number) {
  const record = store.record(ip, atMs);
  expect(record).not.toBeNull();
  return record!;
}

describe("dedup window", () => {
  test("a first sighting is not a duplicate", () => {
    const store = new MemoryDedupStore();
    const r = seen(store, "185.220.101.34", 1_000_000);

    expect(r.is_duplicate).toBe(false);
    expect(r.count).toBe(1);
    expect(r.first_seen_ms).toBe(1_000_000);
  });

  test("a second sighting inside the window is a duplicate and counts up", () => {
    const store = new MemoryDedupStore();
    store.record("185.220.101.34", 1_000_000);
    const r = seen(store, "185.220.101.34", 1_000_000 + 60_000);

    expect(r.is_duplicate).toBe(true);
    expect(r.count).toBe(2);
    expect(r.first_seen_ms).toBe(1_000_000); // first_seen survives the repeat
    expect(r.last_seen_ms).toBe(1_060_000);
  });

  test("the window is one hour, and one millisecond past it is a first sighting again", () => {
    expect(DEDUP_WINDOW_MS).toBe(3_600_000);

    const store = new MemoryDedupStore();
    store.record("185.220.101.34", 1_000_000);

    const inside = seen(store, "185.220.101.34", 1_000_000 + DEDUP_WINDOW_MS);
    expect(inside.is_duplicate).toBe(true);

    const outside = seen(store, "185.220.101.34", 1_000_000 + DEDUP_WINDOW_MS * 2 + 1);
    expect(outside.is_duplicate).toBe(false);
    expect(outside.count).toBe(1);
  });

  test("two IPs are two windows", () => {
    const store = new MemoryDedupStore();
    store.record("185.220.101.34", 1_000_000);
    const other = seen(store, "8.8.8.8", 1_000_000);

    expect(other.is_duplicate).toBe(false);
    expect(store.size()).toBe(2);
  });

  test("expired entries are dropped rather than kept forever", () => {
    const store = new MemoryDedupStore();
    store.record("185.220.101.34", 1_000_000);
    store.record("8.8.8.8", 1_000_000);
    expect(store.size()).toBe(2);

    store.record("1.1.1.1", 1_000_000 + DEDUP_WINDOW_MS + 1);
    expect(store.size()).toBe(1); // the two stale windows are gone, only the new one is left
  });

  // The n8n node keys these under the string "unknown", so two unrelated alerts
  // that both lack a source IP report each other as repeats. There is nothing to
  // key on, so there is no window: the store returns null and the UI says so.
  test("an alert with no source IP does not collapse into one bucket called unknown", () => {
    const store = new MemoryDedupStore();

    expect(store.record(null, 1_000_000)).toBeNull();
    expect(store.record(null, 1_000_000)).toBeNull();
    expect(store.size()).toBe(0);
  });
});
