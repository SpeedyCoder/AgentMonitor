#!/bin/bash
# Bundle ACP adapters for Trantor.
# This script installs pinned adapter packages into src-tauri resources and
# prefers native adapter executables when packages provide them.

set -euo pipefail

# Configuration
VERSION_CODEX="0.14.0"
VERSION_CLAUDE="0.33.1"
BIN_DIR="src-tauri/resources/bin"

# Create binary directory
mkdir -p "$BIN_DIR"

require_file() {
    local path="$1"
    local description="$2"
    if [ ! -f "$path" ]; then
        echo "Error: missing $description: $path" >&2
        exit 1
    fi
}

require_executable() {
    local path="$1"
    local description="$2"
    require_file "$path" "$description"
    if [ ! -x "$path" ]; then
        echo "Error: $description is not executable: $path" >&2
        exit 1
    fi
}

echo "Bundling ACP adapters..."

# Detect platform
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

echo "Detected platform: $OS-$ARCH"

case "$OS-$ARCH" in
    darwin-x86_64) CODEX_NATIVE_PACKAGE="@zed-industries/codex-acp-darwin-x64" ;;
    darwin-arm64) CODEX_NATIVE_PACKAGE="@zed-industries/codex-acp-darwin-arm64" ;;
    linux-x86_64) CODEX_NATIVE_PACKAGE="@zed-industries/codex-acp-linux-x64" ;;
    linux-arm64|linux-aarch64) CODEX_NATIVE_PACKAGE="@zed-industries/codex-acp-linux-arm64" ;;
    mingw-x86_64|msys-x86_64|cygwin-x86_64) CODEX_NATIVE_PACKAGE="@zed-industries/codex-acp-win32-x64" ;;
    mingw-arm64|msys-arm64|cygwin-arm64|mingw-aarch64|msys-aarch64|cygwin-aarch64) CODEX_NATIVE_PACKAGE="@zed-industries/codex-acp-win32-arm64" ;;
    *) CODEX_NATIVE_PACKAGE="" ;;
esac

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "Error: npm is required to bundle ACP adapters"
    exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

CODEX_PACKAGE="@zed-industries/codex-acp@${VERSION_CODEX}"
CODEX_BUNDLE_DIR="$BIN_DIR/codex-acp-node"

echo "Installing $CODEX_PACKAGE into a local bundle..."
npm install \
    --prefix "$TMP_DIR/codex" \
    --omit=dev \
    --ignore-scripts \
    --no-audit \
    --no-fund \
    "$CODEX_PACKAGE"

rm -rf "$CODEX_BUNDLE_DIR"
mkdir -p "$CODEX_BUNDLE_DIR"
cp -R "$TMP_DIR/codex/node_modules" "$CODEX_BUNDLE_DIR/node_modules"

CODEX_ENTRY="$CODEX_BUNDLE_DIR/node_modules/@zed-industries/codex-acp/bin/codex-acp.js"
require_file "$CODEX_ENTRY" "Codex ACP entrypoint"

CODEX_NATIVE_BIN=""
if [ -n "$CODEX_NATIVE_PACKAGE" ]; then
    CODEX_NATIVE_BIN="$CODEX_BUNDLE_DIR/node_modules/$CODEX_NATIVE_PACKAGE/bin/codex-acp"
    if [ ! -f "$CODEX_NATIVE_BIN" ] && [ -f "$CODEX_NATIVE_BIN.exe" ]; then
        CODEX_NATIVE_BIN="$CODEX_NATIVE_BIN.exe"
    fi
fi

if [ -n "$CODEX_NATIVE_BIN" ] && [ -f "$CODEX_NATIVE_BIN" ]; then
    CODEX_BIN="$BIN_DIR/codex-acp"
    if [ "$OS" = "windows" ] || [ "$OS" = "mingw" ] || [ "$OS" = "msys" ] || [ "$OS" = "cygwin" ]; then
        CODEX_BIN="$BIN_DIR/codex-acp.exe"
    fi
    cp "$CODEX_NATIVE_BIN" "$CODEX_BIN"
    chmod +x "$CODEX_BIN"
elif [ "$OS" = "darwin" ] || [ "$OS" = "linux" ]; then
    CODEX_BIN="$BIN_DIR/codex-acp"
    cat > "$CODEX_BIN" << 'EOF'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "codex-acp requires Node.js because no native bundled binary was available for this platform." >&2
  echo "Install Node.js or update scripts/bundle_acp_agents.sh to bundle a native codex-acp executable." >&2
  exit 127
