import type { NormalizedAlert, Severity } from "./types";

// Port of the `Normalize Alert` code node. Three SIEM dialects in, one schema out.
// The detection is structural rather than declared: an alert does not say which
// product emitted it, so the node reads the shape. Wazuh carries rule + agent +
// data, Elastic carries signal.rule, and anything else is read field by field.

type Raw = Record<string, unknown>;

function asRecord(value: unknown): Raw {
  return value && typeof value === "object" ? (value as Raw) : {};
}

function str(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

// Wazuh states a rule level from 0 to 15, not a severity word.
function severityFromWazuhLevel(level: number): Severity {
  if (level >= 12) return "critical";
  if (level >= 10) return "high";
  if (level >= 7) return "medium";
  return "low";
}

function asSeverity(value: unknown, fallback: Severity): Severity {
  const s = String(value ?? "").toLowerCase();
  return s === "critical" || s === "high" || s === "medium" || s === "low" ? s : fallback;
}

export function normalizeAlert(input: unknown, now: Date = new Date()): NormalizedAlert {
  // The n8n webhook node hands the code node the whole envelope (headers, params,
  // query, body) and the alert is in `body`. A direct POST to this Worker is the
  // alert itself. Both are accepted.
  const envelope = asRecord(input);
  const raw = asRecord(envelope.body ?? envelope);
  const nowIso = now.toISOString();

  const rule = asRecord(raw.rule);
  const agent = asRecord(raw.agent);
  const data = asRecord(raw.data);
  const signal = asRecord(raw.signal);

  if (raw.rule && raw.agent && raw.data) {
    const level = Number(rule.level) || 0;
    return {
      source: "wazuh",
      source_ip: str(data.srcip),
      dest_ip: str(data.dstip) ?? str(agent.ip),
      dest_port: (data.dstport as string | number | undefined) ?? null,
      alert_type: str(rule.description) ?? "unknown",
      rule_id: str(rule.id),
      severity: severityFromWazuhLevel(level),
      agent_name: str(agent.name),
      timestamp: str(raw.timestamp) ?? nowIso,
    };
  }

  if (raw.signal && signal.rule) {
    const signalRule = asRecord(signal.rule);
    return {
      source: "elastic",
      source_ip: str(asRecord(raw.source).ip),
      dest_ip: str(asRecord(raw.destination).ip),
      dest_port: (asRecord(raw.destination).port as string | number | undefined) ?? null,
      alert_type: str(signalRule.name) ?? "unknown",
      rule_id: str(signalRule.id),
      severity: asSeverity(signalRule.severity, "medium"),
      agent_name: null,
      timestamp: str(raw["@timestamp"]) ?? nowIso,
    };
  }

  return {
    source: "generic",
    source_ip: str(raw.source_ip) ?? str(raw.src_ip),
    dest_ip: str(raw.dest_ip) ?? str(raw.dst_ip),
    dest_port: (raw.dest_port as string | number | undefined) ?? (raw.dst_port as string | number | undefined) ?? null,
    alert_type: str(raw.alert_type) ?? str(raw.description) ?? "unknown",
    rule_id: str(raw.rule_id),
    severity: asSeverity(raw.severity, "medium"),
    agent_name: str(raw.agent_name),
    timestamp: str(raw.timestamp) ?? nowIso,
  };
}
