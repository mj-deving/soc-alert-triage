#!/usr/bin/env bash
# check-secrets.sh — Check for accidentally committed secrets
#
# Usage:
#   bash check-secrets.sh              Check all files in workflows/ + root
#   bash check-secrets.sh --staged     Check only staged files (for pre-commit hook)
#   bash check-secrets.sh --strict     Exit code 1 on finding (for CI)
#
# Credential IDs like "id: 'FVE8T8mYCgIRpSyv'" are OKAY — n8n internal references.
# This script looks for REAL secrets: API keys, tokens, passwords.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

FOUND=0
STRICT=false
STAGED=false

for arg in "$@"; do
    case "$arg" in
        --strict)  STRICT=true ;;
        --staged)  STAGED=true ;;
    esac
done

# --- Which files to check? ---
if [ "$STAGED" = true ]; then
    mapfile -t FILES < <(git diff --cached --name-only --diff-filter=ACM 2>/dev/null)
else
    mapfile -t FILES < <(find workflows/ -type f -name '*.ts' 2>/dev/null; find . -maxdepth 1 \( -name '*.json' -o -name '*.env*' \) 2>/dev/null)
fi

if [ ${#FILES[@]} -eq 0 ]; then
    echo -e "${GREEN}No files to check.${NC}"
    exit 0
fi

echo -e "${YELLOW}Secret Check${NC}"
echo "================================="
echo "Mode: $([ "$STAGED" = true ] && echo 'staged files' || echo 'all files')"
echo "Files: ${#FILES[@]}"
echo ""

# --- 1. Dangerous files in staging? ---
DANGER_FILES=('.env' '.env.local' '.env.production' 'credentials.json' '*.pem' '*.key')

for danger_pattern in "${DANGER_FILES[@]}"; do
    for f in "${FILES[@]}"; do
        fname=$(basename "$f")
        case "$fname" in
            $danger_pattern)
                echo -e "${RED}BLOCKED: $f must not be committed!${NC}"
                FOUND=$((FOUND + 1))
                ;;
        esac
    done
done

# --- 2. Secret patterns in file contents ---
PATTERNS=(
    'password\s*[:=]\s*"[^"]{4,}"|Hardcoded Password'
    "password\s*[:=]\s*'[^']{4,}'|Hardcoded Password"
    'api_key\s*[:=]\s*"[A-Za-z0-9]|Hardcoded API Key'
    'apiKey\s*[:=]\s*"[A-Za-z0-9]|Hardcoded API Key (camelCase)'
    'secret\s*[:=]\s*"[A-Za-z0-9]|Hardcoded Secret'
    'token\s*[:=]\s*"[A-Za-z0-9][A-Za-z0-9_.:-]{15,}|Hardcoded Token'

    # Bearer / Auth Header
    'Bearer [A-Za-z0-9._+/=-]{20,}|Bearer Token'

    # Provider-specific keys
    'sk-[A-Za-z0-9_-]{20,}|OpenAI API Key'
    'sk-ant-[A-Za-z0-9_-]{20,}|Anthropic API Key'
    'AIza[A-Za-z0-9_-]{30,}|Google API Key'
    'ghp_[A-Za-z0-9]{36}|GitHub Personal Access Token'
    'gho_[A-Za-z0-9]{36}|GitHub OAuth Token'
    'github_pat_[A-Za-z0-9_]{20,}|GitHub Fine-Grained PAT'
    'AKIA[A-Z0-9]{16}|AWS Access Key'
    'xoxb-[0-9]{10,}|Slack Bot Token'
    'xoxp-[0-9]{10,}|Slack User Token'
    'bot[0-9]{6,}:[A-Za-z0-9_-]{30,}|Telegram Bot Token'
)

# Allowed contexts (false positives to ignore)
ALLOWED_CONTEXTS=(
    'googlePalmApi'        # n8n credential type name
    'telegramApi'          # n8n credential type name
    'credentials:'         # n8nac credential reference
    'description'          # Tool descriptions
    'message:'             # System prompts
    'SystemMessage'        # LLM system messages
    '// '                  # Comments
    'check-secrets'        # This script itself
    'TEMPLATE-REFERENZ'    # Docs
)

for entry in "${PATTERNS[@]}"; do
    pattern="${entry%%|*}"
    label="${entry##*|}"

    for f in "${FILES[@]}"; do
        case "$f" in
            *.ts|*.js|*.json|*.env*|*.yml|*.yaml|*.md|*.sh) ;;
            *) continue ;;
        esac

        [ ! -f "$f" ] && continue

        while IFS= read -r match; do
            [ -z "$match" ] && continue

            skip=false
            for ctx in "${ALLOWED_CONTEXTS[@]}"; do
                if echo "$match" | grep -q "$ctx"; then
                    skip=true
                    break
                fi
            done

            if [ "$skip" = false ]; then
                echo -e "${RED}[$label]${NC} $match"
                FOUND=$((FOUND + 1))
            fi
        done < <(grep -nE "$pattern" "$f" 2>/dev/null || true)
    done
done

# --- Result ---
echo ""
if [ "$FOUND" -eq 0 ]; then
    echo -e "${GREEN}No secrets found. All clean.${NC}"
    exit 0
else
    echo -e "${RED}$FOUND potential secret(s) found!${NC}"
    echo "Please review and remove from files if needed."
    if [ "$STRICT" = true ] || [ "$STAGED" = true ]; then
        echo -e "${RED}Commit blocked.${NC}"
        exit 1
    fi
    exit 0
fi
