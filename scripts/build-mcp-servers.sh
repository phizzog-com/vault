#!/bin/bash

# Build MCP Servers Script
# Ensures all Rust MCP servers are compiled before the app starts

set -e  # Exit on error

echo "🔨 Building MCP servers..."

# Check if cargo is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Cargo (Rust) is not installed!"
    echo "Please install Rust from https://rustup.rs/"
    exit 1
fi

# Detect platform for Tauri
if [[ "$OSTYPE" == "darwin"* ]]; then
    if [[ $(uname -m) == "arm64" ]]; then
        SUFFIX="aarch64-apple-darwin"
    else
        SUFFIX="x86_64-apple-darwin"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    SUFFIX="x86_64-unknown-linux-gnu"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    SUFFIX="x86_64-pc-windows-msvc"
else
    echo "⚠️  Unknown platform, using default suffix"
    SUFFIX="unknown"
fi

echo "🎯 Platform detected: $SUFFIX"

# Build each MCP server
servers=("filesystem-server-rust" "search-server-rust" "git-server-rust")
failed=()

for server in "${servers[@]}"; do
    echo ""
    echo "📦 Building $server..."
    
    # Navigate to server directory
    cd "mcp-servers/$server" || { echo "❌ Failed to enter $server directory"; exit 1; }
    
    # Build the server
    cargo build --release || { echo "❌ Failed to build $server"; failed+=("$server"); cd - > /dev/null; continue; }
    
    # Determine the binary name based on the server
    case "$server" in
        "filesystem-server-rust")
            BINARY_NAME="mcp-filesystem-server"
            ;;
        "search-server-rust")
            BINARY_NAME="mcp-search-server"
            ;;
        "git-server-rust")
            BINARY_NAME="mcp-git-server"
            ;;
        *)
            echo "❌ Unknown server: $server"
            cd - > /dev/null
            continue
            ;;
    esac
    
    # Create the suffixed binary for Tauri
    if [ -f "target/release/$BINARY_NAME" ]; then
        echo "  ✓ Found binary: $BINARY_NAME"
        
        # Remove any existing file/symlink
        rm -f "target/release/${BINARY_NAME}-${SUFFIX}"
        
        # Create actual copy with suffix
        cp "target/release/$BINARY_NAME" "target/release/${BINARY_NAME}-${SUFFIX}"
        
        if [ -f "target/release/${BINARY_NAME}-${SUFFIX}" ]; then
            echo "  ✓ Created: ${BINARY_NAME}-${SUFFIX}"
            ls -lh "target/release/${BINARY_NAME}-${SUFFIX}" | awk '{print "  Size: " $5}'
        else
            echo "  ❌ Failed to create ${BINARY_NAME}-${SUFFIX}"
            failed+=("$server")
        fi
    else
        echo "  ❌ Binary not found: target/release/$BINARY_NAME"
        failed+=("$server")
    fi
    
    echo "✅ $server processed"
    cd - > /dev/null
done

if [ ${#failed[@]} -gt 0 ]; then
    echo "❌ Failed to build: ${failed[*]}"
    exit 1
fi

echo "🎉 All MCP servers built successfully!"