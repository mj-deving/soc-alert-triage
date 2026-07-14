import { Hono } from "hono";
import { renderConsole } from "./console/page";
import { EXAMPLES } from "./triage/examples";
import { MITRE_MAPPING_COUNT } from "./triage/mitre";
import { triage } from "./triage/pipeline";

// The Worker that puts the workflow's triage logic behind a console. The logic in
// src/triage/ is the same pipeline the n8n workflow runs in its code nodes, ported
// to TypeScript and tested; this file is only the transport.
//
// The keys live in the environment and are read here. They are never sent to the
// browser, and there is no route that echoes one back.

export interface Env {
  VIRUSTOTAL_API_KEY?: string;
  ABUSEIPDB_API_KEY?: string;
  ENRICH_TOKEN?: string;
}

const app = new Hono<{ Bindings: Env }>();

// /triage is public and unauthenticated, which is fine while the only enrichers it
// can run are keyless. It stops being fine the moment a VirusTotal or AbuseIPDB key
// is bound: any caller could then post any IP and spend that quota, and the Worker
// would be a free proxy for a paid service. The key never leaks, and the bill still
// arrives.
//
// So a bound key is not enough to use it. The caller also has to present ENRICH_TOKEN,
// which an operator has and a visitor does not. A public visitor gets the two keyless
// sources and an honest `disabled` for the other two, which is the demo either way.
function keysFor(c: { env: Env; req: { header(name: string): string | undefined } }) {
  const expected = c.env.ENRICH_TOKEN;
  const presented = c.req.header("x-enrich-token");
  const authorized = Boolean(expected) && presented === expected;

  if (!authorized) return {};
  return { virustotal: c.env.VIRUSTOTAL_API_KEY, abuseipdb: c.env.ABUSEIPDB_API_KEY };
}

app.get("/", (c) => c.html(renderConsole()));
app.get("/console", (c) => c.html(renderConsole()));

// Which enrichers this particular deployment can actually run. The console reads
// this rather than assuming four, so a demo with no keys says so in the header
// instead of quietly reporting two sources as if they were all of them.
app.get("/health", (c) => {
  // Reports what the caller in front of it actually gets, not what the deployment
  // holds. A key that is bound but reserved for an operator token is not "live" to
  // a visitor, and saying so would be the one lie this console cannot afford.
  const keys = keysFor(c);

  const keyed = (name: string, bound: boolean, usable: boolean) => ({
    name,
    state: usable ? "live" : bound ? "operator only" : "no key",
    auth: "api key",
  });

  return c.json({
    enrichers: [
      { name: "shodan", state: "live", auth: "none" },
      { name: "mitre", state: "live", auth: "none" },
      keyed("virustotal", Boolean(c.env.VIRUSTOTAL_API_KEY), Boolean(keys.virustotal)),
      keyed("abuseipdb", Boolean(c.env.ABUSEIPDB_API_KEY), Boolean(keys.abuseipdb)),
    ],
    keyless_sources: 2,
    mitre_mappings: MITRE_MAPPING_COUNT,
    model_in_the_loop: false,
  });
});

app.get("/examples", (c) => c.json(EXAMPLES));

app.post("/triage", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "the request body is not JSON" }, 400);
  }

  if (!body || typeof body !== "object") {
    return c.json({ error: "an alert has to be a JSON object" }, 400);
  }

  const result = await triage(body, { keys: keysFor(c) });

  return c.json(result);
});

app.onError((error, c) => c.json({ error: error.message }, 500));

export default app;
