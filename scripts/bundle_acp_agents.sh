#!/bin/bash
# Bundle ACP adapters for Trantor
# This script downloads the codex-acp and claude-agent-acp binaries for bundling with Trantor

set -euo pipefail

# Configuration
VERSION_CODEX="0.14.0"
VERSION_CLAUDE="0.33.1"
BIN_DIR="src-tauri/resources/bin"

# Create binary directory
mkdir -p "$BIN_DIR"

echo "Bundling ACP adapters..."

# Detect platform
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

echo "Detected platform: $OS-$ARCH"

# Download codex-acp
CODEX_URL="https://github.com/zed-industries/codex-acp/releases/download/v${VERSION_CODEX}/codex-acp-${OS}-${ARCH}"

if [ "$OS" = "darwin" ]; then
    # macOS uses universal binary
    CODEX_URL="https://github.com/zed-industries/codex-acp/releases/download/v${VERSION_CODEX}/codex-acp-macos-x64"
    CODEX_BIN="$BIN_DIR/codex-acp"
elif [ "$OS" = "linux" ]; then
    CODEX_BIN="$BIN_DIR/codex-acp"
    CODEX_URL="https://github.com/zed-industries/codex-acp/releases/download/v${VERSION_CODEX}/codex-acp-linux-x64"
elif [ "$OS" = "windows" ] || [ "$OS" = "mingw" ]; then
    CODEX_BIN="$BIN_DIR/codex-acp.exe"
    CODEX_URL="https://github.com/zed-industries/codex-acp/releases/download/v${VERSION_CODEX}/codex-acp-windows-x64.exe"
else
    echo "Unsupported OS for codex-acp: $OS"
    exit 1
fi

echo "Downloading codex-acp from $CODEX_URL..."
if command -v curl &> /dev/null; then
    curl -L -f "$CODEX_URL" -o "$CODEX_BIN"
elif command -v wget &> /dev/null; then
    wget -O "$CODEX_BIN" "$CODEX_URL"
else
    echo "Error: Neither curl nor wget found"
    exit 1
fi

chmod +x "$CODEX_BIN"
echo "✓ codex-acp bundled"

# Download claude-agent-acp (Node.js package)
# For now, we use npx which will resolve the latest version
# In production, we should download a specific version

echo "Setting up claude-agent-acp..."

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "Warning: npm not found, skipping claude-agent-acp bundling"
    echo "You will need npm installed to use Claude ACP adapter"
    exit 0
fi

# Install claude-agent-acp globally if not already installed
if ! npx --yes @agentclientprotocol/claude-agent-acp --version &> /dev/null; then
    echo "Installing @agentclientprotocol/claude-agent-acp..."
    npm install --global @agentclientprotocol/claude-agent-acp
fi

# Find the installed binary
CLAUDE_BIN=""
if [ "$OS" = "darwin" ] || [ "$OS" = "linux" ]; then
    # On Unix-like systems, find the global npm binary
    CLAUDE_GLOBAL=$(npm root --global 2>/dev/null || echo "")
    if [ -n "$CLAUDE_GLOBAL" ] && [ -d "$CLAUDE_GLOBAL" ]; then
        # Look for the package directory
        CLAUDE_PKG="$CLAUDE_GLOBAL/@agentclientprotocol/claude-agent-acp"
        if [ -d "$CLAUDE_PKG" ]; then
            # Find the main index.js
            CLAUDE_BIN="$CLAUDE_PKG/dist/index.js"
        fi
    fi
    
    # Fallback: use npx wrapper
    if [ -z "$CLAUDE_BIN" ] || [ ! -f "$CLAUDE_BIN" ]; then
        # Create a wrapper script that uses npx
        CLAUDE_BIN="$BIN_DIR/claude-agent-acp"
        cat > "$CLAUDE_BIN" << 'EOF'
#!/bin/bash
exec npx --yes @agentclientprotocol/claude-agent-acp "$@"
EOF
        chmod +x "$CLAUDE_BIN"
    else
        # Copy the actual binary
        cp "$CLAUDE_BIN" "$BIN_DIR/claude-agent-acp"
        chmod +x "$BIN_DIR/claude-agent-acp"
        CLAUDE_BIN="$BIN_DIR/claude-agent-acp"
    fi
elif [ "$OS" = "windows" ] || [ "$OS" = "mingw" ]; then
    CLAUDE_BIN="$BIN_DIR/claude-agent-acp.cmd"
    cat > "$CLAUDE_BIN" << 'EOF'
@echo off
npx --yes @agentclientprotocol/claude-agent-acp %*
EOF
else
    echo "Unsupported OS for claude-agent-acp: $OS"
    exit 1
fi

echo "✓ claude-agent-acp bundled"

echo ""
echo "ACP adapters bundled successfully in $BIN_DIR:"
ls -la "$BIN_DIR"
