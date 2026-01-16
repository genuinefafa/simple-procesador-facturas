#!/bin/bash
# CI Check Script - Run all CI validations locally before push
# Usage: ./scripts/ci-check.sh

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0
RESULTS=""

run_check() {
    local name="$1"
    local dir="$2"
    local cmd="$3"

    echo -n "Running: $name... "

    if cd "$ROOT_DIR/$dir" && eval "$cmd" > /tmp/ci-check-output.txt 2>&1; then
        echo -e "${GREEN}PASS${NC}"
        RESULTS="${RESULTS}\n✅ ${name}: PASS"
    else
        echo -e "${RED}FAIL${NC}"
        RESULTS="${RESULTS}\n❌ ${name}: FAIL"
        echo "--- Output ---"
        cat /tmp/ci-check-output.txt
        echo "--------------"
        FAILED=1
    fi
}

echo "=========================================="
echo "CI Check - Local Validation"
echo "=========================================="
echo ""

# 1. Client format check
run_check "client/format:check" "client" "npm run format:check"

# 2. Server format check
run_check "server/format:check" "server" "npm run format:check"

# 3. Server lint (ESLint)
run_check "server/lint" "server" "npm run lint"

# 4. Client svelte-check
run_check "client/svelte-check" "client" "npm run check"

# 5. Server TypeScript
run_check "server/tsc" "server" "npx tsc --noEmit"

# 6. Client build
run_check "client/build" "client" "npm run build"

echo ""
echo "=========================================="
echo "SUMMARY"
echo "=========================================="
echo -e "$RESULTS"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All checks passed! Safe to push.${NC}"
    exit 0
else
    echo -e "${RED}Some checks failed. Fix before pushing.${NC}"
    exit 1
fi
