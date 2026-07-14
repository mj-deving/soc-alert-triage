// The four example alerts the console offers.
//
// The alert payloads are synthetic: nobody attacked anything. The IP addresses in
// them are real and publicly routable, which is the point, because the enrichment
// that runs against them is a real lookup returning what Shodan actually knows
// today. A demo with a fabricated IP would return fabricated intelligence.
//
// The fourth one names a documentation address from RFC 5737. Shodan has never
// scanned it and never will, so it is how the console shows a source that has
// nothing to say, rather than only ever showing the happy path.

export interface Example {
  id: string;
  label: string;
  note: string;
  payload: unknown;
}

export const EXAMPLES: Example[] = [
  {
    id: "wazuh-tor-ssh",
    label: "Wazuh · SSH brute force",
    note: "Source is a live Tor exit node. Shodan knows it; the description maps to T1110.",
    payload: {
      rule: { id: "5710", level: 10, description: "SSH brute force attack" },
      agent: { name: "webserver-01", ip: "10.0.1.50" },
      data: { srcip: "185.220.101.34", dstip: "10.0.1.50", dstport: "22" },
      timestamp: "2026-07-14T10:30:00Z",
    },
  },
  {
    id: "wazuh-dns-benign",
    label: "Wazuh · DNS query",
    note: "Source is Google's resolver. Two open ports, no technique match, low rule level.",
    payload: {
      rule: { id: "1002", level: 3, description: "DNS query to external resolver" },
      agent: { name: "workstation-05", ip: "10.0.2.10" },
      data: { srcip: "8.8.8.8", dstip: "10.0.2.10", dstport: "53" },
      timestamp: "2026-07-14T14:15:00Z",
    },
  },
  {
    id: "elastic-rdp",
    label: "Elastic · RDP login",
    note: "A second SIEM dialect. The normalizer reads signal.rule instead of rule + agent + data.",
    payload: {
      signal: { rule: { id: "d4c3b2a1", name: "Suspicious RDP login from new geography", severity: "high" } },
      source: { ip: "45.155.205.233" },
      destination: { ip: "10.0.4.7", port: 3389 },
      "@timestamp": "2026-07-14T02:11:00Z",
    },
  },
  {
    id: "generic-unscanned",
    label: "Generic · unscanned IP",
    note: "RFC 5737 documentation address. Shodan has no record of it, so the console says so.",
    payload: {
      source_ip: "192.0.2.1",
      dest_ip: "10.0.7.3",
      dest_port: 8080,
      alert_type: "Port scan detected",
      severity: "medium",
      rule_id: "gen-0042",
      timestamp: "2026-07-14T09:02:00Z",
    },
  },
];
