import type { Enrichment, NormalizedAlert, Scoring, Severity, Subscores } from "./types";

// Port of the `Score and Dedup` code node, scoring half. A weighted average over
// whichever sources answered, plus a flat boost when the alert maps to a MITRE
// technique, capped at 100.

const NOMINAL_WEIGHTS = { virustotal: 0.3, abuseipdb: 0.3, shodan: 0.2, base: 0.2 } as const;
const MITRE_BOOST = 15;
const SEVERITY_BASE: Record<Severity, number> = { critical: 100, high: 75, medium: 50, low: 25 };

/** The routing table the Severity Router switches on. Inclusive at the bottom of
 *  each band: 80 is critical, 79 is high. */
export function severityFor(score: number): { severity_level: Severity; route_index: number } {
  if (score >= 80) return { severity_level: "critical", route_index: 0 };
  if (score >= 60) return { severity_level: "high", route_index: 1 };
  if (score >= 40) return { severity_level: "medium", route_index: 2 };
  return { severity_level: "low", route_index: 3 };
}

export const ROUTE_ACTIONS = ["Telegram alert (critical)", "Telegram alert (high)", "log only", "dismiss"] as const;

// The n8n tool asks `hostnames.some(h => h.includes('tor'))`. That is a substring
// test over the whole hostname, so it reads storage.example.com and monitor.acme.io
// as Tor exit nodes and hands each of them 20 points it did not earn. This checks
// the hostname's labels instead: tor-exit-34.for-privacy.net still matches, and a
// file server no longer does. It is the one place the port does not reproduce the
// workflow, it is deliberate, and score.test.ts holds both halves of it.
export function looksLikeTorExit(hostnames: string[]): boolean {
  return hostnames.some((hostname) =>
    hostname
      .toLowerCase()
      .split(/[.\-_]/)
      .includes("tor")
  );
}

export function scoreAlert(alert: NormalizedAlert, enrichment: Enrichment): Scoring {
  const subscores: Subscores = { base: SEVERITY_BASE[alert.severity] ?? 50 };
  const applied: Scoring["weights_applied"] = { shodan: 0, virustotal: 0, abuseipdb: 0, base: NOMINAL_WEIGHTS.base };
  let availableWeight: number = NOMINAL_WEIGHTS.base; // the alert always states its own severity

  const shodanSignals = { open_ports: 0, vulns: 0, tor_hostname: false };
  const shodan = enrichment.shodan_internetdb;
  if (shodan.status === "ok" && shodan.data) {
    const ports = shodan.data.ports ?? [];
    const vulns = shodan.data.vulns ?? [];
    const tor = looksLikeTorExit(shodan.data.hostnames ?? []);

    shodanSignals.open_ports = ports.length;
    shodanSignals.vulns = vulns.length;
    shodanSignals.tor_hostname = tor;

    // Exposure, not reputation: an open port is not an accusation, so each of the
    // three terms is capped and none of them alone reaches 100.
    const exposure = Math.min(ports.length * 10, 40) + Math.min(vulns.length * 20, 40) + (tor ? 20 : 0);
    subscores.shodan = Math.min(exposure, 100);
    applied.shodan = NOMINAL_WEIGHTS.shodan;
    availableWeight += NOMINAL_WEIGHTS.shodan;
  }

  const virustotal = enrichment.virustotal;
  if (virustotal.status === "ok" && virustotal.data) {
    const stats = virustotal.data.last_analysis_stats ?? {};
    const malicious = stats.malicious ?? 0;
    const total = (stats.malicious ?? 0) + (stats.undetected ?? 0) + (stats.harmless ?? 0) + (stats.suspicious ?? 0);
    const maliciousRatio = total > 0 ? (malicious / total) * 100 : 0;
    const reputationScore = Math.min(Math.abs(virustotal.data.reputation ?? 0), 100);

    // Whichever of the two reads worse. A low malicious ratio does not clear an IP
    // the community has voted down.
    subscores.virustotal = Math.min(Math.max(maliciousRatio, reputationScore), 100);
    applied.virustotal = NOMINAL_WEIGHTS.virustotal;
    availableWeight += NOMINAL_WEIGHTS.virustotal;
  }

  const abuseipdb = enrichment.abuseipdb;
  if (abuseipdb.status === "ok" && abuseipdb.data) {
    subscores.abuseipdb = abuseipdb.data.abuse_confidence_score ?? 0;
    applied.abuseipdb = NOMINAL_WEIGHTS.abuseipdb;
    availableWeight += NOMINAL_WEIGHTS.abuseipdb;
  }

  // Redistribution. A source that did not answer must not score zero, because a
  // silent source is not a clean one: two of four keys missing would otherwise
  // drag every alert into the low band and quietly stop the pipeline alerting.
  for (const key of ["shodan", "virustotal", "abuseipdb", "base"] as const) {
    applied[key] = applied[key] / availableWeight;
  }

  let total =
    (subscores.shodan ?? 0) * applied.shodan +
    (subscores.virustotal ?? 0) * applied.virustotal +
    (subscores.abuseipdb ?? 0) * applied.abuseipdb +
    subscores.base * applied.base;

  const mitre = enrichment.mitre_attack;
  const mitreBoost = mitre.status === "ok" && mitre.data?.technique_id ? MITRE_BOOST : 0;

  total = Math.round(Math.min(total + mitreBoost, 100));

  return {
    severity_score: total,
    ...severityFor(total),
    subscores,
    weights_applied: applied,
    mitre_boost: mitreBoost,
    shodan_signals: shodanSignals,
  };
}
