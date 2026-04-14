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
