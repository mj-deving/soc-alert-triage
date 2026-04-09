#!/usr/bin/env bash
# check-secrets.sh — Prueft auf versehentlich committete Secrets
#
# Verwendung:
#   bash check-secrets.sh              Prueft alle Dateien in workflows/ + Root
#   bash check-secrets.sh --staged     Prueft nur gestagete Dateien (fuer Pre-Commit Hook)
#   bash check-secrets.sh --strict     Exit Code 1 bei Fund (fuer CI)
#
# Credential-IDs wie "id: 'FVE8T8mYCgIRpSyv'" sind OKAY — n8n-interne Referenzen.
# Dieses Script sucht nach ECHTEN Secrets: API Keys, Tokens, Passwoerter.

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

# ─── Welche Dateien pruefen? ────────────────────────────────────────────
if [ "$STAGED" = true ]; then
    # Nur gestagete Dateien (fuer Pre-Commit Hook)
    mapfile -t FILES < <(git diff --cached --name-only --diff-filter=ACM 2>/dev/null)
else
    # Alle relevanten Dateien im Repo
    mapfile -t FILES < <(find workflows/ -type f -name '*.ts' 2>/dev/null; find . -maxdepth 1 -name '*.json' -o -name '*.env*' 2>/dev/null)
fi

if [ ${#FILES[@]} -eq 0 ]; then
    echo -e "${GREEN}Keine Dateien zu pruefen.${NC}"
    exit 0
fi

echo -e "${YELLOW}Secret-Check fuer n8n-autopilot${NC}"
echo "================================="
echo "Modus: $([ "$STAGED" = true ] && echo 'staged files' || echo 'alle Dateien')"
echo "Dateien: ${#FILES[@]}"
echo ""

# ─── 1. Gefaehrliche Dateien im Staging? ────────────────────────────────
DANGER_FILES=('.env' '.env.local' '.env.production' 'credentials.json' '*.pem' '*.key')

for danger_pattern in "${DANGER_FILES[@]}"; do
    for f in "${FILES[@]}"; do
        fname=$(basename "$f")
        case "$fname" in
            $danger_pattern)
                echo -e "${RED}BLOCKIERT: $f darf nicht committet werden!${NC}"
                FOUND=$((FOUND + 1))
                ;;
        esac
    done
done

# ─── 2. Secret-Patterns in Dateiinhalten ────────────────────────────────
# Jedes Pattern: regex|beschreibung
PATTERNS=(
    # Hardcoded Credentials (key = "value" Muster)
    #   Hinweis: [^"]{4,} statt \x27 — bash grep versteht kein \x27
    'password\s*[:=]\s*"[^"]{4,}"|Hardcoded Passwort'
    "password\s*[:=]\s*'[^']{4,}'|Hardcoded Passwort"
    'api_key\s*[:=]\s*"[A-Za-z0-9]|Hardcoded API Key'
    'apiKey\s*[:=]\s*"[A-Za-z0-9]|Hardcoded API Key (camelCase)'
    'secret\s*[:=]\s*"[A-Za-z0-9]|Hardcoded Secret'
    'token\s*[:=]\s*"[A-Za-z0-9][A-Za-z0-9_.:-]{15,}|Hardcoded Token'

    # Bearer / Auth Header
    'Bearer [A-Za-z0-9._+/=-]{20,}|Bearer Token'

    # Provider-spezifische Keys (Bindestrich am ENDE der Klasse = kein Range)
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

# Erlaubte Kontexte (false positives die ignoriert werden)
ALLOWED_CONTEXTS=(
    'googlePalmApi'        # n8n credential type name
    'telegramApi'          # n8n credential type name
    'credentials:'         # n8nac credential reference
    'description'          # Tool descriptions
    'message:'             # System prompts
    'SystemMessage'        # LLM system messages
    '// '                  # Kommentare
    'check-secrets'        # Dieses Script selbst
    'TEMPLATE-REFERENZ'    # Doku
)

for entry in "${PATTERNS[@]}"; do
    pattern="${entry%%|*}"
    label="${entry##*|}"

    for f in "${FILES[@]}"; do
        # Nur Textdateien pruefen
        case "$f" in
            *.ts|*.js|*.json|*.env*|*.yml|*.yaml|*.md|*.sh) ;;
            *) continue ;;
        esac

        [ ! -f "$f" ] && continue

        while IFS= read -r match; do
            [ -z "$match" ] && continue

            # False-Positive Filter
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

# ─── Ergebnis ───────────────────────────────────────────────────────────
echo ""
if [ "$FOUND" -eq 0 ]; then
    echo -e "${GREEN}Keine Secrets gefunden. Alles sauber.${NC}"
    exit 0
else
    echo -e "${RED}$FOUND potenzielle(s) Secret(s) gefunden!${NC}"
    echo "Bitte pruefen und ggf. aus den Dateien entfernen."
    if [ "$STRICT" = true ] || [ "$STAGED" = true ]; then
        echo -e "${RED}Commit wird blockiert.${NC}"
        exit 1
    fi
    exit 0
fi
