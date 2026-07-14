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
}

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.html(renderConsole()));
app.get("/console", (c) => c.html(renderConsole()));

// Which enrichers this particular deployment can actually run. The console reads
// this rather than assuming four, so a demo with no keys says so in the header
// instead of quietly reporting two sources as if they were all of them.
app.get("/health", (c) => {
  const hasVt = Boolean(c.env.VIRUSTOTAL_API_KEY);
  const hasAbuse = Boolean(c.env.ABUSEIPDB_API_KEY);

  return c.json({
    enrichers: [
      { name: "shodan", state: "live", auth: "none" },
      { name: "mitre", state: "live", auth: "none" },
      { name: "virustotal", state: hasVt ? "live" : "no key", auth: "api key" },
      { name: "abuseipdb", state: hasAbuse ? "live" : "no key", auth: "api key" },
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

  const result = await triage(body, {
    keys: { virustotal: c.env.VIRUSTOTAL_API_KEY, abuseipdb: c.env.ABUSEIPDB_API_KEY },
  });

  return c.json(result);
});

app.onError((error, c) => c.json({ error: error.message }, 500));

export default app;
