# CLAUDE.md — SOC Alert Triage

## Project

AI-powered Security Operations Center alert triage. Ingests alerts from SIEM (Wazuh, Elastic, Splunk), enriches with threat intel (VirusTotal, AbuseIPDB, Shodan, MITRE ATT&CK mapping), scores severity, deduplicates into incidents, and routes to response playbooks — all in one code-mode execution using parallel enrichment.

**This showcases code-mode's parallel execution** — 8-15 threat intel API calls per alert fire simultaneously via Promise.all in the V8 sandbox, instead of sequential LLM tool calls.

**Full build plan:** Read `docs/SESSION-KICKOFF.md` for architecture, phased plan, scope, and success criteria.

**Roadmap source:** [code-first-n8n/docs/ROADMAP.md](https://github.com/mj-deving/code-first-n8n/blob/main/docs/ROADMAP.md) — Tier 1, Item #2

## n8n Instance

- **Host:** `http://172.31.224.1:5678` (Windows n8n, accessed from WSL via vEthernet bridge — NOT localhost)
- **Auth header:** `X-N8N-API-KEY` (NOT `Authorization: Bearer`)
- **Env vars:** `$N8N_API_KEY` and `$N8N_HOST` set in `~/.bashrc`
- **workflowDir:** `workflows/172_31_224_1:5678_marius _j/personal/`

## n8n Credentials

| Credential | ID | Type | Use For |
|---|---|---|---|
| OpenRouter | `mOL6UoYXfgKf6RZh` | openAiApi | LLM (Haiku) for triage reasoning |
| Google Gemini | `FVE8T8mYCgIRpSyv` | googlePalmApi | Alternative LLM |
| Telegram Bot | `nzmbw9ZNGZdA9sZp` | telegramApi | Alert notifications |

## Before Any Work

- **Read `@AGENTS.md`** for session protocol (Beads task tracking, Landing the Plane, session completion rules)
- **Read `AGENTS.md`** for the n8nac workflow protocol (GitOps sync, research, validation, testing, error classification)
  - If `AGENTS.md` says "run n8nac init", do that first — it auto-generates the full protocol
  - `n8nac init` is not credential-free: export `N8N_API_KEY` first, then run it with `--host`, `--sync-folder`, and `--yes`

## Tech Stack

- **n8n** — workflow automation (connect via `npx --yes n8nac init`)
- **n8nac** — code-first workflow development (`.workflow.ts` format)
- **Beads** (`bd`) — AI-native issue tracker and agent memory

## Key Commands

```bash
# Bootstrap n8n access non-interactively
export N8N_API_KEY="<your n8n API key>"
npm run setup:n8n -- http://<your-n8n-host>:5678

# Workflow operations
npx --yes n8nac list                    # List all workflows
npx --yes n8nac push <file>.workflow.ts # Push to n8n
npx --yes n8nac verify <id>            # Validate live workflow
npx --yes n8nac test <id> --prod       # Test webhook workflows

# Scaffold
npm run new-workflow -- <category>/<slug> "Display Name"
npm run validate:workflows              # Credential-free local validation for workflow.ts files

# Beads
bd ready              # Start session — find available work
bd sync               # End session — persist state for next agent
```

## Critical Rules

- **Push filename only**: `npx --yes n8nac push workflow.ts` — no paths
- **Init required**: Must run `npx --yes n8nac init` before pull/push
- **Auth header**: n8n API uses `X-N8N-API-KEY` header, NOT `Authorization: Bearer`
- **Session end**: Always run `bd sync` then `git push` — Landing the Plane protocol
- **Never leave unpushed work** — work isn't done until `git push` succeeds

## n8n Code Node Sandbox (CRITICAL)

n8n Code nodes run in a restricted sandbox. These rules apply to ALL Code nodes and toolCode:

- **No `require('fs')`** — blocked. No filesystem access
- **No `require('http')`** — blocked
- **No `fetch()`** — not available in sandbox
- **Only `this.helpers.httpRequest()`** works for HTTP calls
- **`query` with `specifyInputSchema: true`** — `query` is an object `{query: "..."}`, access via `query.query`
- **Sibling tool args** — use `args ?? {}` not `args || {}` (falsy primitives are valid)
- **Persistence** — use `$getWorkflowStaticData('global')` or workflow data flow, never filesystem

## n8n Error Classification

`n8nac test` classifies failures into three types:

| Class | Exit | Action |
|---|---|---|
| **Class A — Config gap** | 0 | Missing credentials/model. Inform user, do NOT re-edit code |
| **Runtime state** | 0 | Webhook not armed. Fix state, NOT code |
| **Class B — Wiring error** | 1 | Bad expression/field. Fix `.workflow.ts`, push, re-test |

## LLM Cost Control

- **Never use Sonnet** for n8n agents — too expensive. Use Haiku ($0.80/$4 per 1M tokens)
- **Gemini + n8n tools = broken** — Gemini 2.0/2.5 Flash sends null tool arguments. Use Claude Haiku
- **OpenRouter model IDs**: `anthropic/claude-haiku-4-5` works. `anthropic/claude-3.5-sonnet` is dead
- **lmChatOpenAi typeVersion 1** accepts plain string model IDs. **Version 1.3** requires `{mode: 'list', value: 'model-id'}`
- **Default LLM config for this project:** OpenRouter credential `mOL6UoYXfgKf6RZh`, model `anthropic/claude-haiku-4-5`, typeVersion 1.3
