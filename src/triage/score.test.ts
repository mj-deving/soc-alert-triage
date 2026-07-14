import { describe, expect, test } from "bun:test";
import { scoreAlert, severityFor } from "./score";
import type { Enrichment, NormalizedAlert } from "./types";

// The oracle is not invented. benchmark.md records two real n8n executions from
// 2026-04-16 (ids 1970 and 1952) and the score each one produced. The port has to
// reproduce both from the same enrichment, or it is not the same pipeline.
//
// Shodan's answer for an IP changes as Shodan rescans it. These fixtures are what
// it returned on 2026-04-16, so the numbers below stay fixed. The live console
// scores whatever Shodan says today, which is a different and honest thing.

function alert(over: Partial<NormalizedAlert> = {}): NormalizedAlert {
  return {
    source: "wazuh",
    source_ip: "185.220.101.34",
    dest_ip: "10.0.1.50",
    dest_port: "22",
    alert_type: "SSH brute force attack",
    rule_id: "5710",
    severity: "high",
    agent_name: "webserver-01",
    timestamp: "2026-04-16T10:30:00Z",
    ...over,
  };
}

const shodanTorExit: Enrichment = {
  shodan_internetdb: {
    source: "shodan_internetdb",
    status: "ok",
    latency_ms: 249,
    data: { ip: "185.220.101.34", hostnames: ["tor-exit-34.for-privacy.net"], ports: [80, 10134], vulns: [], cpes: [] },
  },
  mitre_attack: {
    source: "mitre_attack",
    status: "ok",
    latency_ms: 0,
    data: { technique_id: "T1110", technique_name: "Brute Force", tactic: "Credential Access", confidence: "keyword_match" },
  },
  virustotal: { source: "virustotal", status: "disabled", reason: "no API key bound to this deployment" },
  abuseipdb: { source: "abuseipdb", status: "disabled", reason: "no API key bound to this deployment" },
};

const shodanGoogleDns: Enrichment = {
  shodan_internetdb: {
    source: "shodan_internetdb",
    status: "ok",
    latency_ms: 246,
    data: { ip: "8.8.8.8", hostnames: ["dns.google"], ports: [53, 443], vulns: [], cpes: [] },
  },
  mitre_attack: {
    source: "mitre_attack",
    status: "ok",
    latency_ms: 0,
    data: { technique_id: null, technique_name: null, tactic: null, confidence: "no_match" },
  },
  virustotal: { source: "virustotal", status: "disabled", reason: "no API key bound to this deployment" },
  abuseipdb: { source: "abuseipdb", status: "disabled", reason: "no API key bound to this deployment" },
};

describe("scoreAlert reproduces the recorded n8n executions", () => {
  test("execution 1970: Tor exit node, SSH brute force, scores 73 and routes high", () => {
    const s = scoreAlert(alert(), shodanTorExit);

    expect(s.subscores.shodan).toBe(40); // 2 ports x 10, capped, + 20 for the Tor hostname
    expect(s.subscores.base).toBe(75); // rule level 10 is high
    expect(s.mitre_boost).toBe(15);
    expect(s.severity_score).toBe(73);
    expect(s.severity_level).toBe("high");
    expect(s.route_index).toBe(1);
  });

  test("execution 1952: Google DNS, no technique match, scores 23 and is dismissed", () => {
    const s = scoreAlert(alert({ source_ip: "8.8.8.8", alert_type: "DNS query to external resolver", severity: "low" }), shodanGoogleDns);

    expect(s.subscores.shodan).toBe(20);
    expect(s.subscores.base).toBe(25);
    expect(s.mitre_boost).toBe(0);
    expect(s.severity_score).toBe(23);
    expect(s.severity_level).toBe("low");
    expect(s.route_index).toBe(3);
  });
});