fi
exec node "$DIR/codex-acp-node/node_modules/@zed-industries/codex-acp/bin/codex-acp.js" "$@"
EOF
    chmod +x "$CODEX_BIN"
elif [ "$OS" = "windows" ] || [ "$OS" = "mingw" ]; then
    CODEX_BIN="$BIN_DIR/codex-acp.cmd"
    cat > "$CODEX_BIN" << 'EOF'
@echo off
set DIR=%~dp0
where node >nul 2>nul
if errorlevel 1 (
  echo codex-acp requires Node.js because no native bundled binary was available for this platform. 1>&2
  exit /b 127
)
node "%DIR%\codex-acp-node\node_modules\@zed-industries\codex-acp\bin\codex-acp.js" %*
EOF
else
    echo "Unsupported OS for codex-acp: $OS"
    exit 1
fi

echo "✓ codex-acp bundled"

echo "Setting up claude-agent-acp..."

CLAUDE_PACKAGE="@agentclientprotocol/claude-agent-acp@${VERSION_CLAUDE}"
CLAUDE_BUNDLE_DIR="$BIN_DIR/claude-agent-acp-node"

echo "Installing $CLAUDE_PACKAGE into a local bundle..."
npm install \
    --prefix "$TMP_DIR/claude" \
    --omit=dev \
    --ignore-scripts \
    --no-audit \
    --no-fund \
    "$CLAUDE_PACKAGE"

rm -rf "$CLAUDE_BUNDLE_DIR"
mkdir -p "$CLAUDE_BUNDLE_DIR"
cp -R "$TMP_DIR/claude/node_modules" "$CLAUDE_BUNDLE_DIR/node_modules"

CLAUDE_ENTRY="$CLAUDE_BUNDLE_DIR/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js"
require_file "$CLAUDE_ENTRY" "Claude ACP entrypoint"

if [ "$OS" = "darwin" ] || [ "$OS" = "linux" ]; then
    CLAUDE_BIN="$BIN_DIR/claude-agent-acp"
    cat > "$CLAUDE_BIN" << 'EOF'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -x "$DIR/node" ]; then
  exec "$DIR/node" "$DIR/claude-agent-acp-node/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js" "$@"
fi
if ! command -v node >/dev/null 2>&1; then
  echo "claude-agent-acp requires Node.js. Packaged releases must bundle a Node runtime at Resources/bin/node or declare Node.js as a release prerequisite." >&2
  exit 127
fi
exec node "$DIR/claude-agent-acp-node/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js" "$@"
EOF
    chmod +x "$CLAUDE_BIN"
elif [ "$OS" = "windows" ] || [ "$OS" = "mingw" ]; then
    CLAUDE_BIN="$BIN_DIR/claude-agent-acp.cmd"
    cat > "$CLAUDE_BIN" << 'EOF'
@echo off
set DIR=%~dp0
if exist "%DIR%\node.exe" (
  "%DIR%\node.exe" "%DIR%\claude-agent-acp-node\node_modules\@agentclientprotocol\claude-agent-acp\dist\index.js" %*
  exit /b %ERRORLEVEL%
)
where node >nul 2>nul
if errorlevel 1 (
  echo claude-agent-acp requires Node.js. Packaged releases must bundle node.exe in the resource bin directory or declare Node.js as a release prerequisite. 1>&2
  exit /b 127
)
node "%DIR%\claude-agent-acp-node\node_modules\@agentclientprotocol\claude-agent-acp\dist\index.js" %*
EOF
else
    echo "Unsupported OS for claude-agent-acp: $OS"
    exit 1
fi

echo "✓ claude-agent-acp bundled"

require_file "$CODEX_ENTRY" "Codex ACP entrypoint"
require_file "$CLAUDE_ENTRY" "Claude ACP entrypoint"
if [ "$OS" = "windows" ] || [ "$OS" = "mingw" ] || [ "$OS" = "msys" ] || [ "$OS" = "cygwin" ]; then
    require_file "$CODEX_BIN" "Codex ACP launcher"
    require_file "$CLAUDE_BIN" "Claude ACP launcher"
else
    require_executable "$CODEX_BIN" "Codex ACP launcher"
    require_executable "$CLAUDE_BIN" "Claude ACP launcher"
fi

echo ""
echo "ACP adapters bundled successfully in $BIN_DIR:"
ls -la "$BIN_DIR"
