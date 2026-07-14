// The shapes the pipeline passes between its four stages. They mirror the fields
// the n8n workflow builds in `Normalize Alert`, `enrich_ip` and `Score and Dedup`;
// where a name changed, it changed because a Worker has no $getWorkflowStaticData
// and no `this.helpers.httpRequest`, not because the meaning did.

export type Severity = "critical" | "high" | "medium" | "low";

export interface NormalizedAlert {
  source: "wazuh" | "elastic" | "generic";
  source_ip: string | null;
  dest_ip: string | null;
  dest_port: string | number | null;
  alert_type: string;
  rule_id: string | null;
  severity: Severity;
  agent_name: string | null;
  timestamp: string;
}

export interface MitreMatch {
  technique_id: string | null;
  technique_name: string | null;
  tactic: string | null;
  confidence: "keyword_match" | "no_match";
}

export interface ShodanData {
  ip: string;
  hostnames: string[];
  ports: number[];
  vulns: string[];
  cpes: string[];
  tags?: string[];
}

export interface VirusTotalData {
  reputation: number | null;
  last_analysis_stats: { malicious?: number; suspicious?: number; harmless?: number; undetected?: number } | null;
  country: string | null;
  as_owner: string | null;
}

export interface AbuseIpdbData {
  abuse_confidence_score: number | null;
  total_reports: number | null;
  is_tor: boolean | null;
  isp: string | null;
  country_code: string | null;
}

// Four states, and the difference between them is the whole honesty of the demo.
//   ok       the source answered, and its answer is below
//   failed   the source was asked and did not answer (404, timeout, upstream error)
//   disabled the source was not asked, because this deployment holds no key for it
//   skipped  the source was not asked, because the alert names no IP to ask about
// A source that is not `ok` carries no data field. There is no fifth state where
// a number is filled in on its behalf.
export type SourceStatus = "ok" | "failed" | "disabled" | "skipped";

export interface SourceResult<T> {
  source: string;
  status: SourceStatus;
  latency_ms?: number;
  data?: T;
  reason?: string;
}

export interface Enrichment {
  shodan_internetdb: SourceResult<ShodanData>;
  mitre_attack: SourceResult<MitreMatch>;
  virustotal: SourceResult<VirusTotalData>;
  abuseipdb: SourceResult<AbuseIpdbData>;
}

export interface Subscores {
  shodan?: number;
  virustotal?: number;
  abuseipdb?: number;
  base: number;
}

export interface Scoring {
  severity_score: number;
  severity_level: Severity;
  route_index: number;
  subscores: Subscores;
  // The weight each source actually carried after redistribution. A source that
  // did not answer carries 0, and the weight it would have carried is spread over
  // the ones that did.
  weights_applied: { shodan: number; virustotal: number; abuseipdb: number; base: number };
  mitre_boost: number;
  shodan_signals: { open_ports: number; vulns: number; tor_hostname: boolean };
}

export interface DedupRecord {
  is_duplicate: boolean;
  count: number;
  first_seen_ms: number;
  last_seen_ms: number;
}

export interface TriageResult {
  alert: NormalizedAlert;
  enrichment: Enrichment;
  scoring: Scoring;
  dedup: DedupRecord | null;
  route: string;
  timings: { normalize_ms: number; enrich_ms: number; score_ms: number; total_ms: number };
}