describe("weight redistribution", () => {
  // The point of the weight table: a source that did not answer must not drag the
  // score down as if it had answered zero. Its weight is redistributed.
  test("a disabled source carries no weight and no zero", () => {
    const s = scoreAlert(alert(), shodanTorExit);
    expect(s.weights_applied.virustotal).toBe(0);
    expect(s.weights_applied.abuseipdb).toBe(0);
    expect(s.weights_applied.shodan).toBeCloseTo(0.5, 6);
    expect(s.weights_applied.base).toBeCloseTo(0.5, 6);
  });

  test("with all four sources live, the nominal weights apply", () => {
    const full: Enrichment = {
      ...shodanTorExit,
      virustotal: {
        source: "virustotal",
        status: "ok",
        latency_ms: 120,
        data: { reputation: -40, last_analysis_stats: { malicious: 10, suspicious: 0, harmless: 30, undetected: 60 }, country: "DE", as_owner: "x" },
      },
      abuseipdb: {
        source: "abuseipdb",
        status: "ok",
        latency_ms: 130,
        data: { abuse_confidence_score: 100, total_reports: 900, is_tor: true, isp: "x", country_code: "DE" },
      },
    };

    const s = scoreAlert(alert(), full);

    expect(s.weights_applied.virustotal).toBeCloseTo(0.3, 6);
    expect(s.weights_applied.shodan).toBeCloseTo(0.2, 6);
    // VirusTotal takes the worse of the malicious ratio (10 %) and |reputation| (40).
    expect(s.subscores.virustotal).toBe(40);
    expect(s.subscores.abuseipdb).toBe(100);
    // 40*.3 + 100*.3 + 40*.2 + 75*.2 = 12 + 30 + 8 + 15 = 65, +15 MITRE = 80.
    expect(s.severity_score).toBe(80);
    expect(s.severity_level).toBe("critical");
  });

  test("the MITRE boost cannot push the score past 100", () => {
    const full: Enrichment = {
      ...shodanTorExit,
      virustotal: {
        source: "virustotal",
        status: "ok",
        latency_ms: 1,
        data: { reputation: -100, last_analysis_stats: { malicious: 90, suspicious: 0, harmless: 0, undetected: 0 }, country: null, as_owner: null },
      },
      abuseipdb: {
        source: "abuseipdb",
        status: "ok",
        latency_ms: 1,
        data: { abuse_confidence_score: 100, total_reports: 9000, is_tor: true, isp: null, country_code: null },
      },
    };

    const s = scoreAlert(alert({ severity: "critical" }), full);
    expect(s.severity_score).toBe(100);
    expect(s.severity_level).toBe("critical");
  });
});

describe("severity thresholds", () => {
  // The boundaries are inclusive at the bottom of each band. 79 is not critical
  // and 80 is, and an off-by-one here silently reroutes an incident.
  test.each([
    [100, "critical", 0],
    [80, "critical", 0],
    [79, "high", 1],
    [60, "high", 1],
    [59, "medium", 2],
    [40, "medium", 2],
    [39, "low", 3],
    [0, "low", 3],
  ])("a score of %i is %s on route %i", (score, level, route) => {
    expect(severityFor(score)).toEqual({ severity_level: level as never, route_index: route });
  });

  test("an alert that only has its own severity scores exactly that severity", () => {
    // No Shodan, no technique, no keys: base carries the whole weight, so the
    // score is the base value and nothing has been added to it.
    const bare: Enrichment = {
      shodan_internetdb: { source: "shodan_internetdb", status: "failed", reason: "no data for this IP" },
      mitre_attack: {
        source: "mitre_attack",
        status: "ok",
        latency_ms: 0,
        data: { technique_id: null, technique_name: null, tactic: null, confidence: "no_match" },
      },
      virustotal: { source: "virustotal", status: "disabled", reason: "no API key bound to this deployment" },
      abuseipdb: { source: "abuseipdb", status: "disabled", reason: "no API key bound to this deployment" },
    };

    const s = scoreAlert(alert({ severity: "medium", alert_type: "Disk pressure" }), bare);
    expect(s.subscores.shodan).toBeUndefined();
    expect(s.severity_score).toBe(50);
    expect(s.severity_level).toBe("medium");
  });
});

describe("the Tor hostname check", () => {
  // The n8n tool asks hostnames.some(h => h.includes('tor')). That is a substring
  // test, so it reads storage.example.com as a Tor exit and adds 20 points to a
  // host whose only crime is the word storage. The port matches on a hostname
  // label instead. The real exit node still scores; the file server does not.
  test("a real Tor exit hostname still scores", () => {
    const s = scoreAlert(alert(), shodanTorExit);
    expect(s.shodan_signals.tor_hostname).toBe(true);
    expect(s.subscores.shodan).toBe(40);
  });

  test("a hostname that merely contains the letters t-o-r does not", () => {
    const storage: Enrichment = {
      ...shodanTorExit,
      shodan_internetdb: {
        source: "shodan_internetdb",
        status: "ok",
        latency_ms: 100,
        data: { ip: "203.0.113.9", hostnames: ["storage.example.com"], ports: [443], vulns: [], cpes: [] },
      },
    };

    const s = scoreAlert(alert({ source_ip: "203.0.113.9" }), storage);
    expect(s.shodan_signals.tor_hostname).toBe(false);
    expect(s.subscores.shodan).toBe(10); // one port, no Tor bump
  });
});

describe("the Shodan subscore", () => {
  test("ports cap at 40 and vulnerabilities cap at 40", () => {
    const wide: Enrichment = {
      ...shodanTorExit,
      shodan_internetdb: {
        source: "shodan_internetdb",
        status: "ok",
        latency_ms: 100,
        data: {
          ip: "1.1.1.1",
          hostnames: ["one.one.one.one"],
          ports: [53, 80, 443, 2082, 2083, 2087, 8443, 8880],
          vulns: ["CVE-2021-44228", "CVE-2022-22965", "CVE-2023-1234"],
          cpes: [],
        },
      },
    };

    const s = scoreAlert(alert({ source_ip: "1.1.1.1" }), wide);
    // 8 ports would be 80, capped at 40. 3 vulns would be 60, capped at 40. No Tor.
    expect(s.subscores.shodan).toBe(80);
  });
});
