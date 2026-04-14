#!/usr/bin/env bash
set -euo pipefail

# ── WhatsApp Summarizer — One-Command Deploy ──────────────────────────
#
# Usage:
#   ./deploy.sh          Build the app + pull model
#   ./deploy.sh --dev    Install deps + pull model + start dev server
#
# What this does:
#   1. Checks/installs Node.js 20+
#   2. Installs npm dependencies (including native modules)
#   3. Installs Ollama (local LLM runtime)
#   4. Pulls the default model (llama3.2)
#   5. Builds the Electron app (distributable .app / .dmg)
#
# Supports: macOS (arm64 + x64), Linux (x64)
# ──────────────────────────────────────────────────────────────────────

OLLAMA_MODEL="llama3.2"
NODE_MIN_VERSION=20
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

# ── Step 0: Detect platform ──────────────────────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) PLATFORM="macos" ;;
  Linux)  PLATFORM="linux" ;;
  *)      fail "Unsupported OS: $OS. Only macOS and Linux are supported." ;;
esac

info "Platform: $PLATFORM ($ARCH)"

# ── Step 1: Node.js ──────────────────────────────────────────────────

check_node() {
  if command -v node &>/dev/null; then
    local ver
    ver="$(node -v | sed 's/^v//' | cut -d. -f1)"
    if [ "$ver" -ge "$NODE_MIN_VERSION" ]; then
      ok "Node.js $(node -v) found"
      return 0
    else
      warn "Node.js $(node -v) is too old (need v${NODE_MIN_VERSION}+)"
      return 1
    fi
  else
    warn "Node.js not found"
    return 1
  fi
}

install_node() {
  info "Installing Node.js v${NODE_MIN_VERSION}..."

  if [ "$PLATFORM" = "macos" ]; then
    if command -v brew &>/dev/null; then
      brew install node@22
      brew link --overwrite node@22 || true
    else
      info "Installing Homebrew first..."
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      # Add brew to PATH for this session
      if [ "$ARCH" = "arm64" ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
      else
        eval "$(/usr/local/bin/brew shellenv)"
      fi
      brew install node@22
      brew link --overwrite node@22 || true
    fi
  else
    # Linux: use NodeSource
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi

  check_node || fail "Node.js installation failed"
}

if ! check_node; then
  install_node
fi

# ── Step 2: npm install ──────────────────────────────────────────────

info "Installing dependencies..."

# Ensure we're in the project root
cd "$(dirname "$0")"

if [ ! -f "package.json" ]; then
  fail "package.json not found. Run this script from the project root."
fi

npm install 2>&1 | tail -5
ok "Dependencies installed"

# ── Step 3: Ollama ───────────────────────────────────────────────────

check_ollama() {
  if command -v ollama &>/dev/null; then
    ok "Ollama found: $(command -v ollama)"
    return 0
  fi

  # Check common paths
  for p in /usr/local/bin/ollama /opt/homebrew/bin/ollama /usr/bin/ollama; do
    if [ -f "$p" ]; then
      ok "Ollama found: $p"
      return 0
    fi
  done

  warn "Ollama not found"
  return 1
}

install_ollama() {
  info "Installing Ollama..."

  if [ "$PLATFORM" = "macos" ]; then
    if command -v brew &>/dev/null; then
      brew install ollama
    else
      # Direct install via official script
      curl -fsSL https://ollama.com/install.sh | sh
    fi
  else
    # Linux: official install script
    curl -fsSL https://ollama.com/install.sh | sh
  fi

  check_ollama || fail "Ollama installation failed"
}

if ! check_ollama; then
  install_ollama
fi

# ── Step 4: Start Ollama + pull model ────────────────────────────────

start_ollama_if_needed() {
  if curl -sf http://localhost:11434/api/tags &>/dev/null; then
    ok "Ollama server already running"
    return 0
  fi

  info "Starting Ollama server..."
  ollama serve &>/dev/null &
  OLLAMA_PID=$!

  # Wait for it to be ready (max 15 seconds)
  for i in $(seq 1 30); do
    if curl -sf http://localhost:11434/api/tags &>/dev/null; then
      ok "Ollama server started (PID: $OLLAMA_PID)"
      return 0
    fi
    sleep 0.5
  done

  fail "Ollama server failed to start within 15 seconds"
}

pull_model() {
  info "Checking model: $OLLAMA_MODEL..."

  # Check if model already exists
  if curl -sf http://localhost:11434/api/tags 2>/dev/null | grep -q "\"$OLLAMA_MODEL"; then
    ok "Model '$OLLAMA_MODEL' already available"
    return 0
  fi

  info "Pulling model '$OLLAMA_MODEL' (this may take a few minutes on first run)..."
  ollama pull "$OLLAMA_MODEL"
  ok "Model '$OLLAMA_MODEL' ready"
}

start_ollama_if_needed
pull_model

# ── Step 5: Build or run ─────────────────────────────────────────────

if [ "${1:-}" = "--dev" ]; then
  info "Starting development server..."
  echo ""
  echo -e "${GREEN}================================${NC}"
  echo -e "${GREEN}  Starting WhatsApp Summarizer  ${NC}"
  echo -e "${GREEN}  (development mode)            ${NC}"
  echo -e "${GREEN}================================${NC}"
  echo ""
  npm run dev
else
  info "Building distributable app..."
  npm run make 2>&1 | tail -10

  echo ""
  echo -e "${GREEN}================================${NC}"
  echo -e "${GREEN}  Build complete!               ${NC}"
  echo -e "${GREEN}================================${NC}"
  echo ""

  # Find the output
  if [ "$PLATFORM" = "macos" ]; then
    APP_PATH=$(find out -name "*.app" -maxdepth 3 2>/dev/null | head -1)
    DMG_PATH=$(find out -name "*.dmg" -maxdepth 3 2>/dev/null | head -1)

    if [ -n "$DMG_PATH" ]; then
      echo -e "  DMG installer:  ${GREEN}$DMG_PATH${NC}"
    fi
    if [ -n "$APP_PATH" ]; then
      echo -e "  App bundle:     ${GREEN}$APP_PATH${NC}"
    fi
    echo ""
    echo "  To install: open the DMG and drag to Applications"
    echo "  To run now: open \"$APP_PATH\""
  else
    ZIP_PATH=$(find out -name "*.zip" -maxdepth 3 2>/dev/null | head -1)
    if [ -n "$ZIP_PATH" ]; then
      echo -e "  Archive: ${GREEN}$ZIP_PATH${NC}"
      echo ""
      echo "  To install: unzip and run the executable"
    fi
  fi

  echo ""
  echo -e "  ${YELLOW}Note:${NC} Ollama must be running on the target machine."
  echo "  The app will auto-start Ollama if installed."
  echo ""
fi
