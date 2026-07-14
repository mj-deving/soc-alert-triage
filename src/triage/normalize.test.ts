import { describe, expect, test } from "bun:test";
import { normalizeAlert } from "./normalize";

// The three formats the n8n Normalize Alert node accepts, and the field it reads
// each one out of. Fixtures are the payloads the repo's own README posts with curl.

describe("normalizeAlert", () => {
  test("reads a Wazuh alert out of rule/agent/data", () => {
    const n = normalizeAlert({
      rule: { id: "5710", level: 10, description: "SSH brute force attack" },
      agent: { name: "webserver-01", ip: "10.0.1.50" },
      data: { srcip: "185.220.101.34", dstip: "10.0.1.50", dstport: "22" },
      timestamp: "2026-04-16T10:30:00Z",
    });

    expect(n.source).toBe("wazuh");
    expect(n.source_ip).toBe("185.220.101.34");
    expect(n.dest_ip).toBe("10.0.1.50");
    expect(n.dest_port).toBe("22");
    expect(n.alert_type).toBe("SSH brute force attack");
    expect(n.rule_id).toBe("5710");
    expect(n.agent_name).toBe("webserver-01");
    expect(n.timestamp).toBe("2026-04-16T10:30:00Z");
  });

  // Wazuh states a numeric rule level, not a severity word. The mapping is the
  // node's, and the boundaries are the part a rewrite gets wrong.
  test.each([
    [12, "critical"],
    [10, "high"],
    [9, "medium"],
    [7, "medium"],
    [6, "low"],
    [3, "low"],
  ])("Wazuh rule level %i is severity %s", (level, severity) => {
    const n = normalizeAlert({
      rule: { id: "1", level, description: "x" },
      agent: { name: "a", ip: "10.0.0.1" },
      data: { srcip: "8.8.8.8" },
    });
    expect(n.severity).toBe(severity as never);
  });

  test("reads an Elastic SIEM alert out of signal.rule", () => {
    const n = normalizeAlert({
      signal: { rule: { id: "a1b2", name: "Suspicious RDP login", severity: "high" } },
      source: { ip: "45.155.205.233" },
      destination: { ip: "10.0.4.7", port: 3389 },
      "@timestamp": "2026-07-14T08:00:00Z",
    });

    expect(n.source).toBe("elastic");
    expect(n.source_ip).toBe("45.155.205.233");
    expect(n.dest_port).toBe(3389);
    expect(n.alert_type).toBe("Suspicious RDP login");
    expect(n.severity).toBe("high");
    expect(n.timestamp).toBe("2026-07-14T08:00:00Z");
  });

  test("falls back to the generic schema and its field aliases", () => {
    const n = normalizeAlert({
      src_ip: "1.1.1.1",
      dst_ip: "10.0.9.9",
      dst_port: 443,
      description: "Port scan detected",
      severity: "medium",
    });

    expect(n.source).toBe("generic");
    expect(n.source_ip).toBe("1.1.1.1");
    expect(n.dest_ip).toBe("10.0.9.9");
    expect(n.dest_port).toBe(443);
    expect(n.alert_type).toBe("Port scan detected");
  });

  test("unwraps the webhook envelope, because n8n hands the node headers and body", () => {
    const n = normalizeAlert({
      headers: { "content-type": "application/json" },
      body: { source_ip: "8.8.8.8", alert_type: "DNS query", severity: "low" },
    });
    expect(n.source_ip).toBe("8.8.8.8");
    expect(n.alert_type).toBe("DNS query");
  });

  // A missing source IP is not an error, it is an alert that cannot be enriched.
  test("keeps a missing source IP as null rather than inventing one", () => {
    const n = normalizeAlert({ alert_type: "Disk full" });
    expect(n.source_ip).toBeNull();
    expect(n.severity).toBe("medium");
  });
});
