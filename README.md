# Vault

**Secure-first notes context engine that turns your knowledge into AI superpowers.**

Vault is more than an app—it's the platform for the next evolution of human capability. The human-AI bridge where your domain knowledge becomes the foundation for achieving superhuman intelligence.

## Not another notes app. The missing context layer. 

For decades, we've been sold the same promise: organize your notes better, and you'll think better. Notion, Obsidian, Roam Research—they all ask YOU to do the work. Tag everything. Link everything. Maintain everything. Build your "second brain" brick by brick.. Too much friction!

Here's the breakthrough: Vault progressively synthesizes your knowledge into a living intelligence context layer from your notes, highlights, and connections. Every document strengthens the bridge between your expertise and AI's capabilities. Write about a bug you solved, highlight a key insight from research, tag a pattern you've noticed—Vault transforms these into context that amplifies AI output by 1000x. No generic fluffy responses.. Vault outputs feel like an AI Agent that's been working with you for years.

## 💾 Data Philosophy

Secure by Design: No Cloud. No Tracking. No BS. Every note stays local as plain Markdown. Total control, total privacy.

Your context vault is yours. Forever. No lock-in, no proprietary formats.

---

## 🛠️ The Context Engine Stack

*   **🔮 Progressive Context Synthesis:** Every note, highlight, and tag compounds into deeper AI understanding
*   **📄 Universal Ingestion:** PDFs, images, code, markdown—everything becomes context
*   **⚡ Living Knowledge Vault:** Local-first, secure, and blazing fast with Tauri + Rust
*   **🪟 Multi-Vault Windows:** Work with multiple knowledge vaults simultaneously in separate windows
*   **🤖 MCP-Native Agent Integration:** Built for the agent future with Model Context Protocol at its core
*   **🏷️ AI-First Tags:** Tags aren't metadata—they're context amplifiers that expand AI's understanding
*   **🎯 Multi-Model Support:** OpenAI, Gemini, Ollama, LM Studio—all with persistent context
*   **🖥️ Plugin System:** Complete plugin management interface with 4-view Hub (Discover, Installed, Permissions, Resources)
*   **📚 Readwise Plugin Integration:** Complete production plugin with API pagination, content organization, and enhanced markdown formatting
*   **🆔 UUID Identity System:** Production-ready note identity system maintaining stable note identity across renames, moves, and multi-machine synchronization
*   **📋 Frontmatter Properties Widget:** Properties widget with clean YAML frontmatter display
*   **🖥️ Claude Code CLI Integration:** Embedded terminal with full vault context and MCP integration

## ⚡ What Makes This Different

**ChatGPT/Claude:** Start from zero every conversation. You explain context again and again.
- **Vault:** Every conversation builds on your entire knowledge history. AI already knows your patterns.

**Notion AI:** Operates on one document at a time. Can't see connections.
- **Vault:** Traverses your entire knowledge graph. Finds patterns across months of thinking.

**Obsidian + AI Plugin:** You manually select what context to share. Static embeddings
- **Vault:** Progressive context synthesis. Your highlights and tags automatically expand AI's understanding.

**Cursor/Copilot:** Sees your code, not your reasoning.
- **Vault:** Captures the WHY behind your decisions, making AI suggestions align with your architectural philosophy.

## ⌨️ Keyboard Shortcuts

### Essential Shortcuts
- **Cmd+F** - Global search across all notes (semantic + keyword hybrid search)
- **Cmd+Shift+F** - Local text search within current note
- **Cmd+Shift+P** - Open Plugin Hub for plugin management
- **Cmd+`** - Toggle between Chat and CLI modes
- **Cmd+N** - Create new note
- **Cmd+W** - Close current tab

### Multi-Vault Features
- **Multiple Windows** - Work with different vaults simultaneously
- **Automatic Sync** - Knowledge graph and semantic search activate automatically on vault open
- **Vault Isolation** - Each vault maintains separate context and search indices

## 🚀 Getting Started (Beta)

Vault is open source and we welcome contributions!

### Prerequisites
- **Rust:** Required for building the Tauri app
- **Node.js:** Version 22 or later
- **npm:** Version 10 or later

### Quick Start

```bash
# Clone the repository
git clone https://github.com/vault/vault.git
cd vault

# Cargo for Rust must be installed
which cargo

# If not installed, use following to install Rust which includes Cargo
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Make Cargo available in the current shell:
source "$HOME/.cargo/env"

# Verify Cargo is available:
cargo --version

# Verify Node version 22 or later and NPM version 10 or later are installed: 
node --version && npm --version

# Install dependencies
npm install

# Build MCP servers (required for first run)
chmod +x scripts/build-mcp-servers.sh
./scripts/build-mcp-servers.sh

# Run the development server
npm run tauri dev
```


**App Settings:** Stored in your system's app directory:
- **macOS:** `~/Library/Application Support/com.vault.app/`
- **Windows:** `C:\Users\{username}\AppData\Roaming\com.vault.app\`
- **Linux:** `~/.config/com.vault.app/`

### Contributing

Join us in building the future of human-AI collaboration:

*   **🐛 Report Bugs:** [Open an issue](https://github.com/vault/vault/issues/new?template=bug_report.md)
*   **💡 Request Features:** [Share your ideas](https://github.com/vault/vault/issues/new?template=feature_request.md)
*   **🧑‍💻 Submit Code:** Fork, build, and open a PR

## 📚 Documentation

- [Quick Start Guide](docs/QUICK_START_GUIDE.md) - Get up and running with Vault quickly
- [User Guide](docs/USER_GUIDE.md) - Complete guide to using Vault's features including multi-vault windows
- [AI Setup](docs/AI_SETUP.md) - Configure AI models and integrations
- [MCP Settings Example](docs/MCP_SETTINGS_EXAMPLE.md) - Model Context Protocol configuration examples
- [Data Storage Guide](docs/DATA_STORAGE.md) - Understanding your context vault structure
- [Contributing](docs/CONTRIBUTING.md) - Guidelines for contributing to Vault

## 🗺️ The Road to Superhuman Intelligence

### 🚧 Building Now
*   **🧪 Production Deployment:** Final validation and deployment preparation for complete plugin system
*   **📱 Additional Plugins:** Development of next production plugins using validated architecture

### 🚀 The Horizon
*   **📱 Mobile Context:** iOS app for capturing context on the go
*   **🧠 Context Analytics:** Visualize how your knowledge compounds
*   **🖥️ Vault Themes Marketplace:** Purpose built theme templates for specific functions like research, projects, etc. 

## 📄 License

Vault is licensed under the [Apache 2.0 License](LICENSE).

---

**Built for the future where human creativity and AI capability unite to achieve the impossible.**