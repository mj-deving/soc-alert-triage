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
