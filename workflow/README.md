# Workflow Files

This directory contains the root-level workflow export for standalone distribution.

## How to Use

1. **Export** your workflow from n8n: Menu > Download
2. **Replace** `workflow.json` with your exported file
3. **Validate** the JSON: `npm run validate`
4. **Check** for secrets: `npm run check-secrets`

## Important

- The `workflow.json` here is a **placeholder** — replace it with your actual workflow
- **Never commit actual credentials** — use n8n credential references (`id` + `name`) only
- For multi-workflow projects, each workflow lives in its own directory under `workflows/`
- This root-level export is for single-workflow distribution (n8n community sharing, blog posts)

## Validation

```bash
# Check JSON syntax
npm run validate

# Check for accidentally included secrets
npm run check-secrets
```
