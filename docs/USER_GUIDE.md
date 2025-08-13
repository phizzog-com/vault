# Vault Beta Tester Guide

Welcome to the Vault beta! This guide will help you install and start using Vault, your new local-first knowledge management app.

## 📋 What You'll Need

- **macOS computer** (Apple Silicon M1/M2/M3 supported)
- **No additional software required** - everything is included!
- **Windows / Lunux** - supported but not tested yet. 

## 🚀 Quick Installation

### Step 1: Download
1. Follow [Deployment Guide](docs/DEPLOYMENT.md)
2. A new window will open showing the Vault app icon


🎉 **You're ready to start using Vault!**

## 🛠️ For Developers (Building from Source)

If you're building Vault from source instead of using the pre-built installer:

```bash
npm run tauri:dev
```

## 🏠 First Time Setup

### Create Your First Vault
When you first launch Vault, you'll see a welcome screen:

1. **Click "Select Vault Folder"** 
2. **Choose a folder** where you want to store your notes (or create a new one)
3. **Click "Open"** to set up your vault

💡 **Tip**: Choose a folder in your Documents or create a new "Notes" folder - this will contain all your markdown files.

### Your First Note
1. **Press `Cmd+N`** to create a new note
2. **Type a filename** (e.g., "Welcome to Vault")
3. **Click "Create"**
4. **Start writing!** Vault uses Markdown formatting

## ✍️ Writing in Vault

### Live Preview Magic
Vault automatically hides markdown formatting as you type, creating a clean writing experience:

