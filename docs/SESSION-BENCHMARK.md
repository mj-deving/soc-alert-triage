---
summary: Benchmark session — measure token savings of SOC Alert Triage vs traditional sequential approach
read_when: benchmarking, measuring token savings, proving code-mode value
---

# SOC Alert Triage — Benchmark Session

> Measure the actual token savings of parallel enrichment vs. traditional sequential tool calls.

---

## Goal

Produce a reproducible benchmark comparing:
- **Traditional approach:** AI agent makes 4+ sequential tool calls (VirusTotal → AbuseIPDB → Shodan → MITRE) — each call adds to LLM context
- **Code-mode approach:** toolCode fires all 4 enrichment APIs in parallel via Promise.allSettled — 1 LLM call total

## Current Architecture

The triage workflow has **9 nodes** (Webhook → Normalize → AI Agent with Haiku + toolCode → Score → Switch → 4 severity routes). The toolCode enrichment tool:
1. Fires VirusTotal + AbuseIPDB + Shodan InternetDB + MITRE ATT&CK lookups in parallel
2. Merges results
3. Returns structured enrichment data

All enrichment happens in **1 tool invocation** — the agent calls `enrich_ip` once.

## Benchmark Methodology

### Step 1: Design the Traditional Approach

What a traditional n8n workflow would look like with separate tool nodes:

```
Webhook → Normalize → AI Agent
  → Tool: VirusTotal Lookup       (LLM call 1: decide to call VT)
  → Tool: AbuseIPDB Check         (LLM call 2: decide to call AbuseIPDB)  
  → Tool: Shodan Lookup            (LLM call 3: decide to call Shodan)
  → Tool: MITRE ATT&CK Map        (LLM call 4: decide to call MITRE)
  → Tool: Compute Severity Score   (LLM call 5: compute score from all results)
  → Tool: Check Dedup              (LLM call 6: check if IP seen before)
  → Tool: Format Alert             (LLM call 7: format notification)
→ Switch → Notify
```

That's **7+ LLM tool calls** per alert, each replaying the full accumulated context (enrichment JSON is large — VirusTotal responses can be 5KB+).

Count:
- n8n nodes: Agent + 7 tool sub-nodes + trigger + normalize + switch + notifiers = ~15 nodes
- LLM calls: 7+ per alert (each tool = 1 round-trip)
- Token estimate per call: grows from ~500 to ~3,000+ as enrichment data accumulates

### Step 2: Measure the Code-Mode Approach

Send a test alert with a known malicious IP:

```bash
curl -X POST http://172.31.224.1:5678/webhook/soc-alert-triage \
  -H "Content-Type: application/json" \
  -d '{
    "rule": {"id": "5710", "level": 10, "description": "SSH brute force attack"},
    "agent": {"name": "benchmark-host", "ip": "10.0.1.50"},
    "data": {"srcip": "185.220.101.34", "dstip": "10.0.1.50", "dstport": "22"},
    "timestamp": "2026-04-16T10:30:00Z"
  }'
```

IP `185.220.101.34` is a known Tor exit node — should hit on all enrichment sources.

Then inspect:
```bash
npx --yes n8nac execution list --workflow-id <triage-workflow-id> --limit 1 --json
npx --yes n8nac execution get <execution-id> --include-data --json
```

Extract:
- Nodes that fired
- LLM calls (AI Agent messages array)
- Token counts (if in metadata)
- Execution time
- Enrichment API response times (from toolCode timing if logged)

### Step 3: Measure with a Clean IP Too

```bash
curl -X POST http://172.31.224.1:5678/webhook/soc-alert-triage \
  -H "Content-Type: application/json" \
  -d '{
    "alert_type": "port_scan",
    "source_ip": "8.8.8.8",
    "dest_ip": "10.0.1.50",
    "description": "Port scan detected",
    "severity": "low",
    "timestamp": "2026-04-16T11:00:00Z"
  }'
```

This tests the low-severity path and gives a comparison data point.

### Step 4: Calculate Savings

| Metric | Traditional (estimated) | Code-Mode (measured) | Savings |
|---|---|---|---|
| n8n nodes | ~15 | 9 | ?% |
| LLM calls per alert | ~7 | 1 | ?% |
| Tokens per alert | ~12,000+ (O(n^2) growth) | ? | ?% |
| Enrichment latency | ~8s (sequential) | ? (parallel) | ?% |
| Execution time | N/A | ? | N/A |

### Step 5: Cost Projection

Calculate at scale:
- 500 alerts/day × 365 days = 182,500 alerts/year
- Traditional: 182,500 × 7 calls × ~2,000 avg tokens = ~2.5B tokens/year
- Code-mode: 182,500 × 1 call × ~800 tokens = ~146M tokens/year
- At Haiku pricing ($0.80/1M input): Traditional ~$2,000/year vs Code-mode ~$117/year

### Step 6: Document

Write results to `benchmark.md` in the project root. Include:
- Test date, n8n version, LLM model, enrichment APIs used
- Malicious IP test results (with enrichment data sizes)
- Clean IP test results
- Traditional vs code-mode comparison table
- Cost projection at 500 alerts/day
- Methodology notes

## n8n Instance

Read `CLAUDE.md` for host, credentials, and sandbox rules.

## Success Criteria

- [ ] Traditional approach designed with node count and estimated LLM calls
- [ ] Malicious IP benchmark executed and measured
- [ ] Clean IP benchmark executed and measured
- [ ] Token counts extracted or estimated
- [ ] Parallel vs sequential latency compared
- [ ] Cost projection at 500 alerts/day
- [ ] Results written to `benchmark.md`

## Start

```bash
cd ~/projects/soc-alert-triage
npx --yes n8nac list  # find triage workflow ID
```

Read CLAUDE.md, then execute the benchmark.
