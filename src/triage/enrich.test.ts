import { describe, expect, test } from "bun:test";
import { enrichIp } from "./enrich";

// The four lookups fire together and settle independently: one failing source
// must not take the other three down. Fetch is injected, so these tests never
// touch the network and never depend on what Shodan happens to know today.

const shodanTorExit = {
  ip: "185.220.101.34",
  hostnames: ["tor-exit-34.for-privacy.net"],
  ports: [10134],
  vulns: [],
  cpes: [],
  tags: [],
};

function fakeFetch(routes: Record<string, { status: number; body: unknown }>, seen?: string[]) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    seen?.push(url);
    const key = Object.keys(routes).find((r) => url.startsWith(r));
    if (!key) return new Response("not found", { status: 404 });
    void init;
    return new Response(JSON.stringify(routes[key]!.body), {
      status: routes[key]!.status,
      headers: { "content-type": "application/json" },
    });
  };
}

describe("enrichIp", () => {
  test("Shodan InternetDB answers without a key, and MITRE answers without a network", async () => {
    const e = await enrichIp("185.220.101.34", "SSH brute force attack", {
      fetch: fakeFetch({ "https://internetdb.shodan.io/": { status: 200, body: shodanTorExit } }),
      keys: {},
    });

    expect(e.shodan_internetdb.status).toBe("ok");
    expect(e.shodan_internetdb.data?.hostnames).toEqual(["tor-exit-34.for-privacy.net"]);
    expect(e.mitre_attack.status).toBe("ok");
    expect(e.mitre_attack.data?.technique_id).toBe("T1110");
  });

  // The demo has no VirusTotal or AbuseIPDB key. It says so; it does not fill the
  // gap with a plausible number, and it does not send a request with an empty key
  // header the way the n8n tool does.
  test("a keyless enricher reports disabled and is never called", async () => {
    const seen: string[] = [];
    const e = await enrichIp("185.220.101.34", "SSH brute force attack", {
      fetch: fakeFetch({ "https://internetdb.shodan.io/": { status: 200, body: shodanTorExit } }, seen),
      keys: {},
    });

    expect(e.virustotal.status).toBe("disabled");
    expect(e.abuseipdb.status).toBe("disabled");
    expect(e.virustotal.data).toBeUndefined();
    expect(e.abuseipdb.data).toBeUndefined();
    expect(seen.some((u) => u.includes("virustotal"))).toBe(false);
    expect(seen.some((u) => u.includes("abuseipdb"))).toBe(false);
  });

  test("with a key bound, VirusTotal is called and its verdict is read", async () => {
    const seen: string[] = [];
    const e = await enrichIp("185.220.101.34", "SSH brute force attack", {
      fetch: fakeFetch(
        {
          "https://internetdb.shodan.io/": { status: 200, body: shodanTorExit },
          "https://www.virustotal.com/": {
            status: 200,
            body: {
              data: {
                attributes: {
                  reputation: -37,
                  last_analysis_stats: { malicious: 9, suspicious: 1, harmless: 60, undetected: 24 },
                  country: "DE",
                  as_owner: "Zwiebelfreunde e.V.",
                },
              },
            },
          },
        },
        seen
      ),
      keys: { virustotal: "vt-key" },
    });

    expect(seen.some((u) => u.includes("virustotal.com/api/v3/ip_addresses/185.220.101.34"))).toBe(true);
    expect(e.virustotal.status).toBe("ok");
    expect(e.virustotal.data?.reputation).toBe(-37);
    expect(e.virustotal.data?.last_analysis_stats?.malicious).toBe(9);
    expect(e.abuseipdb.status).toBe("disabled"); // still no key for this one
  });

  test("an IP Shodan has never scanned is a miss, not a zero", async () => {
    const e = await enrichIp("192.0.2.1", "Port scan detected", {
      fetch: fakeFetch({ "https://internetdb.shodan.io/": { status: 404, body: { detail: "No information available" } } }),
      keys: {},
    });

    expect(e.shodan_internetdb.status).toBe("failed");
    expect(e.shodan_internetdb.data).toBeUndefined();
    expect(e.shodan_internetdb.reason).toContain("no data");
    // MITRE still answered, because it needs neither a key nor a network.
    expect(e.mitre_attack.data?.technique_id).toBe("T1046");
  });

  test("a source that throws does not take the others down", async () => {
    const e = await enrichIp("185.220.101.34", "SSH brute force attack", {
      fetch: async () => {
        throw new Error("upstream unreachable");
      },
      keys: {},
    });

    expect(e.shodan_internetdb.status).toBe("failed");
    expect(e.shodan_internetdb.reason).toContain("upstream unreachable");
    expect(e.mitre_attack.status).toBe("ok");
    expect(e.mitre_attack.data?.technique_id).toBe("T1110");
  });

  test("an alert with no source IP skips the IP lookups and says why", async () => {
    const seen: string[] = [];
    const e = await enrichIp(null, "Disk full", { fetch: fakeFetch({}, seen), keys: { virustotal: "k", abuseipdb: "k" } });

    expect(seen).toHaveLength(0);
    expect(e.shodan_internetdb.status).toBe("skipped");
    expect(e.virustotal.status).toBe("skipped");
    expect(e.abuseipdb.status).toBe("skipped");
    expect(e.mitre_attack.status).toBe("ok"); // the technique map reads the description, not the IP
  });

  test("every source carries a latency, because the parallel fan-out is the claim", async () => {
    const e = await enrichIp("185.220.101.34", "SSH brute force attack", {
      fetch: fakeFetch({ "https://internetdb.shodan.io/": { status: 200, body: shodanTorExit } }),
      keys: {},
    });

    expect(e.shodan_internetdb.latency_ms).toBeGreaterThanOrEqual(0);
    expect(e.mitre_attack.latency_ms).toBeGreaterThanOrEqual(0);
  });
});
