# SOC Alert Triage — Benchmark Results

> Parallel code-mode enrichment vs. traditional sequential tool calls

**Test Date:** 2026-04-16
**n8n Version:** Windows host (172.31.224.1:5678)
**LLM Model:** `anthropic/claude-haiku-4-5` via OpenRouter
**Enrichment APIs:** Shodan InternetDB (live), MITRE ATT&CK (embedded), VirusTotal (no API key), AbuseIPDB (no API key)

---

## Architecture Comparison

### Code-Mode Approach (Measured)

```
Webhook → Normalize → AI Agent (1 toolCode call) → Score & Dedup → Switch → Notify
                         ↓
              enrich_ip toolCode fires:
              ├─ Shodan InternetDB  ─┐
              ├─ MITRE ATT&CK map   ├─ Promise.allSettled (~250ms)
              ├─ VirusTotal         ─┤
              └─ AbuseIPDB          ─┘
```

- **n8n nodes:** 9
- **LLM calls per alert:** 2 (tool decision + analysis)
- **Enrichment:** 4 APIs fire in parallel, 1 tool invocation

### Traditional Approach (Modeled)

```
Webhook → Normalize → AI Agent
  → Tool: VirusTotal Lookup        (LLM call 1)
  → Tool: AbuseIPDB Check          (LLM call 2)
  → Tool: Shodan Lookup            (LLM call 3)
  → Tool: MITRE ATT&CK Map        (LLM call 4)
  → Tool: Compute Severity Score   (LLM call 5)
  → Tool: Check Dedup              (LLM call 6)
  → Tool: Format Alert             (LLM call 7)
→ Switch → Notify
```

- **n8n nodes:** ~15 (agent + 7 tool sub-nodes + trigger + normalize + switch + notifiers)
- **LLM calls per alert:** 7+ (each tool = 1 round-trip with full context replay)
- **Enrichment:** 4 APIs fire sequentially, 7 tool invocations

---

## Test Results

### Test 1: Malicious IP — 185.220.101.34 (Known Tor Exit Node)

**Execution ID:** 1970 | **Input:** Wazuh format, SSH brute force attack (rule level 10)

| Node | Time (ms) | Status |
|------|-----------|--------|
| Alert Webhook | 1 | success |
| Normalize Alert | 8 | success |
| Haiku Model (call 1 — tool decision) | 1,753 | success |
| Enrich IP Tool (4 APIs parallel) | 249 | success |
| Haiku Model (call 2 — analysis) | 5,415 | success |
| Triage Agent (total) | 5,433 | success |
| Score and Dedup | 16 | success |
| Severity Router | 1 | success |

**Token Usage:**

| LLM Call | Prompt | Completion | Total |
|----------|--------|------------|-------|
| Call 1 (tool decision) | 251 | 15 | 266 |
| Call 2 (analyze + respond) | 575 | 623 | 1,198 |
| **Total** | **826** | **638** | **1,464** |

**Enrichment Results:**

| Source | Status | Key Findings |
|--------|--------|-------------|
| Shodan InternetDB | Hit | `tor-exit-34.for-privacy.net`, ports 80, 10134 |
| MITRE ATT&CK | Hit | T1110 Brute Force (Credential Access) |
| VirusTotal | Skipped | API key not configured |
| AbuseIPDB | Skipped | API key not configured |

**Scoring:** 73/100 (HIGH) — Shodan=40, Base=75, MITRE boost=+15

### Test 2: Clean IP — 8.8.8.8 (Google DNS)

**Execution ID:** 1952 | **Input:** Wazuh format, DNS query to external resolver (rule level 3)

| Node | Time (ms) | Status |
|------|-----------|--------|
| Alert Webhook | 0 | success |
| Normalize Alert | 11 | success |
| Haiku Model (call 1 — tool decision) | 1,856 | success |
| Enrich IP Tool (4 APIs parallel) | 246 | success |
| Haiku Model (call 2 — analysis) | 4,636 | success |
| Triage Agent (total) | 4,654 | success |
| Score and Dedup | 16 | success |
| Severity Router | 0 | success |

**Token Usage:**

| LLM Call | Prompt | Completion | Total |
|----------|--------|------------|-------|
| Call 1 (tool decision) | 252 | 16 | 268 |
| Call 2 (analyze + respond) | 562 | 484 | 1,046 |
| **Total** | **814** | **500** | **1,314** |

**Enrichment Results:**

| Source | Status | Key Findings |
|--------|--------|-------------|
| Shodan InternetDB | Hit | `dns.google`, ports 53, 443 |
| MITRE ATT&CK | No match | "DNS query" doesn't map to known technique |
| VirusTotal | Skipped | API key not configured |
| AbuseIPDB | Skipped | API key not configured |

**Scoring:** 23/100 (LOW) — Shodan=20, Base=25, no MITRE boost

### Test 3: Clean IP — Earlier Execution (Validation Run)

**Execution ID:** 1924 | **Duration:** ~9.2s

| LLM Call | Prompt | Completion | Total |
|----------|--------|------------|-------|
| Call 1 | 251 | 15 | 266 |
| Call 2 | 572 | 652 | 1,224 |
| **Total** | **823** | **667** | **1,490** |

Enrichment latency: 240ms

---

## Comparison Table

### Token Usage per Alert

| Metric | Traditional (modeled) | Code-Mode (measured avg) | Savings |
|--------|----------------------|--------------------------|---------|
| LLM calls per alert | 7 | 2 | **71%** fewer |
| Prompt tokens per alert | ~9,670 | 821 | **92%** fewer |
| Completion tokens per alert | ~610 | 602 | ~1% fewer |
| **Total tokens per alert** | **~10,280** | **1,423** | **86%** fewer |

