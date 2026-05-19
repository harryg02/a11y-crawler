#!/bin/bash
# Double-click this file to launch A11y Crawler.
# On first run it will take a minute to set up — subsequent runs are fast.

cd "$(dirname "$0")"

# ── Helpers ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗ $1${NC}"; echo; echo "$2"; echo; read -p "Press Enter to close..."; exit 1; }

echo
echo -e "${BOLD}  A11y Crawler${NC}"
echo "  ─────────────────────────────"
echo

# ── Node.js check ─────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  fail "Node.js is not installed." \
       "  Download and install it from: https://nodejs.org (use the LTS version)
  Then double-click this file again."
fi

NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node.js $(node -v) is too old (need v18 or newer)." \
       "  Update at: https://nodejs.org"
fi
ok "Node.js $(node -v)"

# ── Install dependencies (fast if already done) ───────────────────────────────
echo -n "  Checking dependencies..."
npm install --silent 2>>start-error.log \
  || fail "Could not install dependencies." "  Details in start-error.log — try running: npm install"
echo -e "\r$(ok 'Dependencies ready')    "

# ── Install Playwright browser (skips if already installed) ───────────────────
echo -n "  Checking browser (may take a minute the first time)..."
npx playwright install chromium 2>>start-error.log \
  || fail "Could not install Chromium." "  Details in start-error.log — try running: npx playwright install chromium"
echo -e "\r$(ok 'Browser ready')                                        "

# ── Open browser after server is up ──────────────────────────────────────────
(
  for i in $(seq 1 60); do
    curl -s http://localhost:3000 >/dev/null 2>&1 && break
    sleep 1
  done
  if command -v open &>/dev/null; then
    open http://localhost:3000          # macOS
  elif command -v xdg-open &>/dev/null; then
    xdg-open http://localhost:3000     # Linux
  fi
) &

# ── Start ─────────────────────────────────────────────────────────────────────
echo
echo -e "  ${BOLD}Starting…${NC}  http://localhost:3000"
echo "  Press Ctrl+C to stop."
echo
npm run dev
