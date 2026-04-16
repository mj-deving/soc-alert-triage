---
summary: Session kickoff prompt for building SOC Alert Triage — copy-paste into a fresh Claude Code session
read_when: starting a new session on this project, kicking off the build
---

# SOC Alert Triage — Session Kickoff Prompt

> Copy everything below the line into a fresh Claude Code session at `~/projects/soc-alert-triage`

---

## What We're Building

An AI-powered **SOC (Security Operations Center) alert triage** system that:

1. **Ingests** security alerts via webhook (from SIEM: Wazuh, Elastic, Splunk)
2. **Enriches** each alert with parallel threat intel lookups (VirusTotal, AbuseIPDB, Shodan, MITRE ATT&CK)
3. **Scores** severity based on enrichment data + alert context
4. **Deduplicates** related alerts into incidents
5. **Routes** to appropriate response playbooks
6. **Notifies** via Slack/Telegram with structured incident summary

All enrichment happens in **one code-mode execution** using `Promise.all` — 8-15 API calls fire simultaneously in the V8 sandbox instead of sequential LLM tool calls.

## Why This Matters

- **95%+ token savings** — 8-15 tool calls per alert consolidated into one execution
- **SOC analyst burnout** is the #1 cybersecurity staffing problem — 30% of alerts go uninvestigated
- **500 alerts/day × 15 calls = 7,500 daily LLM calls** reduced to 500 with code-mode
- Enterprise security teams pay real money for alert triage automation

## Project State

- **Repo:** `~/projects/soc-alert-triage` (cloned from mj-deving/n8n-project-template)
- **GitHub:** github.com/mj-deving/soc-alert-triage
- **n8nac:** Needs initialization — run `npx --yes n8nac init-auth --host "$N8N_HOST" --api-key "$N8N_API_KEY"` then `npx --yes n8nac init-project --project-index 1 --sync-folder workflows`
- **CLAUDE.md:** Read it first — has n8n instance, credentials, sandbox rules, error classification, LLM gotchas

## Architecture

### Core Workflow: Alert Triage Pipeline

```
Webhook (SIEM alert) → Code Node (normalize) → AI Agent (Haiku) → Code-Mode Tool (enrich + score) → Switch (severity) → Actions
```

**Detailed flow:**

1. **Webhook Trigger** — receives raw SIEM alert JSON (Wazuh/Elastic/Splunk format)
2. **Normalizer** (Code Node) — extracts common fields: source IP, dest IP, alert type, timestamp, raw payload
3. **AI Agent** (Haiku via OpenRouter) — decides enrichment strategy based on alert type
4. **Code-Mode Tool** — the core: executes parallel enrichment in one sandbox call:
   ```typescript
   // Inside code-mode sandbox:
   const [vt, abuse, shodan, mitre] = await Promise.all([
     tools.virustotal_lookup({ ip: alert.srcIp }),
     tools.abuseipdb_check({ ip: alert.srcIp }),
     tools.shodan_host({ ip: alert.srcIp }),
     tools.mitre_attack_map({ technique: alert.techniqueId })
   ]);
   
   const score = computeSeverity(alert, vt, abuse, shodan, mitre);
   const incident = deduplicateOrCreate(alert, score);
   return { incident, score, enrichment: { vt, abuse, shodan, mitre } };
   ```
5. **Switch Node** — routes by severity: Critical → PagerDuty, High → Slack, Medium → Log, Low → Dismiss
6. **Notification** — Slack/Telegram with structured incident card

### Enrichment Sources (v0.1 — free tier APIs)

| Source | What It Provides | API | Free Tier |
|---|---|---|---|
| **VirusTotal** | IP/hash reputation, detection ratio | `this.helpers.httpRequest` to v3 API | 500 req/day |
| **AbuseIPDB** | Abuse confidence score, report count | `this.helpers.httpRequest` to v2 API | 1,000 req/day |
| **Shodan** | Open ports, services, vulns, ISP, geo | `this.helpers.httpRequest` to API | Limited (or InternetDB free) |
| **MITRE ATT&CK** | Technique → tactic mapping, description | Local JSON lookup (no API needed) | Unlimited |

### Alert Sources (v0.1 — start with one)

| Source | Format | Webhook Payload |
|---|---|---|
| **Wazuh** (recommended start) | JSON | `{rule.id, rule.description, agent.ip, data.srcip, data.dstip}` |
| Elastic SIEM | JSON | `{signal.rule.name, source.ip, destination.ip}` |
| Generic | JSON | `{alert_type, source_ip, dest_ip, description, severity}` |

## Supported n8n Nodes

Research these before building (use `npx --yes n8nac skills node-info <name>`):

