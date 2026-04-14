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

# Validate local workflow.ts sources
npm run validate:workflows

# Check for accidentally included secrets
npm run check-secrets
```
*** Add File: /home/mj/projects/n8n-project-template/scripts/init-n8n.sh
#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-${N8N_HOST:-}}"
SYNC_FOLDER="${2:-$(pwd)}"
INSTANCE_NAME="${3:-local}"

if [ -z "$HOST" ]; then
    echo "Usage: $0 <n8n-host> [sync-folder] [instance-name]"
    echo "Example: $0 http://172.31.224.1:5678"
    exit 1
fi

if [ -z "${N8N_API_KEY:-}" ]; then
    echo "Error: N8N_API_KEY is required."
    echo "Export it first, then rerun this script."
    echo "Example:"
    echo "  export N8N_API_KEY=\"<your n8n API key>\""
    exit 1
fi

echo "Initializing n8nac against $HOST"
echo "  sync folder:   $SYNC_FOLDER"
echo "  instance name: $INSTANCE_NAME"

npx --yes n8nac init \
    --host "$HOST" \
    --sync-folder "$SYNC_FOLDER" \
    --instance-name "$INSTANCE_NAME" \
    --yes
*** Add File: /home/mj/projects/n8n-project-template/scripts/validate-workflows.sh
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

mapfile -t WORKFLOW_FILES < <(find "$ROOT_DIR/workflows" -type f -name 'workflow.ts' | sort)

if [ ${#WORKFLOW_FILES[@]} -eq 0 ]; then
    echo "No workflow.ts files found under workflows/."
    exit 0
fi

echo "Validating ${#WORKFLOW_FILES[@]} workflow source file(s)..."

for workflow_file in "${WORKFLOW_FILES[@]}"; do
    echo "→ $workflow_file"
    npx --yes n8nac skills validate "$workflow_file"
done

echo "All workflow.ts files validated successfully."
