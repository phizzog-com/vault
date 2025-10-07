# Vault

**Fast, private, and beautiful open-source notes app with AI-powered contextual knowledge discovery for privacy-conscious professionals**

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
*   **⚡ Living Knowledge Vault:** Local-first, secure, and blazing fast with Tauri v2 + Rust
*   **🪟 Multi-Vault Windows:** Work with multiple knowledge vaults simultaneously in separate windows
*   **🤖 MCP-Native Agent Integration:** Built for the agent future with Model Context Protocol at its core
*   **🏷️ AI-First Tags:** Tags aren't metadata—they're context amplifiers that expand AI's understanding
*   **🎯 Multi-Model Support:** OpenAI, Gemini, Claude, Ollama, LM Studio—all with persistent context
*   **📝 WikiLinks Support:** [[Note linking]] with auto-completion and smart reference updates
*   **🖥️ Plugin System:** Complete plugin management interface with 4-view Hub (Discover, Installed, Permissions, Resources)
*   **📚 Readwise Integration:** Production plugin with automatic UUID support, pagination, and enhanced formatting
*   **🆔 UUID Identity System:** Stable note & task identity with UUIDv7 across renames, moves, and multi-machine sync
*   **✅ Task Management System:** Complete task tracking with UUIDs, properties, TID autocomplete, and multiple views
*   **🖥️ Claude Code CLI Integration:** Embedded with full vault context and MCP support
*   **📅 Calendar & Daily Notes:** Time-based organization with calendar view
*   **🎨 Zen Mode:** Distraction-free writing environment

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
- **Cmd+F** - Global search across all notes
- **Cmd+Shift+F** - Local text search within current note
  - Replace actions: **Alt+Enter** to replace all (hold Cmd/Ctrl: Mod-Alt-Enter), **Alt+J** to replace next (Mod-Alt-J)
- **Cmd+P** - Quick file switcher
- **Cmd+Shift+P** - Open Plugin Hub for plugin management
- **Cmd+Shift+T** - Open Task Dashboard with multiple views
- **Cmd+`** - Toggle between Chat and Terminal modes
- **Cmd+N** - Create new note
- **Cmd+W** - Close current tab
- **[[** - Trigger WikiLink auto-completion
- **[[tid:** - Trigger TID (Task ID) autocomplete for task references

### Multi-Vault Features
- **Multiple Windows** - Work with different vaults simultaneously
- **Vault Isolation** - Each vault maintains separate context
- **Session Restoration** - Remembers open tabs and window positions
- **Cross-Vault Navigation** - Quick switching between vaults

## 🚀 Getting Started (Beta)

Vault is open source and we welcome contributions!

### Prerequisites
- **Rust:** 2021 Edition or later (for building Tauri v2)
- **Node.js:** Version 22 or later
- **npm:** Version 10 or later
- **Platform:** macOS, Windows, or Linux

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

- [User Guide](docs/USER_GUIDE.md) - Complete guide to using Vault's features
- [Quick Start Guide](docs/QUICK_START_GUIDE.md) - Get up and running quickly
- [Development Setup](docs/DEVELOPMENT_SETUP.md) - Set up your development environment
- [Contributing Guide](docs/CONTRIBUTING.md) - How to contribute to Vault
- [Data Storage Guide](docs/DATA_STORAGE.md) - Understanding your vault structure
- [AI Setup Guide](docs/AI_SETUP.md) - Configure AI providers
- [MCP Settings Example](docs/MCP_SETTINGS_EXAMPLE.md) - Model Context Protocol configuration

## 🗺️ The Road to Superhuman Intelligence

### ✅ Recently Shipped
*   **✅ Task UUID System:** Complete task management with UUIDv7 identifiers, TID autocomplete (<50ms), and 8 new Tauri commands
*   **📊 Task Widget:** Consolidated 400-500px sidebar widget with Dashboard, List, Kanban, and Calendar views
*   **🎨 Task Visual Polish:** Project pills (🗂️ light green), priority colors (!low light blue), dark mode support
*   **🆔 UUID Identity System:** Complete note & task identity tracking across all operations
*   **📝 WikiLinks:** Full [[note linking]] and [[tid:xxx]] task linking with auto-completion
*   **📋 Properties Widget:** Smart frontmatter display with field ordering
*   **🎨 Editor UX:** Scroll preservation, smart auto-save, highlight placement
*   **🖥️ Claude Code CLI Integration:** Embedded Claude Code CLI in terminal with MCP support
*   **📄 Frontmatter/Properties Stabilization:** Body-only editing with Properties widget; no raw YAML or spacing issues
*   **🗂️ File Tree UX:** Folder context menu (Delete/Move/Rename/View in Finder); macOS WKWebView DnD restored via synthetic drag-and-drop; drop to vault root by dropping into the file tree area (folders remain listed first, files follow alphabetically)
*   **🧭 TOC Sidebar Fix:** Table of Contents now correctly shows headings from the active editor when the sidebar is opened and when switching widget tabs

### 🚧 Building Now
*   **🧪 Plugin System:** Production deployment of complete plugin architecture
*   **📱 Additional Plugins:** Expanding ecosystem with validated plugin API
*   **🗂️ File Tree DnD:** Drag‑and‑drop move (active diagnostics for macOS WKWebView)

### 🚀 The Horizon
*   **📱 Mobile App:** iOS/Android apps for capturing context on the go
*   **🌐 Web Clipper:** Browser extension for saving web content
*   **🎙️ Voice Notes:** Audio recording with transcription
*   **👥 Collaboration:** Shared vaults and real-time editing
*   **🧠 Context Analytics:** Visualize how your knowledge compounds
*   **🎨 Themes Marketplace:** Custom themes for specific workflows
*   **🔐 E2E Encryption:** End-to-end encryption for cloud sync
*   **🔄 P2P Sync:** Peer-to-peer synchronization 

## 📄 License

Vault is licensed under the [Apache 2.0 License](LICENSE).

---

**Built for the future where human creativity and AI capability unite to achieve the impossible.**
