import type { MitreMatch } from "./types";

// The MITRE ATT&CK mapping the enrich_ip tool carries, ported unchanged. It is a
// keyword table, not a model and not an API, which is why it is the one enricher
// that answers with no key, no network and no failure mode.
//
// Order matters: the first row whose keyword appears in the description wins. So
// "SSH brute force" maps to Brute Force rather than to Remote Services: SSH,
// because the brute-force row is above the ssh row. That is a decision, not an
// accident, and mitre.test.ts pins it.
const MAPPINGS: ReadonlyArray<{ keywords: string[]; technique: string; name: string; tactic: string }> = [
  { keywords: ["brute force", "failed login", "authentication failure"], technique: "T1110", name: "Brute Force", tactic: "Credential Access" },
  { keywords: ["ssh"], technique: "T1021.004", name: "Remote Services: SSH", tactic: "Lateral Movement" },
  { keywords: ["rdp", "remote desktop"], technique: "T1021.001", name: "Remote Services: RDP", tactic: "Lateral Movement" },
  { keywords: ["port scan", "network scan", "reconnaissance"], technique: "T1046", name: "Network Service Discovery", tactic: "Discovery" },
  { keywords: ["malware", "trojan", "virus", "ransomware"], technique: "T1204", name: "User Execution", tactic: "Execution" },
  { keywords: ["phishing", "spear"], technique: "T1566", name: "Phishing", tactic: "Initial Access" },
  { keywords: ["privilege", "escalat", "sudo", "root"], technique: "T1068", name: "Exploitation for Privilege Escalation", tactic: "Privilege Escalation" },
  { keywords: ["exfiltrat", "data transfer", "upload"], technique: "T1041", name: "Exfiltration Over C2 Channel", tactic: "Exfiltration" },
  { keywords: ["command and control", "c2", "beacon", "callback"], technique: "T1071", name: "Application Layer Protocol", tactic: "Command and Control" },
  { keywords: ["sql injection", "sqli", "injection"], technique: "T1190", name: "Exploit Public-Facing Application", tactic: "Initial Access" },
  { keywords: ["web shell", "webshell"], technique: "T1505.003", name: "Server Software Component: Web Shell", tactic: "Persistence" },
  { keywords: ["denial of service", "dos", "ddos", "flood"], technique: "T1498", name: "Network Denial of Service", tactic: "Impact" },
];

export const MITRE_MAPPING_COUNT = MAPPINGS.length;

export function mapToMitre(alertDescription: string | null | undefined): MitreMatch {
  const description = (alertDescription || "").toLowerCase();

  for (const mapping of MAPPINGS) {
    if (mapping.keywords.some((keyword) => description.includes(keyword))) {
      return {
        technique_id: mapping.technique,
        technique_name: mapping.name,
        tactic: mapping.tactic,
        confidence: "keyword_match",
      };
    }
  }

  // No row matched. The alert is not mapped to a technique it does not obviously
  // belong to, and the score below it gets no boost.
  return { technique_id: null, technique_name: null, tactic: null, confidence: "no_match" };
}

export function mitreTable(): ReadonlyArray<{ keywords: string[]; technique: string; name: string; tactic: string }> {
  return MAPPINGS;
}
