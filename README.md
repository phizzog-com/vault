# Vault

A local-first, privacy-respecting notes app with AI progressive context integration. Built with Node.js and Rust.

## Features

- **Progressive Context** — Notes, highlights, and tags compound into persistent AI context
- **Local-First Storage** — Plain Markdown files. No lock-in. No tracking. 
- **Multi-Model AI** — OpenAI, Claude, Gemini, Ollama, LM Studio
- **CLI AI Agents** — Integrated Claude Code, Codex, Gemini CLI AI Agents with full vault context and MCP
- **UUID Identity** — Stable note and task identity (UUIDv7) across renames, moves, and sync
- **MCP Native** — Model Context Protocol for AI agent workflows
- **WikiLinks** — `[[note]]` and `[[tid:xxx]]` linking with auto-completion
- **Task Management** — Properties, priorities, view all tasks across notes
- **Plugin System** — Extensible architecture with permission controls
- **Multi-Vault Windows** — Work with multiple vaults simultaneously

## Privacy

**No lock-in. No tracking. No BS.** Plain Markdown files, stored wherever you choose.

Vault makes zero unsolicited network requests.

AI is your choice: Use cloud providers (OpenAI, Claude, Gemini) or stay fully local with Ollama/LM Studio. Vault never sends data without your explicit action.

## Quick Start

**Requirements:** Rust 2021+, Node.js 22+, npm 10+

```bash
git clone https://github.com/vault/vault.git
cd vault
npm install
npm run tauri dev
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+F` | Global search |
| `Cmd+P` | Quick file switcher |
| `Cmd+N` | New note |
| `Cmd+W` | Close tab |
| `Cmd+`` ` | Toggle Chat/Terminal |
| `Cmd+Shift+T` | Task Dashboard |
| `Cmd+Shift+P` | Plugin Hub |
| `[[` | WikiLink autocomplete |

## Tech Stack

- **Backend:** Rust, Tauri v2
- **Frontend:** Vanilla JS, CodeMirror 6, xterm.js
- **Storage:** Local filesystem (Markdown + JSON)
- **AI:** OpenAI-compatible API, Anthropic, Google AI, Ollama, LM Studio

## Documentation

- [User Guide](docs/USER_GUIDE.md)
- [AI Setup](docs/AI_SETUP.md)
- [MCP Configuration](docs/MCP_SETTINGS_EXAMPLE.md)
- [Development Setup](docs/DEVELOPMENT_SETUP.md)
- [Contributing](docs/CONTRIBUTING.md)

## Contributing

- [Report bugs](https://github.com/vault/vault/issues/new?template=bug_report.md)
- [Request features](https://github.com/vault/vault/issues/new?template=feature_request.md)
- Fork and submit PRs

## License

[Apache 2.0](LICENSE)
