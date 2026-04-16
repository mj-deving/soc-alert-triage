# SOC Alert Triage

AI-powered Security Operations Center alert triage with parallel threat intelligence enrichment.

Ingests alerts from SIEM (Wazuh, Elastic, Splunk), enriches with threat intel (VirusTotal, AbuseIPDB, Shodan, MITRE ATT&CK mapping), scores severity, deduplicates into incidents, and routes to response actions — all built as a single n8n workflow using code-mode parallel execution.

## Architecture

```
POST /webhook/soc-alert-triage
  │
  ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────────────────────────┐
│  Webhook    │───▶│  Normalize   │───▶│  AI Agent (Haiku)               │
│  (POST)     │    │  (Code)      │    │  + Enrich IP Tool (toolCode)    │
└─────────────┘    └──────────────┘    │    Promise.allSettled:           │
                                       │    ├─ Shodan InternetDB          │
                                       │    ├─ MITRE ATT&CK mapping      │
                                       │    ├─ VirusTotal v3              │
                                       │    └─ AbuseIPDB v2              │
                                       └──────────────┬──────────────────┘
                                                      │
                                                      ▼
                                       ┌──────────────────────────────────┐
                                       │  Score & Dedup (Code)            │
                                       │  Weighted severity scoring       │
                                       │  IP deduplication (1hr window)   │
                                       └──────────────┬──────────────────┘
                                                      │
                                                      ▼
                                       ┌──────────────────────────────────┐
                                       │  Severity Router (Switch)        │
                                       │  ├─ [0] Critical ──▶ Telegram   │
                                       │  ├─ [1] High ──────▶ Telegram   │
                                       │  ├─ [2] Medium (log only)       │
                                       │  └─ [3] Low (dismiss)           │
                                       └──────────────────────────────────┘
```

**9 nodes** | **Workflow ID:** `Y8yy3136pozbsFeG`

## Why Code-Mode

Traditional n8n AI agents make 8-15 sequential tool calls per alert (one per API). This workflow fires all enrichment calls **in parallel** inside a single `Promise.allSettled` execution in the V8 sandbox:

- **95%+ token savings** — one tool call instead of 8-15
- **3-5x faster** — parallel HTTP vs sequential LLM round-trips
- **500 alerts/day** at scale without hitting LLM rate limits

## Setup

```bash
# 1. Clone
git clone https://github.com/mj-deving/soc-alert-triage.git
cd soc-alert-triage
npm install

# 2. Connect to n8n
export N8N_API_KEY="<your n8n API key>"
npm run setup:n8n -- http://<your-n8n-host>:5678

# 3. Push workflow
npx --yes n8nac push "workflows/172_31_224_1:5678_marius _j/personal/soc-alert-triage.workflow.ts"

# 4. Activate
npx --yes n8nac workflow activate Y8yy3136pozbsFeG
```

## Credentials Required

| Credential | Type | Node | Required |
|---|---|---|---|
| OpenRouter | openAiApi | Haiku Model | Yes — LLM for triage reasoning |
| Telegram Bot | telegramApi | Alert Critical/High | Yes — for notifications |
| VirusTotal | header (x-apikey) | Enrich IP Tool | Optional — degrades gracefully |
| AbuseIPDB | header (Key) | Enrich IP Tool | Optional — degrades gracefully |

### Configuring Telegram Chat ID

Set the chat ID in the workflow's global static data. In n8n UI, open any Code node and run:

```javascript
const staticData = $getWorkflowStaticData('global');
staticData.telegram_chat_id = 'YOUR_CHAT_ID';
return [{ json: { set: true } }];
```

Or ask `@get_id_bot` on Telegram to find your chat ID.

## Enrichment Sources

| Source | API | Free Tier | Data Returned |
|---|---|---|---|
| Shodan InternetDB | `internetdb.shodan.io/{ip}` | Unlimited | Ports, hostnames, vulns, CPEs |
| MITRE ATT&CK | Embedded mapping | Unlimited | Technique ID, name, tactic |
| VirusTotal v3 | `virustotal.com/api/v3` | 500 req/day | Reputation, analysis stats, country |
| AbuseIPDB v2 | `api.abuseipdb.com/api/v2` | 1,000 req/day | Abuse score, reports, is_tor, ISP |

## Scoring Algorithm

Weighted formula with dynamic redistribution when sources are unavailable:

| Factor | Weight | Score Range | Calculation |
|---|---|---|---|
| VirusTotal | 0.3 | 0-100 | max(malicious_ratio, reputation) |
| AbuseIPDB | 0.3 | 0-100 | abuse_confidence_score |
| Shodan | 0.2 | 0-100 | ports×10 + vulns×20 + tor_indicator×20 |
| Base severity | 0.2 | 25-100 | critical=100, high=75, medium=50, low=25 |
| MITRE boost | +15 flat | 0 or 15 | Applied when technique ID matched |

When VT/AbuseIPDB are unavailable, their weight redistributes proportionally to available sources.

### Severity Routing

| Score | Level | Action |
|---|---|---|
| >= 80 | Critical | Telegram alert (red badge) |
| 60-79 | High | Telegram alert (orange badge) |
| 40-59 | Medium | Log only |
| < 40 | Low | Dismiss |

## Test Payloads

### Wazuh Alert
```bash
curl -X POST http://<n8n-host>:5678/webhook/soc-alert-triage \
  -H "Content-Type: application/json" \
  -d '{
    "rule": {"id": "5710", "level": 10, "description": "SSH brute force attack"},
    "agent": {"name": "webserver-01", "ip": "10.0.1.50"},
    "data": {"srcip": "185.220.101.34", "dstip": "10.0.1.50", "dstport": "22"},
    "timestamp": "2026-04-16T10:30:00Z"
  }'
```

IP `185.220.101.34` is a known Tor exit node — Shodan returns `tor-exit-34.for-privacy.net`, MITRE maps to T1110 (Brute Force).

### Generic Alert
```bash
curl -X POST http://<n8n-host>:5678/webhook/soc-alert-triage \
  -H "Content-Type: application/json" \
  -d '{
    "alert_type": "brute_force",
    "source_ip": "185.220.101.34",
    "dest_ip": "10.0.1.50",
    "description": "Multiple failed SSH login attempts",
    "severity": "high",
    "timestamp": "2026-04-16T10:30:00Z"
  }'
```

## Supported Alert Formats

| Format | Detection | Key Fields |
|---|---|---|
| Wazuh | `rule` + `agent` + `data` | `data.srcip`, `data.dstip`, `rule.description`, `rule.level` |
| Elastic SIEM | `signal.rule` | `source.ip`, `destination.ip`, `signal.rule.name` |
| Generic | Fallback | `source_ip`, `dest_ip`, `alert_type`, `severity` |

## Deduplication

Tracks source IPs in a 1-hour rolling window via `$getWorkflowStaticData('global')`. Duplicate alerts are flagged (`is_duplicate: true`) but still processed through the full pipeline. The dedup count is included in Telegram notifications.

## License

MIT
