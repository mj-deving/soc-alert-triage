import { MemoryDedupStore } from "./dedup";
import { enrichIp, type EnrichOptions } from "./enrich";
import { normalizeAlert } from "./normalize";
import { ROUTE_ACTIONS, scoreAlert } from "./score";
import type { TriageResult } from "./types";

// The four stages, in the order the workflow runs them. Each one is a pure function
// of the stage before it, except the enrichment (network) and the dedup (state), and
// both of those are injected so the pipeline stays testable end to end.

// One store per isolate. See dedup.ts for what that is worth and what it is not.
const store = new MemoryDedupStore();

export async function triage(rawAlert: unknown, options: EnrichOptions = {}): Promise<TriageResult> {
  const startedAt = Date.now();

  const normalizeStart = Date.now();
  const alert = normalizeAlert(rawAlert);
  const normalizeMs = Date.now() - normalizeStart;

  const enrichStart = Date.now();
  const enrichment = await enrichIp(alert.source_ip, alert.alert_type, options);
  const enrichMs = Date.now() - enrichStart;

  const scoreStart = Date.now();
  const scoring = scoreAlert(alert, enrichment);
  const dedup = store.record(alert.source_ip, Date.now());
  const scoreMs = Date.now() - scoreStart;

  return {
    alert,
    enrichment,
    scoring,
    dedup,
    route: ROUTE_ACTIONS[scoring.route_index] ?? "dismiss",
    timings: { normalize_ms: normalizeMs, enrich_ms: enrichMs, score_ms: scoreMs, total_ms: Date.now() - startedAt },
  };
}
