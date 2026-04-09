#!/usr/bin/env bash
set -euo pipefail

# new-workflow.sh — Scaffold a new workflow from template
#
# Usage: ./scripts/new-workflow.sh <category/name> "<Display Name>"
# Example: ./scripts/new-workflow.sh agents/06-slack-triage "Slack Message Triage"
#
# Creates:
#   workflows/<category/name>/
#   ├── README.md           (template with placeholders filled)
#   ├── workflow/
#   │   ├── workflow.ts     (skeleton with workflow-map header)
#   │   └── workflow.json   (empty n8n export)
#   └── test.json           (stub)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE_DIR="$REPO_ROOT/template"

if [ $# -lt 2 ]; then
    echo "Usage: $0 <category/name> \"<Display Name>\""
    echo "Example: $0 agents/06-slack-triage \"Slack Message Triage\""
    echo ""
    echo "Categories: agents, pipelines, triggers, utilities"
    exit 1
fi

WF_PATH="$1"
WF_NAME="$2"
TARGET_DIR="$REPO_ROOT/workflows/$WF_PATH"

if [ -d "$TARGET_DIR" ]; then
    echo "Error: $TARGET_DIR already exists"
    exit 1
fi

# Extract parts
CATEGORY=$(dirname "$WF_PATH")
SLUG=$(basename "$WF_PATH")

# Convert slug to PascalCase for class name (e.g., 01-customer-onboarding → CustomerOnboarding)
CLASS_NAME=$(echo "$SLUG" | sed 's/^[0-9]*-//' | sed -r 's/(^|-)(\w)/\U\2/g')

echo "Creating workflow: $WF_NAME"
echo "  Path:     workflows/$WF_PATH/"
echo "  Category: $CATEGORY"
echo "  Class:    ${CLASS_NAME}Workflow"
echo ""

# Create directory structure
mkdir -p "$TARGET_DIR/workflow"

# Copy and fill template README
sed \
    -e "s/{{WORKFLOW_NAME}}/$WF_NAME/g" \
    -e "s/{{ONE_LINE_DESCRIPTION}}/TODO: describe this workflow/g" \
    -e "s|{{FILENAME}}|$(basename "$WF_PATH").workflow|g" \
    "$TEMPLATE_DIR/README.md" > "$TARGET_DIR/README.md"

# Copy and fill workflow.ts
sed \
    -e "s/{{WORKFLOW_NAME}}/$WF_NAME/g" \
    -e "s/{{ClassName}}/$CLASS_NAME/g" \
    -e "s/{{N8N_ID}}/TODO/g" \
    -e "s/{{COUNT}}/0/g" \
    "$TEMPLATE_DIR/workflow/workflow.ts" > "$TARGET_DIR/workflow/workflow.ts"

# Copy and fill workflow.json
sed \
    -e "s/{{WORKFLOW_NAME}}/$WF_NAME/g" \
    "$TEMPLATE_DIR/workflow/workflow.json" > "$TARGET_DIR/workflow/workflow.json"

# Copy test.json
cp "$TEMPLATE_DIR/test.json" "$TARGET_DIR/test.json"

echo "Created:"
find "$TARGET_DIR" -type f | sort | while read -r f; do
    echo "  ${f#$REPO_ROOT/}"
done
echo ""
echo "Next steps:"
echo "  1. Edit workflows/$WF_PATH/README.md — fill in overview, flow, nodes"
echo "  2. Build the workflow in n8n or write workflow.ts directly"
echo "  3. Export with: npx --yes n8nac pull <id>"
echo "  4. Add test payloads to test.json"
echo "  5. Run: npx --yes n8nac push $(basename "$WF_PATH").workflow.ts"