**Why traditional uses ~10x more prompt tokens:** Each sequential tool call replays the full conversation history. After receiving VirusTotal's ~500-token JSON response, every subsequent LLM call includes that data in its prompt. By call 7, the prompt contains the system message + original alert + 6 prior tool results + 6 prior decisions. This is O(n^2) token growth.

Code-mode avoids this entirely — the enrichment happens in JavaScript (zero LLM tokens), and the LLM sees the combined result exactly once.

### Traditional Token Growth Model (7 sequential tool calls)

| Call # | Tool | Prompt Tokens | Why |
|--------|------|---------------|-----|
| 1 | VirusTotal | 250 | System + alert + tool decision |
| 2 | AbuseIPDB | 1,015 | + VT result (~500 tokens JSON) |
| 3 | Shodan | 1,330 | + AbuseIPDB result (~300 tokens) |
| 4 | MITRE ATT&CK | 1,545 | + Shodan result (~200 tokens) |
| 5 | Compute Score | 1,660 | + MITRE result (~100 tokens) |
| 6 | Check Dedup | 1,860 | + scoring output (~200 tokens) |
| 7 | Format Alert | 2,010 | + dedup result (~150 tokens) |
| **Total** | | **9,670** | O(n^2) context accumulation |

### Latency

| Metric | Traditional (modeled) | Code-Mode (measured) | Savings |
|--------|----------------------|----------------------|---------|
| Enrichment API time | ~1,250ms (sequential) | ~248ms (parallel) | **5x faster** |
| LLM processing | ~21s (7 × ~3s avg) | ~7s (2 × ~3.5s avg) | **3x faster** |
| **Total execution** | **~23s** | **~7s** | **3.3x faster** |
| n8n nodes | ~15 | 9 | **40% fewer** |

---

## Cost Projection at Scale

**Assumptions:** 500 alerts/day, 365 days/year = 182,500 alerts/year
**Model:** Claude Haiku 4.5 via OpenRouter
**Pricing:** $0.80/1M input tokens, $4.00/1M output tokens

### Traditional Approach

| Component | Calculation | Annual Cost |
|-----------|-------------|-------------|
| Input tokens | 182,500 alerts × 9,670 tokens × $0.80/1M | $1,412 |
| Output tokens | 182,500 alerts × 610 tokens × $4.00/1M | $445 |
| **Total** | | **$1,857/year** |

### Code-Mode Approach

| Component | Calculation | Annual Cost |
|-----------|-------------|-------------|
| Input tokens | 182,500 alerts × 821 tokens × $0.80/1M | $120 |
| Output tokens | 182,500 alerts × 602 tokens × $4.00/1M | $440 |
| **Total** | | **$560/year** |

### Savings

| Metric | Traditional | Code-Mode | Delta |
|--------|-------------|-----------|-------|
| Annual LLM cost | $1,857 | $560 | **$1,297/year saved (70%)** |
| Annual tokens | 1.88B | 260M | **1.62B tokens/year saved** |
| LLM calls/year | 1,277,500 | 365,000 | **912,500 fewer API calls** |

**Note:** With VT and AbuseIPDB API keys configured, code-mode enrichment data would be larger (increasing Call 2 prompt by ~500 tokens) but the traditional approach would grow even more (each API result compounds across all subsequent calls). The savings ratio would increase to approximately **88-90%** with full API data.

---

## Methodology Notes

1. **Code-mode measurements** are from real n8n execution data (execution IDs 1924, 1952, 1970) with actual API calls to Shodan InternetDB and embedded MITRE ATT&CK mapping.

2. **Traditional approach estimates** are analytically modeled based on n8n's agent architecture where each tool call triggers a full LLM round-trip with conversation history replay. The O(n^2) token growth is inherent to the ReAct agent pattern used by n8n's `@n8n/n8n-nodes-langchain.agent` node.

3. **VT and AbuseIPDB** returned graceful failures (no API keys). In production with API keys:
   - Enrichment JSON responses would be ~1-5KB larger
   - Code-mode would add ~500 tokens to Call 2 prompt (one-time)
   - Traditional would add ~500 tokens to every call after the API response (compounding)

4. **Enrichment latency** (246-249ms for 4 parallel lookups) demonstrates the core advantage: JavaScript Promise.allSettled executes in the V8 sandbox with zero LLM overhead. The traditional approach would require 4 separate LLM decisions + 4 sequential HTTP calls.

5. **Deduplication** uses `$getWorkflowStaticData('global')` — persistent across executions with no LLM tokens. Traditional approach would need a separate tool call per dedup check.

6. The **2 LLM calls** in code-mode are: (a) agent decides to call `enrich_ip` tool, (b) agent analyzes enrichment results and generates structured response. This is the minimum for an AI agent to act on enrichment data.

---

## Key Takeaway

Code-mode's parallel enrichment via `toolCode` with `Promise.allSettled` converts O(n^2) token growth into O(1) — all enrichment happens in a single JavaScript execution with zero LLM context accumulation. The LLM sees the combined enrichment result exactly once, instead of replaying growing context across 7+ sequential tool calls.

**The savings are structural, not incidental.** Every additional enrichment source added to the traditional approach compounds the token cost across all subsequent calls. In code-mode, adding a 5th or 6th API source adds ~100ms of parallel HTTP time and zero additional LLM overhead.
