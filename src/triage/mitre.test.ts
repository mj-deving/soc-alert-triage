import { describe, expect, test } from "bun:test";
import { mapToMitre } from "./mitre";

// The 12 keyword mappings the enrich_ip tool carries. No API, no key: the table
// is in the code, so this is the one enricher that cannot fail.

describe("mapToMitre", () => {
  test("maps a brute force description to T1110", () => {
    const m = mapToMitre("SSH brute force attack");
    expect(m.technique_id).toBe("T1110");
    expect(m.technique_name).toBe("Brute Force");
    expect(m.tactic).toBe("Credential Access");
    expect(m.confidence).toBe("keyword_match");
  });

  // First rule wins. "SSH brute force" hits both the brute-force row and the ssh
  // row, and the order of the table decides which. Locking it here means a
  // reordering shows up as a failing test rather than as a different technique.
  test("takes the first matching row, not the most specific", () => {
    expect(mapToMitre("SSH brute force attack").technique_id).toBe("T1110");
    expect(mapToMitre("Anomalous ssh session").technique_id).toBe("T1021.004");
  });

  test.each([
    ["Remote desktop login from new geo", "T1021.001", "Lateral Movement"],
    ["Port scan detected", "T1046", "Discovery"],
    ["Ransomware canary triggered", "T1204", "Execution"],
    ["Phishing link clicked", "T1566", "Initial Access"],
    ["sudo privilege escalation", "T1068", "Privilege Escalation"],
    ["Large data transfer to external host", "T1041", "Exfiltration"],
    ["Beacon callback to known C2", "T1071", "Command and Control"],
    ["SQL injection on /login", "T1190", "Initial Access"],
    ["Web shell dropped in /var/www", "T1505.003", "Persistence"],
    ["UDP flood against edge", "T1498", "Impact"],
  ])("maps %s to %s", (description, technique, tactic) => {
    const m = mapToMitre(description);
    expect(m.technique_id).toBe(technique);
    expect(m.tactic).toBe(tactic);
  });

  test("returns no_match rather than a guess when nothing matches", () => {
    const m = mapToMitre("DNS query to external resolver");
    expect(m.technique_id).toBeNull();
    expect(m.confidence).toBe("no_match");
  });

  test("is case insensitive and survives an empty description", () => {
    expect(mapToMitre("BRUTE FORCE").technique_id).toBe("T1110");
    expect(mapToMitre("").technique_id).toBeNull();
  });
});