- **Type `**bold text**`** → becomes **bold text** (markers hidden)
- **Type `*italic text*`** → becomes *italic text* (markers hidden)  
- **Type `# Heading`** → becomes a large heading (# hidden)
- **Type `> Quote`** → becomes a styled blockquote (> hidden)

### Smart List Continuation
Vault makes working with lists effortless:

- **Start a list** with `-`, `*`, `+`, or `1.` 
- **Press Enter** at the end of a list item → automatically creates a new bullet
- **Press Enter twice** on an empty bullet → exits list mode
- **Works with numbered lists** → automatically increments numbers
- **Maintains indentation** → nested lists work seamlessly

### AI-First Tags
Vault features an intelligent tag system that enhances AI conversations:

- **Tag Syntax**: Use `#tag` or `#nested/tags` anywhere in your notes
- **Visual Highlighting**: Tags appear with green styling and are clickable
- **AI Context Expansion**: AI automatically detects tags and finds related notes
- **Smart Discovery**: Type "Tell me about machine learning" and AI searches for `#machine-learning`, `#ML`, `#AI` notes
- **Visual Feedback**: Chat shows discovered tags and additional context

### Keyboard Shortcuts

#### File Management
- `Cmd+N` - Create new note
- `Cmd+S` - Save current note (auto-saves every 2 seconds)

#### Formatting
- `Cmd+B` or '**' - **Bold** selected text
- `ii` - *Italic* selected text
- `Cmd+J` - <u>Underline</u> selected text
- `Cmd+H` or '==' - ==Highlight== selected text
- `Cmd+Shift+X` - ~~Strikethrough~~ selected text
- `Cmd+K` - Insert link
- `Cmd+Shift+H` - Generate highlights summary

#### Tags
- `#tag` - Create a simple tag
- `#nested/tags` - Create hierarchical tags
- Click any tag to search for related notes

#### Tabs & Navigation
- `Cmd+Shift+T` - New tab
- `Cmd+W` - Close current tab

#### View Options
- `Cmd+Option+Z` - Toggle zen mode (distraction-free writing)
- `ESC` - Exit zen mode
- `Cmd+Shift+C` - Toggle AI chat panel

## 🖼️ Working with Images

### Paste Images Directly
1. **Copy any image** (from web, screenshot, etc.)
2. **Paste with `Cmd+V`** directly into your note
3. **Images are automatically saved** to a `Files/` folder in your vault
   - Location customizable under 'Editor Settings' menu. 
4. **Clean syntax**: Images show as `![[filename.png]]` in editing mode

### View Images
- **Click any image file** in the sidebar to view it in a tab
- **Images display full-size** with the filename as a heading

## 📄 PDF Viewer & Highlighting

### Opening PDFs
- **Click any PDF file** in the sidebar to open it in a tab
- **PDFs render with full text selection** support
- **Zoom controls** in the toolbar (-, +, fit to page)
- **Navigate pages** with Previous/Next buttons or keyboard shortcuts

### PDF Highlighting
Vault includes a powerful PDF highlighting system:

1. **Select text** in any PDF using your mouse
2. **Press `Cmd+Shift+H`** or click the highlight button to highlight selection
3. **Highlights are persistent** - they're saved and reload when you reopen the PDF
4. **Multiple highlight colors** available (yellow by default)

### Extract Highlights to Notes
Convert all your PDF highlights into a markdown note:

1. **Open a PDF** with existing highlights
2. **Press `Cmd+Shift+E`** or click "Extract Highlights" button
3. **A new markdown note is created** with all highlighted text
4. **Note includes page numbers** and links back to the PDF

### PDF Keyboard Shortcuts
- `Cmd+Shift+H` - Highlight selected text
- `Cmd+Shift+E` - Extract all highlights to markdown
- `Cmd+Z` - Undo last highlight
- `Cmd+Shift+Z` - Redo highlight
- `Delete` - Remove selected highlight

💡 **Pro Tip**: If you have text selected when extracting highlights, it will be highlighted first before extraction!

## 🗂️ Organizing Your Notes

### File Structure
Your vault folder contains:
- **Markdown files** (.md) - your actual notes
- **files/ folder** - pasted images and attachments
- **Subfolders** - organize notes however you like

### Sidebar Navigation
- **Click any file** to open it
- **Folders are collapsible** - click the arrow to expand/collapse
- **Recent files** appear at the top level for quick access

### Tabs System
- **Multiple notes open** - up to 5 tabs per pane
- **Split view** - `Cmd+\` for side-by-side editing
- **Drag tabs** to reorder them
- **• indicator** shows unsaved changes

## 💡 Highlights Summary

### Extract Important Points
Vault can automatically extract all ==highlighted text== from your note:

1. **Highlight important text** using `==text==` syntax or `Cmd+H`
2. **Press `Cmd+Shift+H`** or click the star button next to the + tab button
3. **A summary section** is created at the bottom with all highlights
4. **Perfect for**: study notes, meeting minutes, research papers

## 🤖 AI Chat Assistant

### Getting Started with AI
1. **Press `Cmd+Shift+C`** to open the chat panel
2. **Click the gear icon** to configure your AI provider
3. **Choose a provider** and enter credentials:
   - **OpenAI**: Enter your OpenAI API key
   - **Google Gemini**: Get API key from [Google AI Studio](https://aistudio.google.com/apikey)
   - **Ollama**: No API key needed (runs locally)
   - **LM Studio**: No API key needed (runs locally)
4. **Start chatting!** Your current note is automatically included as context

### AI-First Tags Integration
Vault's revolutionary tag system transforms how AI interacts with your knowledge:

- **Automatic Tag Detection**: AI detects tags in your messages and current context
- **Context Expansion**: AI automatically searches for related tagged notes
- **Smart Inference**: AI infers relevant tags from keywords ("machine learning" → searches for `#ML`, `#AI`)
- **Visual Feedback**: Chat shows discovered tags like "🏷️ Related tags: #project, #research"
- **Connected Conversations**: AI provides more contextually aware responses using tag relationships

**Example Workflow:**
1. Working on a note with `#project/alpha` tag
2. Ask AI: "What's the status of this project?"
3. AI automatically finds notes with `#project/alpha`, `#meetings`, `#deliverables`
4. Response includes context from all related tagged notes

**Try These Commands:**
- "Show me everything about #project/alpha"
- "What meetings did I have about this?"
- "Find my research on machine learning"
- "What's connected to this project?"

💡 **New: Multi-Provider Settings** - Each AI provider now saves its own settings! Switch between providers without losing your configuration. The active provider shows with a green checkmark (✓).

### AI Features
- **Context-aware**: AI sees your current note automatically
- **Add more context**: Click "Add Context" button to include other notes
- **Instant feedback**: "Thinking..." indicator appears immediately when you send a message
- **Real-time responses**: Streaming responses show content as it's generated
- **Copy responses**: Click the copy button on any AI message
- **Export chats**: Click the ⬇️ button to save conversations to "Chat History" folder
- **New chat**: Click the + button to start fresh (clears current conversation)
- **Tool integration**: AI can automatically search files, analyze content, and perform actions

💡 **Important**: Chat history persists between sessions but is cleared when you click "New Chat". Export important conversations to save them permanently!

### AI Provider Setup

#### OpenAI
1. **Get API Key**: Visit [platform.openai.com](https://platform.openai.com/api-keys)
2. **Models**: gpt-4, gpt-3.5-turbo, gpt-4-turbo-preview
3. **Cost**: Pay-per-use (see OpenAI pricing)

#### Google Gemini (NEW!)
1. **Get API Key**: Visit [Google AI Studio](https://aistudio.google.com/apikey)
2. **Models**: gemini-2.0-flash, gemini-2.5-flash, gemini-1.5-pro
3. **Cost**: Free tier available, then pay-per-use
4. **Features**: 
   - Full MCP tools support with function calling
   - Real-time streaming responses
   - Context-aware conversations
   - Advanced reasoning capabilities
5. **Technical Notes**: 
   - Uses OpenAI-compatible endpoint for seamless integration
   - Supports the newer 'tools' format for function calling
   - Optimized for tool execution and response generation

#### Ollama (Local)
1. **Install**: Download from [ollama.ai](https://ollama.ai)
2. **Models**: llama2, mistral, codellama, gemma
3. **Cost**: Free (runs on your computer)
4. **Endpoint**: http://localhost:11434/v1

#### LM Studio (Local)
1. **Install**: Download from [lmstudio.ai](https://lmstudio.ai)
2. **Models**: Any GGUF model from HuggingFace
3. **Cost**: Free (runs on your computer)
4. **Endpoint**: http://localhost:1234/v1

### MCP Tools Integration
Vault's AI assistant can now use tools to help you manage your vault:

- **File Operations**: Create, read, update, and organize your notes
- **Search & Analysis**: Find content, extract highlights, analyze links
- **Tag-Based Search**: AI uses `search_by_tag` tool to find related notes
- **Git Integration**: Commit changes, view history (if your vault uses Git)

**How it works:**
1. **Tools appear automatically** when MCP servers are connected
2. **See available tools** in the chat header (e.g., "15 tools (3 servers)")
3. **Just ask naturally** - the AI will use appropriate tools
4. **Configure servers** via AI Settings → MCP Settings

**Example requests:**
- "Find all notes mentioning productivity"
- "Show me notes tagged with #project/alpha"
- "Create a new note called 'Project Ideas' in the projects folder"
- "Show me all my highlighted text from this week"
- "What notes link to this one?"
- "Find everything about machine learning" (AI searches for `#machine-learning`, `#ML`, `#AI`)

## 📚 Readwise Plugin

### What is Readwise?
Readwise is a service that syncs your highlights from books, articles, and other reading sources into your vault. The plugin automatically imports your reading highlights as markdown notes.

### Setting Up Readwise
1. **Open Plugin Hub**: Click the plugins icon in the sidebar
2. **Install Readwise**: Find and install the Readwise plugin
3. **Configure Settings**:
   - Enter your Readwise API token (get it from [readwise.io/access_token](https://readwise.io/access_token))
   - Choose export folder (default: `{vault}/Readwise/`)
   - Configure sync preferences

### Using Readwise
- **Manual Sync**: Click "Sync Now" in the plugin settings
- **Automatic UUIDs**: All imported files automatically receive unique identifiers for tracking
- **Organized Structure**: Notes are organized by type (Books, Articles, Tweets, etc.)
- **Rich Metadata**: Each note includes author, title, and source information
- **Highlights with Links**: Each highlight links back to the original source

### Note Identity & UUIDs

#### What are UUIDs?
Vault uses UUIDs (Universally Unique Identifiers) to track notes across renames and moves. Each note has a unique ID in its frontmatter that persists regardless of filename changes.

#### Adding UUIDs to Existing Notes
If you have notes without UUIDs (created before UUID support or imported from elsewhere):

1. **Open Developer Console**: Press `Cmd+Option+I`
2. **Run Command**: Type `addUUIDs()` and press Enter
3. **Automatic Processing**: Vault will:
   - Scan all markdown files in your vault
   - Add UUIDs to notes missing them
   - Skip notes that already have UUIDs
   - Show a summary of changes

**Example Frontmatter with UUID:**
```yaml
---
id: 01989ff3-cb20-77f1-be4d-0ab12bc9d0ac
created_at: "2025-08-12T20:23:31.360839+00:00"
updated_at: "2025-08-12T20:23:31.360839+00:00"
---
```

#### Benefits of UUIDs
- **Persistent Links**: Links between notes work even after renaming
- **History Tracking**: Track note evolution over time
- **Sync Safety**: Better synchronization across devices
- **Plugin Compatibility**: Enhanced compatibility with graph and linking plugins

## 📤 Export Your Work

### Export Formats
Vault can export your notes to multiple formats:

- **PDF**: High-quality PDF with images
- **HTML**: Clean HTML with embedded images  
- **Word**: Editable .doc format

### Export Process
1. **Open the note** you want to export
2. **Press the keyboard shortcut** or use the editor menu (☰)
3. **Choose save location** and filename
4. **Click Save** - your export is ready!

## 🎯 Tips for Beta Testing

### What to Try
- **Create different types of notes**: meeting notes, project plans, daily journals
- **Test formatting**: headings, lists, quotes, code blocks, tables
- **Test list features**: Try auto-continuation with -, *, +, and numbered lists
- **Try images**: paste screenshots, photos, diagrams
- **Use split view**: compare notes side-by-side
- **Export functionality**: PDF for sharing, Word for collaboration
- **Highlights summary**: Use ==highlights== and generate summaries
- **AI chat**: Ask questions about your notes, get writing help
- **PDF features**: Open PDFs, highlight important text, extract highlights to notes
- **Research workflow**: Highlight key passages in PDFs and convert to study notes
- **AI-First Tags**: Create notes with `#project/alpha`, `#meetings`, `#research` tags
- **Tag-Based AI Chat**: Ask "What do I know about project alpha?" and watch AI find related notes
- **Smart Context**: Notice how AI automatically includes related tagged notes in responses
- **Tag Discovery**: Try asking about topics and see AI infer relevant tags

### What to Report
Please let us know about:
- **Crashes or freezes** - when and what you were doing
- **Formatting issues** - text that doesn't display correctly
- **Save problems** - notes not saving properly
- **Performance issues** - slow typing, lag, etc.
- **Feature requests** - what would make Vault better for you?

### Performance Notes
- **Auto-save**: Notes save automatically every 2 seconds
- **Memory efficient**: Vault uses minimal system resources with proper cleanup
- **Fast startup**: Should launch in under 2 seconds
- **Stability**: Fixed critical memory leaks and improved crash prevention
- **Performance monitoring**: Debug tools available for troubleshooting (`window.perfReport()` in browser console)

## 🔧 Troubleshooting

### App Won't Open
**Issue**: "Cannot open because Apple cannot check it"
**Solution**: Right-click Vault → Open → Open (only needed once)

### Files Not Saving
**Issue**: Changes seem lost
**Check**: Look for • indicator in tab - means unsaved changes
**Solution**: Press `Cmd+S` to force save

### Images Not Displaying
**Issue**: Pasted images show as broken links
**Check**: Make sure you're pasting into a saved note (not "Untitled")
**Solution**: Save the note first (`Cmd+S`), then paste images

### Slow Performance
**Issue**: Typing feels laggy
**Cause**: Very large notes (10,000+ words) may slow down
**Solution**: Break large notes into smaller files

### Settings Not Saving
**Issue**: API keys or preferences reset after restart
**Check**: Ensure Vault has write permissions to settings folder
**Solution**: Check folder permissions (see Data Storage section)

### Can't Find Vault on New Computer
**Issue**: Vault shows welcome screen instead of your notes
**Cause**: Vault path differs between computers
**Solution**: Click "Select Vault Folder" and choose your notes folder

### AI Chat Issues
**Issue**: "Thinking..." appears but no response comes back
**Cause**: API configuration or network issues
**Solutions**: 
- Check your API key is valid and has credit/quota
- Verify your internet connection
- Try a different AI provider (OpenAI, Gemini, Ollama)
- Check the browser console for error messages

**Issue**: MCP tools not working with AI
**Cause**: Server connection or configuration issues
**Solutions**:
- Go to AI Settings → MCP Settings to check server status
- Look for "connected" status indicators (green dots)
- Restart disconnected servers
- Check that your AI provider supports function calling

## 📞 Getting Help

### During Beta Period
- **Email**: [info@phizzog.com]
- **What to include**: 
  - What you were doing when the issue occurred
  - Screenshot if visual problem
  - Operating system version
  - Steps to reproduce the problem

### Quick Debug Info
To help us debug issues:
1. **Open Activity Monitor**
2. **Find "Vault" process**
3. **Note memory usage and CPU %**
4. **Include this info in bug reports**



---

## Welcome to Vault! 🎉

Thank you for being a beta tester. Your feedback will help make Vault the best knowledge management app possible.

**Happy note-taking!** ✍️

---

*This guide covers Vault v0.1.0 beta with latest updates through 2025-08-12. Features and shortcuts may change in future versions.*