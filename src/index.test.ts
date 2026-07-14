import { describe, expect, test } from "bun:test";
import app from "./index";

// /triage is public. That is safe while the only enrichers it can reach are keyless,
// and it stops being safe the instant a paid key is bound to the deployment: without
// a gate, any caller could post any IP and spend that quota through this Worker.
// These tests are the gate. They are here so the abuse surface cannot come back by
// someone simply passing c.env straight into the pipeline again.

const ALERT = {
  rule: { id: "5710", level: 10, description: "SSH brute force attack" },
  agent: { name: "webserver-01", ip: "10.0.1.50" },
  data: { srcip: "185.220.101.34", dstip: "10.0.1.50", dstport: "22" },
};

// Nothing here reaches the network: Shodan is stubbed, and the point of every test
// below is which requests are NOT made.
function stubFetch(seen: string[]) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    seen.push(url);
    return new Response(JSON.stringify({ ip: "185.220.101.34", hostnames: [], ports: [], vulns: [], cpes: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

function post(env: Record<string, string>, headers: Record<string, string> = {}) {
  return app.request(
    "/triage",
    { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(ALERT) },
    env
  );
}

describe("the keyed enrichers are not reachable from the public route", () => {
  test("a visitor gets them disabled even when both keys are bound", async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = stubFetch(seen) as typeof fetch;

    try {
      const response = await post({ VIRUSTOTAL_API_KEY: "vt", ABUSEIPDB_API_KEY: "ab", ENRICH_TOKEN: "operator" });
      const body = (await response.json()) as { enrichment: Record<string, { status: string }> };

      expect(body.enrichment.virustotal!.status).toBe("disabled");
      expect(body.enrichment.abuseipdb!.status).toBe("disabled");
      expect(seen.some((u) => u.includes("virustotal"))).toBe(false);
      expect(seen.some((u) => u.includes("abuseipdb"))).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });

  test("a wrong token does not open them either", async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = stubFetch(seen) as typeof fetch;

    try {
      const response = await post(
        { VIRUSTOTAL_API_KEY: "vt", ABUSEIPDB_API_KEY: "ab", ENRICH_TOKEN: "operator" },
        { "x-enrich-token": "guess" }
      );
      const body = (await response.json()) as { enrichment: Record<string, { status: string }> };

      expect(body.enrichment.virustotal!.status).toBe("disabled");
      expect(seen.some((u) => u.includes("virustotal"))).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });

  // An unset ENRICH_TOKEN must fail closed. If an empty expected token compared equal
  // to an absent header, every visitor would be an operator.
  test("an unset token fails closed rather than open", async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = stubFetch(seen) as typeof fetch;

    try {
      const response = await post({ VIRUSTOTAL_API_KEY: "vt", ABUSEIPDB_API_KEY: "ab" });
      const body = (await response.json()) as { enrichment: Record<string, { status: string }> };

      expect(body.enrichment.virustotal!.status).toBe("disabled");
      expect(seen.some((u) => u.includes("virustotal"))).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });

  test("the operator token opens them", async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = stubFetch(seen) as typeof fetch;

    try {
      await post(
        { VIRUSTOTAL_API_KEY: "vt", ABUSEIPDB_API_KEY: "ab", ENRICH_TOKEN: "operator" },
        { "x-enrich-token": "operator" }
      );

      expect(seen.some((u) => u.includes("virustotal.com/api/v3/ip_addresses/185.220.101.34"))).toBe(true);
      expect(seen.some((u) => u.includes("abuseipdb.com/api/v2/check"))).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("/health reports what the caller gets", () => {
  test("a bound but gated key reads as operator only, never as live", async () => {
    const response = await app.request("/health", {}, { VIRUSTOTAL_API_KEY: "vt", ENRICH_TOKEN: "operator" });
    const body = (await response.json()) as { enrichers: Array<{ name: string; state: string }> };

    const vt = body.enrichers.find((e) => e.name === "virustotal");
    const abuse = body.enrichers.find((e) => e.name === "abuseipdb");
    const shodan = body.enrichers.find((e) => e.name === "shodan");

    expect(vt!.state).toBe("operator only");
    expect(abuse!.state).toBe("no key");
    expect(shodan!.state).toBe("live");
  });
});

describe("bad input", () => {
  test("a body that is not JSON is refused, not triaged", async () => {
    const response = await app.request("/triage", { method: "POST", body: "not json" }, {});
    expect(response.status).toBe(400);
  });
});
