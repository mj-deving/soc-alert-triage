import { mapToMitre } from "./mitre";
import type { AbuseIpdbData, Enrichment, ShodanData, SourceResult, VirusTotalData } from "./types";

// Port of the `enrich_ip` toolCode node. Four lookups, fired together, settled
// independently. This is the part of the workflow the README calls code-mode: the
// fan-out is a Promise.all in one execution rather than four LLM round trips, and
// a fifth source would cost the latency of the slowest one, not another round trip.
//
// Two differences from the n8n tool, both deliberate:
//
// 1. A source with no key is not called. The n8n tool sends VirusTotal a request
//    with `'x-apikey': ''` and lets it 401, which works but reports "request failed"
//    for what is really "you never configured this". Here a missing key is `disabled`
//    with the reason attached, and no request leaves the Worker.
// 2. Keys are read from the Worker environment, never from the request. A public
//    demo that took an API key from the browser would be a key-harvesting form.

/** Only the call signature, not the whole platform `fetch` object: a test double
 *  is a function, and it should not have to implement `preconnect` to be one. */
export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface EnrichOptions {
  fetch?: Fetcher;
  keys?: { virustotal?: string; abuseipdb?: string };
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;

async function timed<T>(source: string, run: () => Promise<SourceResult<T>>): Promise<SourceResult<T>> {
  const started = Date.now();
  try {
    const result = await run();
    return { ...result, latency_ms: Date.now() - started };
  } catch (error) {
    // Reached only if a source throws outside its own catch. The others still settle.
    return { source, status: "failed", latency_ms: Date.now() - started, reason: String(error instanceof Error ? error.message : error) };
  }
}

export async function enrichIp(ip: string | null, alertType: string, options: EnrichOptions = {}): Promise<Enrichment> {
  const doFetch = options.fetch ?? fetch;
  const keys = options.keys ?? {};
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function get(url: string, init: RequestInit = {}): Promise<Response> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      return await doFetch(url, { ...init, signal: abort.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  // 1. Shodan InternetDB. No key, no rate limit published, and a 404 means Shodan
  //    has never scanned this address, which is a fact about the IP and not a failure
  //    of the lookup. It is reported as a miss and it scores nothing.
  const shodan = timed<ShodanData>("shodan_internetdb", async () => {
    if (!ip) return { source: "shodan_internetdb", status: "skipped", reason: "the alert names no source IP" };

    const response = await get(`https://internetdb.shodan.io/${encodeURIComponent(ip)}`, {
      headers: { accept: "application/json" },
    });

    if (response.status === 404) {
      return { source: "shodan_internetdb", status: "failed", reason: "no data: Shodan has not scanned this address" };
    }
    if (!response.ok) {
      return { source: "shodan_internetdb", status: "failed", reason: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as ShodanData;
    return { source: "shodan_internetdb", status: "ok", data };
  }).catch((error: unknown) => ({
    source: "shodan_internetdb",
    status: "failed" as const,
    reason: String(error instanceof Error ? error.message : error),
  }));

  // 2. MITRE ATT&CK. The table is in the code, so this one neither fails nor needs
  //    an IP: it reads the alert description.
  const mitre = timed("mitre_attack", async () => ({
    source: "mitre_attack",
    status: "ok" as const,
    data: mapToMitre(alertType),
  }));

  // 3. VirusTotal v3. Key or nothing.
  const virustotal = timed<VirusTotalData>("virustotal", async () => {
    if (!keys.virustotal) {
      return { source: "virustotal", status: "disabled", reason: "no API key bound to this deployment" };
    }
    if (!ip) return { source: "virustotal", status: "skipped", reason: "the alert names no source IP" };

    const response = await get(`https://www.virustotal.com/api/v3/ip_addresses/${encodeURIComponent(ip)}`, {
      headers: { "x-apikey": keys.virustotal, accept: "application/json" },
    });
    if (!response.ok) return { source: "virustotal", status: "failed", reason: `HTTP ${response.status}` };

    const body = (await response.json()) as { data?: { attributes?: Record<string, unknown> } };
    const attributes = body.data?.attributes ?? {};
    return {
      source: "virustotal",
      status: "ok",
      data: {
        reputation: (attributes.reputation as number) ?? null,
        last_analysis_stats: (attributes.last_analysis_stats as VirusTotalData["last_analysis_stats"]) ?? null,
        country: (attributes.country as string) ?? null,
        as_owner: (attributes.as_owner as string) ?? null,
      },
    };
  });

  // 4. AbuseIPDB v2. Key or nothing.
  const abuseipdb = timed<AbuseIpdbData>("abuseipdb", async () => {
    if (!keys.abuseipdb) {
      return { source: "abuseipdb", status: "disabled", reason: "no API key bound to this deployment" };
    }
    if (!ip) return { source: "abuseipdb", status: "skipped", reason: "the alert names no source IP" };

    const url = new URL("https://api.abuseipdb.com/api/v2/check");
    url.searchParams.set("ipAddress", ip);
    url.searchParams.set("maxAgeInDays", "90");

    const response = await get(url.toString(), { headers: { Key: keys.abuseipdb, Accept: "application/json" } });
    if (!response.ok) return { source: "abuseipdb", status: "failed", reason: `HTTP ${response.status}` };

    const body = (await response.json()) as { data?: Record<string, unknown> };
    const data = body.data ?? {};
    return {
      source: "abuseipdb",
      status: "ok",
      data: {
        abuse_confidence_score: (data.abuseConfidenceScore as number) ?? null,
        total_reports: (data.totalReports as number) ?? null,
        is_tor: (data.isTor as boolean) ?? null,
        isp: (data.isp as string) ?? null,
        country_code: (data.countryCode as string) ?? null,
      },
    };
  });

  const [shodanResult, mitreResult, virustotalResult, abuseipdbResult] = await Promise.all([
    shodan,
    mitre,
    virustotal,
    abuseipdb,
  ]);

  return {
    shodan_internetdb: shodanResult as SourceResult<ShodanData>,
    mitre_attack: mitreResult,
    virustotal: virustotalResult,
    abuseipdb: abuseipdbResult,
  };
}
