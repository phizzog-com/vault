# Development Setup Guide

This guide helps you set up Vault for development from a fresh clone.

## Prerequisites

- Node.js 18+ and npm
- Rust and Cargo (install from [rustup.rs](https://rustup.rs))
- Tauri CLI (`npm install -g @tauri-apps/cli`)
- macOS, Windows, or Linux

## Quick Setup

### 1. Clone the Repository
```bash
git clone https://github.com/phizzog-com/vault.git
cd vault
```

### 2. Install Dependencies and Build MCP Servers
```bash
# Install npm dependencies
npm install

# Build MCP servers (required for first run)
chmod +x scripts/build-mcp-servers.sh
./scripts/build-mcp-servers.sh
```

This will:
- Install all npm dependencies
- Build all MCP servers with proper architecture suffixes
- Prepare the environment for development

### 3. Start Development
```bash
npm run tauri dev
```

## Manual Setup (Alternative)

If you prefer to set up manually or the script doesn't work:

### 1. Install Dependencies
```bash
npm install
```

### 2. Build MCP Servers
The app requires three MCP (Model Context Protocol) servers to be built:

```bash
# Build filesystem server
cd mcp-servers/filesystem-server-rust
cargo build --release
cp target/release/mcp-filesystem-server target/release/mcp-filesystem-server-aarch64-apple-darwin
cd ../..

# Build search server
cd mcp-servers/search-server-rust
cargo build --release
cp target/release/mcp-search-server target/release/mcp-search-server-aarch64-apple-darwin
cd ../..

# Build git server
cd mcp-servers/git-server-rust
cargo build --release
cp target/release/mcp-git-server target/release/mcp-git-server-aarch64-apple-darwin
cd ../..
```

Note: Replace `aarch64-apple-darwin` with your platform:
- Apple Silicon Mac: `aarch64-apple-darwin`
- Intel Mac: `x86_64-apple-darwin`
- Windows: `x86_64-pc-windows-msvc`
- Linux: `x86_64-unknown-linux-gnu`

### 3. Run Development Mode
```bash
npm run tauri dev
```

## Common Issues

### "resource path doesn't exist" Error
**Problem**: MCP server binaries are missing
**Solution**: Run the setup script or build MCP servers manually (see above)

### Rust/Cargo Not Found
**Problem**: Rust toolchain not installed
**Solution**: Install Rust from [rustup.rs](https://rustup.rs)

### Permission Denied on macOS
**Problem**: Script not executable
**Solution**: Run `chmod +x setup-fresh.sh`

### Build Fails on Windows
**Problem**: Different binary naming conventions
**Solution**: Ensure you're using the correct platform suffix for your system

## Project Structure

```
vault/
├── src/                    # Frontend source code
├── src-tauri/             # Rust backend code
├── mcp-servers/           # MCP server implementations
│   ├── filesystem-server-rust/
│   ├── search-server-rust/
│   └── git-server-rust/
├── docs/                  # Documentation
├── package.json           # Node dependencies
└── setup-fresh.sh         # Setup script
```

## Development Commands

- `npm run tauri dev` - Start development server with hot reload
- `npm run tauri build` - Build production application
- `npm run build` - Build frontend only
- `npm run lint` - Run linter
- `npm run test` - Run tests

## Next Steps

After successful setup:
1. Open the app and create/select a vault folder
2. Try creating notes and using features
3. Check the [User Guide](USER_GUIDE.md) for feature documentation
4. Submit issues or PRs on [GitHub](https://github.com/phizzog-com/vault)