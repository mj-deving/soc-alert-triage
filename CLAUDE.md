# CLAUDE.md — n8n Project

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
- **Session end**: Always run `bd sync` then `git push` — Landing the Plane protocol
- **Never leave unpushed work** — work isn't done until `git push` succeeds
