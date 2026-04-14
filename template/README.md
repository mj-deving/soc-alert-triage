# {{WORKFLOW_NAME}}

> {{ONE_LINE_DESCRIPTION}}

## Overview

{{WHAT_THIS_WORKFLOW_DOES — 2-3 sentences}}

**Trigger:** {{webhook / schedule / manual}}
**Nodes:** {{COUNT}}
**LLM:** {{model name or "none"}}
**Category:** {{agents / pipelines / triggers / utilities}}

## Flow

```mermaid
graph LR
    A["{{Trigger}}"] --> B["{{Step 1}}"]
    B --> C["{{Step 2}}"]
    C --> D["{{Output}}"]
```

## Nodes

| Node | Type | Purpose |
|---|---|---|
| {{Node Name}} | {{n8n node type}} | {{What it does}} |

## Test

**Endpoint:** `POST /webhook/{{path}}`

```bash
curl -X POST http://localhost:5678/webhook/{{path}} \
  -H "Content-Type: application/json" \
  -d '{{TEST_PAYLOAD}}'
```

**Expected:** {{EXPECTED_OUTPUT}}

See `test.json` for all test payloads.

## Benchmark

{{If applicable — before/after comparison. Delete this section if not relevant.}}

| Metric | Before | After | Improvement |
|---|---|---|---|
| {{metric}} | {{value}} | {{value}} | {{%}} |

## Install

```bash
# Push to your n8n instance
npx --yes n8nac push {{FILENAME}}.workflow.ts

# Or import workflow.json via n8n UI:
# Settings → Import from file → workflow/workflow.json
```

## Status

- [ ] Workflow built
- [ ] Tested with payloads
- [ ] Benchmarked (if applicable)
- [ ] workflow.ts exported
- [ ] Ready to distribute
