#!/bin/bash

# Build MCP Servers Script
# Ensures all Rust MCP servers are compiled before the app starts
# Skips building if binaries already exist (use --force to rebuild)

set -e  # Exit on error

FORCE_BUILD=false
if [[ "$1" == "--force" ]]; then
    FORCE_BUILD=true
fi

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

# Build each MCP server
servers=("filesystem-server-rust" "search-server-rust")
binary_names=("mcp-filesystem-server" "mcp-search-server")
failed=()
skipped=()
built=()

for i in "${!servers[@]}"; do
    server="${servers[$i]}"
    BINARY_NAME="${binary_names[$i]}"
    SUFFIXED_BINARY="mcp-servers/$server/target/release/${BINARY_NAME}-${SUFFIX}"

    # Check if already built (suffixed binary exists)
    if [[ "$FORCE_BUILD" == false ]] && [[ -f "$SUFFIXED_BINARY" ]]; then
        skipped+=("$server")
        continue
    fi

    echo "📦 Building $server..."

    # Navigate to server directory
    cd "mcp-servers/$server" || { echo "❌ Failed to enter $server directory"; exit 1; }

    # Build the server
    cargo build --release || { echo "❌ Failed to build $server"; failed+=("$server"); cd - > /dev/null; continue; }

    # Create the suffixed binary for Tauri
    if [ -f "target/release/$BINARY_NAME" ]; then
        rm -f "target/release/${BINARY_NAME}-${SUFFIX}"
        cp "target/release/$BINARY_NAME" "target/release/${BINARY_NAME}-${SUFFIX}"

        if [ -f "target/release/${BINARY_NAME}-${SUFFIX}" ]; then
            built+=("$server")
        else
            echo "  ❌ Failed to create ${BINARY_NAME}-${SUFFIX}"
            failed+=("$server")
        fi
    else
        echo "  ❌ Binary not found: target/release/$BINARY_NAME"
        failed+=("$server")
    fi

    cd - > /dev/null
done

# Summary
if [ ${#failed[@]} -gt 0 ]; then
    echo "❌ Failed to build: ${failed[*]}"
    exit 1
fi

if [ ${#built[@]} -gt 0 ]; then
    echo "✅ Built: ${built[*]}"
fi

if [ ${#skipped[@]} -gt 0 ]; then
    echo "⏭️  Skipped (already built): ${skipped[*]}"
fi

if [ ${#built[@]} -eq 0 ] && [ ${#skipped[@]} -eq ${#servers[@]} ]; then
    echo "✅ All MCP servers already built"
else
    echo "🎉 MCP servers ready!"
fi