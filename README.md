# My n8n Project

![n8n](https://img.shields.io/badge/n8n-2.x-orange.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

**Code-first n8n workflows with [n8nac](https://github.com/mj-deving/n8n-autopilot) and [code-mode](https://github.com/universal-tool-calling-protocol/code-mode).**

## Quick Start

```bash
# 1. Clone this template
git clone https://github.com/YOUR-USER/YOUR-PROJECT.git
cd YOUR-PROJECT

# 2. Install n8nac
npm install

# 3. Connect to your n8n instance
npx n8nac init

# 4. Scaffold your first workflow
npm run new-workflow -- agents/01-my-agent "My First Agent"

# 5. Build, push, test
npx n8nac push my-first-agent.workflow.ts
```

## What's Included

| Directory | Purpose |
|---|---|
| `workflows/` | Your workflow directories (scaffolded by `new-workflow.sh`) |
| `template/` | Scaffold source files for new workflows |
| `scripts/` | `new-workflow.sh` (scaffold) + `check-secrets.sh` (pre-commit) |
| `docs/decisions/` | Architecture Decision Records |
| `.githooks/` | Pre-commit secret detection |

## Workflow Lifecycle

```
Scaffold → Develop → Push → Test → Document
```

1. **Scaffold** a new workflow directory with `npm run new-workflow`
2. **Develop** in n8n UI or write `.workflow.ts` directly
3. **Push** to n8n with `npx n8nac push <filename>.workflow.ts`
4. **Test** with `npx n8nac test <id> --prod`
5. **Document** the README, benchmarks, and test payloads

## Commands

```bash
# Scaffold a new workflow
npm run new-workflow -- agents/01-my-agent "My Agent Name"

# Check for accidentally committed secrets
npm run check-secrets

# n8nac workflow operations
npx n8nac list                    # List all workflows
npx n8nac pull <id>               # Pull from n8n
npx n8nac push <file>.workflow.ts # Push to n8n
npx n8nac verify <id>             # Validate live workflow
npx n8nac test <id> --prod        # Test webhook workflows
```

## Workflow Structure

Each scaffolded workflow gets:

```
workflows/<category>/<slug>/
├── README.md           # Overview, flow diagram, test instructions
├── workflow/
│   ├── workflow.ts     # n8nac TypeScript source
│   └── workflow.json   # n8n JSON export (for UI import)
├── test.json           # Test payloads
└── benchmark.md        # Performance data (if applicable)
```

## Categories

| Category | What Goes Here |
|---|---|
| `agents` | AI agent workflows (LLM-driven, tool-calling) |
| `pipelines` | Data processing pipelines (ETL, enrichment) |
| `triggers` | Event-driven automations (webhook, schedule, RSS) |
| `utilities` | Helper workflows (health checks, monitoring) |

## Setup

### Pre-commit Hook

Enable the secrets check hook:

```bash
git config core.hooksPath .githooks
```

### AI Agent Support

This repo includes `AGENTS.md` with the full n8nac protocol for AI agents (Claude, Cursor, etc.). AI agents should read `AGENTS.md` before any n8nac operation.

## License

MIT