- **Webhook** — alert ingestion trigger
- **Code Node** — normalization, severity scoring
- **AI Agent** (`@n8n/n8n-nodes-langchain.agent`) — triage reasoning
- **lmChatOpenAi** — Haiku via OpenRouter
- **HTTP Request** — threat intel API calls (in toolCode, use `this.helpers.httpRequest`)
- **Switch** — severity-based routing
- **Slack** / **Telegram** — notifications
- **Set** — data shaping between nodes

## Credentials, Instance, Constraints

**Read `CLAUDE.md` first** — it has n8n instance details, credential IDs, sandbox rules, error classification, and LLM cost control. Everything below assumes you've read it.

## n8nac Push Path

Always use full path for push in this project:
```bash
npx --yes n8nac push "workflows/172_31_224_1:5678_marius _j/personal/<filename>.workflow.ts"
```

## Phased Build Plan

### Phase 1: Alert Ingestion + Normalization (this session)
1. Init n8nac (if not already done)
2. Scaffold: `npm run new-workflow -- pipelines/01-alert-triage "SOC Alert Triage"`
3. Build webhook trigger that accepts generic alert JSON
4. Build normalizer Code node that extracts common fields
5. Push, verify, test with a sample Wazuh alert payload

### Phase 2: Enrichment Engine
6. Build threat intel tool functions (VirusTotal, AbuseIPDB, Shodan, MITRE)
7. All enrichment calls use `this.helpers.httpRequest()` (sandbox rule)
8. Wire into Code-Mode tool or toolCode with parallel execution
9. Test with a known malicious IP (e.g., from AbuseIPDB samples)

### Phase 3: Scoring + Deduplication
10. Severity scoring algorithm (weighted: VT score × 0.3 + AbuseIPDB × 0.3 + Shodan exposure × 0.2 + alert base severity × 0.2)
11. Deduplication via `$getWorkflowStaticData('global')` — track seen IPs/hashes in rolling window
12. Switch node routing by severity level

### Phase 4: Notification + Polish
13. Slack/Telegram notification with structured incident card
14. Error handling for API failures (graceful degradation — if VT is down, score without it)
15. Rate limiting awareness (respect free tier limits)
16. Documentation and README

## Test Payloads

### Sample Wazuh Alert
```json
{
  "rule": { "id": "5710", "level": 10, "description": "SSH brute force attack" },
  "agent": { "name": "webserver-01", "ip": "10.0.1.50" },
  "data": { "srcip": "185.220.101.34", "dstip": "10.0.1.50", "dstport": "22" },
  "timestamp": "2026-04-16T10:30:00Z"
}
```

### Sample Generic Alert
```json
{
  "alert_type": "brute_force",
  "source_ip": "185.220.101.34",
  "dest_ip": "10.0.1.50",
  "description": "Multiple failed SSH login attempts detected",
  "severity": "high",
  "timestamp": "2026-04-16T10:30:00Z"
}
```

IP `185.220.101.34` is a known Tor exit node — good for testing enrichment (will have VirusTotal/AbuseIPDB hits).

## Reference Material

- **Code-mode architecture:** `~/projects/code-mode/playbook/architecture.md`
- **Benchmarks:** `~/projects/code-mode/playbook/benchmarks.md`
- **n8n RAG/agent patterns:** `npx --yes n8nac skills search "AI agent tools"`
- **Community templates:** Template 6913 (multi-agent routing), Template 8578 (parallel async)
- **MITRE ATT&CK:** https://attack.mitre.org/techniques/enterprise/ (downloadable JSON)

## Success Criteria

Phase 1 is done when:
- [ ] Triage workflow exists on n8n and accepts webhook POST
- [ ] Normalizer correctly extracts source IP, dest IP, alert type from Wazuh format
- [ ] Webhook returns 200 and workflow executes successfully
- [ ] Test with sample Wazuh payload produces normalized output

Full project is done when:
- [ ] Alert → enrich (4 sources parallel) → score → route → notify works end-to-end
- [ ] Known malicious IP triggers high severity with enrichment data
- [ ] Clean IP triggers low severity
- [ ] Deduplication prevents duplicate incidents for same IP within rolling window
- [ ] Notification includes structured incident card with enrichment summary

## Start Command

```bash
cd ~/projects/soc-alert-triage
npx --yes n8nac init-auth --host "$N8N_HOST" --api-key "$N8N_API_KEY"
npx --yes n8nac init-project --project-index 1 --sync-folder workflows
npm run new-workflow -- pipelines/01-alert-triage "SOC Alert Triage"
```

CLAUDE.md is auto-read at session start. Then read AGENTS.md and start building Phase 1.
