// ClaudeAgentSDK.js - Claude Agent SDK integration wrapper
// Uses @anthropic-ai/claude-agent-sdk for full agent capabilities with MCP tools
console.log('🤖 ClaudeAgentSDK loading...');

import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { invoke } from '@tauri-apps/api/core';
import { markdownUtils } from '../editor/markdown-extensions.js';

export class ClaudeAgentSDK {
  constructor() {
    console.log('🔧 Initializing ClaudeAgentSDK');
    this.settings = null;
    this.mcpServer = null;
    this.abortController = null;
    this.currentModel = 'claude-sonnet-4-5-20250929';
    this.isInitialized = false;
  }

  /**
   * Initialize the SDK with settings
   * @param {Object} settings - Configuration settings including API key
   * @returns {Promise<boolean>} - Success status
   */
  async initialize(settings) {
    console.log('🚀 Initializing Claude Agent SDK...');

    try {
      // Validate required settings
      if (!settings) {
        console.error('❌ No settings provided');
        return false;
      }

      if (!settings.apiKey) {
        console.error('❌ API key is required');
        return false;
      }

      // Store settings
      this.settings = {
        apiKey: settings.apiKey,
        model: settings.model || 'claude-sonnet-4-5-20250929',
        maxTurns: settings.maxTurns || 10,
        systemPromptAddition: settings.systemPromptAddition || '',
        allowedTools: settings.allowedTools || null, // null means all tools allowed
        ...settings
      };

      // Set model
      this.currentModel = this.settings.model;

      // Create MCP server
      this.mcpServer = this.createVaultMcpServer();

      this.isInitialized = true;
      console.log('✅ Claude Agent SDK initialized with model:', this.currentModel);
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Claude Agent SDK:', error);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Create the vault MCP server with all tools
   * @returns {Object} - MCP server instance
   */
  createVaultMcpServer() {
    console.log('🔧 Creating vault MCP server...');

    try {
      const tools = this.createVaultTools();

      const server = createSdkMcpServer({
        name: "vault",
        version: "1.0.0",
        tools
      });

      console.log('✅ Vault MCP server created with', tools.length, 'tools');
      return server;
    } catch (error) {
      console.error('❌ Failed to create vault MCP server:', error);
      throw error;
    }
  }

  /**
   * Create all vault tools for MCP server
   * @returns {Array} - Array of tool definitions
   */
  createVaultTools() {
    return [
      this.createSearchNotesTool(),
      this.createGetNoteTool(),
      this.createGetCurrentNoteTool(),
      this.createListTagsTool(),
      this.createNotesByTagTool(),
      this.createSemanticSearchTool(),
      this.createWriteNoteTool(),
      this.createUpdateNoteTool(),
      this.createAppendToNoteTool(),
      // Additional tools will be added in subsequent tasks
    ];
  }

  /**
   * Create the search_notes tool
   * @returns {Object} - Tool definition
   */
  createSearchNotesTool() {
    return tool(
      "search_notes",
      "Search through notes in the vault by name. Returns matching note names and paths.",
      {
        query: z.string().describe("Search query to match against note names"),
        limit: z.number().optional().default(10).describe("Maximum number of results to return")
      },
      async (args) => {
        console.log('🔍 search_notes called:', args);

        try {
          if (!args.query || args.query.trim() === '') {
            return {
              content: [{ type: "text", text: JSON.stringify({ results: [], message: "Empty query provided" }) }]
            };
          }

          const results = await invoke('searchNotesByName', {
            searchTerm: args.query
          });

          const limitedResults = results.slice(0, args.limit || 10);

          console.log('✅ search_notes found', limitedResults.length, 'results');

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                results: limitedResults,
                total: results.length,
                query: args.query
              })
            }]
          };
        } catch (error) {
          console.error('❌ search_notes error:', error);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ error: error.message || 'Search failed', query: args.query })
            }]
          };
        }
      }
    );
  }

  /**
   * Create the get_note tool
   * @returns {Object} - Tool definition
   */
  createGetNoteTool() {
    return tool(
      "get_note",
      "Read the content of a specific note by its path. Returns the full markdown content.",
      {
        path: z.string().describe("Path to the note file relative to vault root (e.g., 'folder/note.md')")
      },
      async (args) => {
        console.log('📄 get_note called:', args);

        try {
          if (!args.path) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: "Path is required" }) }]
            };
          }

          // Security: Validate path doesn't contain traversal attempts
          if (args.path.includes('..') || args.path.startsWith('/') || args.path.startsWith('\\')) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ error: "Invalid path: Cannot access files outside vault" })
              }]
            };
          }

          const content = await invoke('readFileContent', {
            filePath: args.path
          });

          console.log('✅ get_note read', content.length, 'characters');

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                path: args.path,
                content: content,
                length: content.length
              })
            }]
          };
        } catch (error) {
          console.error('❌ get_note error:', error);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ error: error.message || 'Failed to read note', path: args.path })
            }]
          };
        }
      }
    );
  }

  /**
   * Create the get_current_note tool
   * @returns {Object} - Tool definition
   */
  createGetCurrentNoteTool() {
    return tool(
      "get_current_note",
      "Get the content of the note currently open in the editor. Returns the note's path, title, and content.",
      {},
      async () => {
        console.log('📝 get_current_note called');

        try {
          // Access the pane manager to get current note
          if (!window.paneManager) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ error: "No editor available", hasNote: false })
              }]
            };
          }

          const activeTabManager = window.paneManager.getActiveTabManager();
          if (!activeTabManager) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ error: "No active tab manager", hasNote: false })
              }]
            };
          }

          const activeTab = activeTabManager.getActiveTab();
          if (!activeTab) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ message: "No note is currently open", hasNote: false })
              }]
            };
          }

          const title = activeTab.title || 'Untitled';
          const filePath = activeTab.filePath || '';

          // Try to get content from editor
          let content = '';
          if (activeTab.editor) {
            if (typeof activeTab.editor.getContent === 'function') {
              content = activeTab.editor.getContent();
            } else if (activeTab.editor.view) {
              content = activeTab.editor.view.state.doc.toString();
            } else if (activeTab.editor.state) {
              content = activeTab.editor.state.doc.toString();
            }
          }

          // Fallback to reading from file if no editor content
          if ((!content || content.length === 0) && filePath) {
            try {
              content = await invoke('readFileContent', { filePath });
            } catch {
              content = '';
            }
          }

          console.log('✅ get_current_note:', title, content.length, 'chars');

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                hasNote: true,
                title,
                path: filePath,
                content,
                length: content.length
              })
            }]
          };
        } catch (error) {
          console.error('❌ get_current_note error:', error);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ error: error.message || 'Failed to get current note', hasNote: false })
            }]
          };
        }
      }
    );
  }

  /**
   * Create the list_tags tool
   * @returns {Object} - Tool definition
   */
  createListTagsTool() {
    return tool(
      "list_tags",
      "List all unique tags used across all notes in the vault. Returns tags with their usage counts.",
      {},
      async () => {
        console.log('🏷️ list_tags called');

        try {
          // Get file tree to access all markdown files
          const fileTree = await invoke('getFileTree');

          if (!fileTree || !fileTree.files) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ tags: [], total: 0, message: "No files found in vault" })
              }]
            };
          }

          const tagCounts = new Map();

          // Process each markdown file
          for (const file of fileTree.files) {
            if (!file.path.endsWith('.md')) continue;

            try {
              const content = await invoke('readFileContent', { filePath: file.path });
              const tags = markdownUtils.extractTags(content);

              for (const tagInfo of tags) {
                const tag = tagInfo.tag;
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
              }
            } catch {
              // Skip files that can't be read
            }
          }

          // Convert to sorted array
          const tagsArray = Array.from(tagCounts.entries())
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);

          console.log('✅ list_tags found', tagsArray.length, 'unique tags');

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                tags: tagsArray,
                total: tagsArray.length
              })
            }]
          };
        } catch (error) {
          console.error('❌ list_tags error:', error);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ error: error.message || 'Failed to list tags' })
            }]
          };
        }
      }
    );
  }

  /**
   * Create the notes_by_tag tool
   * @returns {Object} - Tool definition
   */
  createNotesByTagTool() {
    return tool(
      "notes_by_tag",
      "Find all notes containing a specific tag. Returns note paths and titles.",
      {
        tag: z.string().describe("Tag to search for (with or without # prefix)")
      },
      async (args) => {
        console.log('🏷️ notes_by_tag called:', args);

        try {
          // Strip # prefix if present
          let searchTag = args.tag;
          if (searchTag.startsWith('#')) {
            searchTag = searchTag.slice(1);
          }

          if (!searchTag) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ error: "Tag is required", notes: [] })
              }]
            };
          }

          // Get file tree
          const fileTree = await invoke('getFileTree');

          if (!fileTree || !fileTree.files) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ notes: [], tag: searchTag, message: "No files found in vault" })
              }]
            };
          }

          const matchingNotes = [];

          // Search each markdown file for the tag
          for (const file of fileTree.files) {
            if (!file.path.endsWith('.md')) continue;

            try {
              const content = await invoke('readFileContent', { filePath: file.path });
              const tags = markdownUtils.extractTags(content);

              const hasTag = tags.some(t => t.tag.toLowerCase() === searchTag.toLowerCase());

              if (hasTag) {
                matchingNotes.push({
                  path: file.path,
                  title: file.name.replace('.md', ''),
                  allTags: tags.map(t => t.tag)
                });
              }
            } catch {
              // Skip files that can't be read
            }
          }

          console.log('✅ notes_by_tag found', matchingNotes.length, 'notes with tag:', searchTag);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                notes: matchingNotes,
                tag: searchTag,
                count: matchingNotes.length
              })
            }]
          };
        } catch (error) {
          console.error('❌ notes_by_tag error:', error);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ error: error.message || 'Failed to search by tag', tag: args.tag })
            }]
          };
        }
      }
    );
  }

  /**
   * Create the semantic_search tool (PACASDB Premium)
   * @returns {Object} - Tool definition
   */
  createSemanticSearchTool() {
    return tool(
      "semantic_search",
      "Search notes using semantic similarity or hybrid search. Requires PACASDB Premium. Returns notes ranked by relevance.",
      {
        query: z.string().describe("Natural language search query"),
        searchType: z.enum(["semantic", "hybrid", "keyword"]).default("hybrid").describe("Search type: semantic (meaning), keyword (text match), or hybrid (both)"),
        limit: z.number().optional().default(10).describe("Maximum number of results")
      },
      async (args) => {
        console.log('🧠 semantic_search called:', args);

        try {
          // Check premium status first
          const entitlementManager = window.entitlementManager;
          if (!entitlementManager || !entitlementManager.isPremiumEnabled()) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  error: "PACASDB Premium required",
                  message: "Semantic search requires PACASDB Premium. Use search_notes for basic name matching, or upgrade to Premium for semantic search capabilities.",
                  isPremium: false
                })
              }]
            };
          }

          // Check PACASDB client connection
          const client = window.pacasdbClient;
          if (!client || !client.isConnected()) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  error: "PACASDB not connected",
                  message: "Premium is enabled but PACASDB server is not connected. Please check your PACASDB server settings.",
                  isPremium: true,
                  connected: false
                })
              }]
            };
          }

          // Build search parameters based on search type
          const searchParams = {
            k: args.limit || 10
          };

          if (args.searchType === 'keyword') {
            searchParams.keywords = args.query;
          } else if (args.searchType === 'semantic') {
            searchParams.text = args.query;
          } else {
            // hybrid - use both
            searchParams.text = args.query;
            searchParams.keywords = args.query;
          }

          const results = await client.search(searchParams);

          // Format results for the agent
          const formattedResults = (results || []).map(result => ({
            path: result.metadata?.path || result.metadata?.file || 'unknown',
            title: result.metadata?.title || result.metadata?.file?.replace('.md', '') || 'Untitled',
            score: result.score || 0,
            snippet: result.content?.substring(0, 200) || ''
          }));

          console.log('✅ semantic_search found', formattedResults.length, 'results');

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                results: formattedResults,
                query: args.query,
                searchType: args.searchType,
                count: formattedResults.length,
                isPremium: true,
                connected: true
              })
            }]
          };
        } catch (error) {
          console.error('❌ semantic_search error:', error);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: error.message || 'Semantic search failed',
                query: args.query
              })
            }]
          };
        }
      }
    );
  }

  /**
   * Validate path is safe (no traversal, within vault)
   * @param {string} path - Path to validate
   * @returns {Object} - { valid: boolean, error?: string }
   */
  validatePath(path) {
    if (!path) {
      return { valid: false, error: "Path is required" };
    }
    if (path.includes('..')) {
      return { valid: false, error: "Invalid path: Cannot use '..' for path traversal" };
    }
    if (path.startsWith('/') || path.startsWith('\\')) {
      return { valid: false, error: "Invalid path: Must be relative to vault root" };
    }
    // Ensure it ends with .md
    if (!path.endsWith('.md')) {
      return { valid: false, error: "Invalid path: Must be a markdown file (.md)" };
    }
    return { valid: true };
  }

  /**
   * Create the write_note tool
   * @returns {Object} - Tool definition
   */
  createWriteNoteTool() {
    return tool(
      "write_note",
      "Create a new note at the specified path. Will fail if the file already exists.",
      {
        path: z.string().describe("Path for the new note relative to vault root (e.g., 'folder/new-note.md')"),
        content: z.string().describe("Markdown content for the new note")
      },
      async (args) => {
        console.log('✍️ write_note called:', args.path);

        try {
          const validation = this.validatePath(args.path);
          if (!validation.valid) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: validation.error }) }]
            };
          }

          // Check if file already exists
          try {
            await invoke('readFileContent', { filePath: args.path });
            // If we get here, file exists
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ error: "File already exists", path: args.path, suggestion: "Use update_note to modify existing files" })
              }]
            };
          } catch {
            // File doesn't exist, we can create it
          }

          // Create the file
          await invoke('writeFileContent', {
            filePath: args.path,
            content: args.content
          });

          // Dispatch file-created event to refresh file tree
          window.dispatchEvent(new CustomEvent('file-created', { detail: { path: args.path } }));

          console.log('✅ write_note created:', args.path);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                path: args.path,
                message: `Created note: ${args.path}`,
                length: args.content.length
              })
            }]
          };
        } catch (error) {
          console.error('❌ write_note error:', error);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ error: error.message || 'Failed to create note', path: args.path })
            }]
          };
        }
      }
    );
  }

  /**
   * Create the update_note tool
   * @returns {Object} - Tool definition
   */
  createUpdateNoteTool() {
    return tool(
      "update_note",
      "Update an existing note with new content. Will fail if the file doesn't exist.",
      {
        path: z.string().describe("Path to the note relative to vault root"),
        content: z.string().describe("New markdown content to replace existing content")
      },
      async (args) => {
        console.log('📝 update_note called:', args.path);

        try {
          const validation = this.validatePath(args.path);
          if (!validation.valid) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: validation.error }) }]
            };
          }

          // Check if file exists
          try {
            await invoke('readFileContent', { filePath: args.path });
          } catch {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ error: "File not found", path: args.path, suggestion: "Use write_note to create new files" })
              }]
            };
          }

          // Update the file
          await invoke('writeFileContent', {
            filePath: args.path,
            content: args.content
          });

          // Dispatch file-updated event to refresh editor if open
          window.dispatchEvent(new CustomEvent('file-updated', { detail: { path: args.path } }));

          console.log('✅ update_note updated:', args.path);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                path: args.path,
                message: `Updated note: ${args.path}`,
                length: args.content.length
              })
            }]
          };
        } catch (error) {
          console.error('❌ update_note error:', error);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ error: error.message || 'Failed to update note', path: args.path })
            }]
          };
        }
      }
    );
  }

  /**
   * Create the append_to_note tool
   * @returns {Object} - Tool definition
   */
  createAppendToNoteTool() {
    return tool(
      "append_to_note",
      "Append content to the end of an existing note. Preserves existing content.",
      {
        path: z.string().describe("Path to the note relative to vault root"),
        content: z.string().describe("Content to append to the note")
      },
      async (args) => {
        console.log('➕ append_to_note called:', args.path);

        try {
          const validation = this.validatePath(args.path);
          if (!validation.valid) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: validation.error }) }]
            };
          }

          // Read existing content
          let existingContent;
          try {
            existingContent = await invoke('readFileContent', { filePath: args.path });
          } catch {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ error: "File not found", path: args.path, suggestion: "Use write_note to create new files" })
              }]
            };
          }

          // Append new content
          const newContent = existingContent + '\n' + args.content;

          // Write updated content
          await invoke('writeFileContent', {
            filePath: args.path,
            content: newContent
          });

          // Dispatch file-updated event
          window.dispatchEvent(new CustomEvent('file-updated', { detail: { path: args.path } }));

          console.log('✅ append_to_note appended to:', args.path);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                path: args.path,
                message: `Appended to note: ${args.path}`,
                appendedLength: args.content.length,
                totalLength: newContent.length
              })
            }]
          };
        } catch (error) {
          console.error('❌ append_to_note error:', error);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ error: error.message || 'Failed to append to note', path: args.path })
            }]
          };
        }
      }
    );
  }

  /**
   * Get list of allowed tool names for the SDK
   * @returns {Array|undefined} - Array of tool names or undefined for all tools
   */
  getAllowedTools() {
    if (this.settings?.allowedTools) {
      return this.settings.allowedTools;
    }
    // Default: all vault tools allowed
    return [
      "mcp__vault__search_notes",
      "mcp__vault__get_note",
      "mcp__vault__get_current_note",
      "mcp__vault__list_tags",
      "mcp__vault__notes_by_tag",
      "mcp__vault__semantic_search",
      "mcp__vault__write_note",
      "mcp__vault__update_note",
      "mcp__vault__append_to_note",
      "WebSearch"
    ];
  }

  /**
   * Stream chat with the agent
   * @param {string} userMessage - User's message
   * @param {Array} contextNotes - Optional context notes
   * @yields {Object} - Processed message objects
   */
  async *chat(userMessage, contextNotes = []) {
    console.log('📤 Chat called with:', userMessage);
    console.log('📎 With context:', contextNotes.length, 'notes');

    if (!this.isInitialized) {
      yield { type: 'error', error: 'SDK not initialized. Call initialize() first.' };
      return;
    }

    try {
      // Create abort controller for this request
      this.abortController = new AbortController();

      // Build system prompt with context
      const systemPrompt = this.buildSystemPrompt(contextNotes);

      // Create async generator for user input
      async function* generateInput() {
        yield {
          type: "user",
          message: { role: "user", content: userMessage }
        };
      }

      // Call SDK query with options
      const queryOptions = {
        prompt: generateInput(),
        options: {
          model: this.currentModel,
          systemPrompt,
          mcpServers: this.mcpServer ? { vault: this.mcpServer } : undefined,
          allowedTools: this.getAllowedTools(),
          maxTurns: this.settings?.maxTurns || 10,
          includePartialMessages: true,
          signal: this.abortController.signal
        }
      };

      console.log('🔄 Starting SDK query with model:', this.currentModel);

      // Iterate through SDK messages and yield processed events
      for await (const message of query(queryOptions)) {
        const processed = this.processMessage(message);
        if (processed) {
          yield processed;
        }
      }

      console.log('✅ Chat query completed');

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('🛑 Chat query aborted');
        yield { type: 'aborted', message: 'Request was cancelled' };
      } else {
        console.error('❌ Chat error:', error);
        yield { type: 'error', error: error.message || 'Chat query failed' };
      }
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Process a message from the SDK
   * @param {Object} message - Raw SDK message
   * @returns {Object|null} - Processed message for UI
   */
  processMessage(message) {
    if (!message) return null;

    switch (message.type) {
      case 'stream_event':
        // Real-time text streaming event
        return this.handleStreamEvent(message.event);

      case 'assistant':
        // Complete assistant message with content blocks
        return {
          type: 'assistant',
          content: message.message?.content || [],
          role: 'assistant'
        };

      case 'result':
        // Final result with statistics
        return {
          type: 'result',
          success: message.subtype === 'success',
          text: message.result || '',
          cost: message.total_cost_usd,
          usage: message.usage,
          turns: message.num_turns,
          duration: message.duration_ms
        };

      case 'tool_use':
        // Tool invocation
        return {
          type: 'tool_use',
          toolName: message.tool_name || message.name,
          toolInput: message.tool_input || message.input,
          id: message.id
        };

      case 'tool_result':
        // Tool result
        return {
          type: 'tool_result',
          toolName: message.tool_name,
          result: message.result,
          id: message.tool_use_id
        };

      default:
        // Unknown message type - log and return raw
        console.log('📨 Unknown message type:', message.type, message);
        return null;
    }
  }

  /**
   * Handle stream_event messages
   * @param {Object} event - Stream event from SDK
   * @returns {Object|null} - Processed event for UI
   */
  handleStreamEvent(event) {
    if (!event) return null;

    // Handle content_block_delta for text streaming
    if (event.type === 'content_block_delta' && event.delta?.text) {
      return {
        type: 'chunk',
        text: event.delta.text
      };
    }

    // Handle message_start
    if (event.type === 'message_start') {
      return {
        type: 'start',
        model: event.message?.model,
        usage: event.message?.usage
      };
    }

    // Handle message_delta (stop reason, usage)
    if (event.type === 'message_delta') {
      return {
        type: 'delta',
        stopReason: event.delta?.stop_reason,
        usage: event.usage
      };
    }

    // Handle content_block_start for tool use
    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      return {
        type: 'tool_start',
        toolName: event.content_block.name,
        id: event.content_block.id
      };
    }

    return null;
  }

  /**
   * Build the system prompt with context
   * @param {Array} contextNotes - Notes to include in context
   * @returns {string} - Complete system prompt
   */
  buildSystemPrompt(contextNotes = []) {
    const maxNoteLength = 10000; // Truncate notes over 10k chars

    // Base system prompt
    let prompt = `You are a helpful AI assistant integrated into Vault, a note-taking application. You have access to the user's notes and can search, read, create, and modify notes using MCP tools.

Available capabilities:
- Search notes by name or content using search_notes
- Read specific notes using get_note
- Get the currently open note using get_current_note
- List all tags in the vault using list_tags
- Find notes by tag using notes_by_tag
- Perform semantic search using semantic_search (requires PACASDB Premium)
- Create new notes using write_note
- Update existing notes using update_note
- Append to notes using append_to_note
- Search the web for current information using WebSearch

Guidelines:
- When the user refers to "this note" or "the current note", use get_current_note to access it
- Search for relevant notes before answering questions about the user's knowledge base
- When creating or modifying notes, use proper markdown formatting
- Be concise but thorough in your responses
- Respect the user's note organization and naming conventions
`;

    // Add context notes if provided
    if (contextNotes.length > 0) {
      prompt += '\n\n=== CURRENT CONTEXT ===\n';
      prompt += 'The user has the following notes in their current context:\n\n';

      for (const note of contextNotes) {
        const title = note.title || note.name || 'Untitled';
        let content = note.content || '';

        // Truncate long notes
        if (content.length > maxNoteLength) {
          content = content.substring(0, maxNoteLength) + '\n\n[... note truncated due to length ...]';
        }

        prompt += `--- ${title} ---\n${content}\n\n`;
      }

      prompt += '=== END CONTEXT ===\n';
    }

    // Add custom system prompt addition from settings
    if (this.settings?.systemPromptAddition) {
      prompt += '\n' + this.settings.systemPromptAddition;
    }

    return prompt;
  }

  /**
   * Abort the current request
   */
  abort() {
    if (this.abortController) {
      console.log('🛑 Aborting Claude Agent request');
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Switch the model being used
   * @param {string} model - Model identifier
   */
  async switchModel(model) {
    console.log('🔄 Switching model to:', model);

    const validModels = [
      'claude-sonnet-4-5-20250929',
      'claude-opus-4-5-20251101',
      'claude-haiku-3-5-20241022'
    ];

    if (!validModels.includes(model)) {
      throw new Error(`Invalid model: ${model}. Must be one of: ${validModels.join(', ')}`);
    }

    this.currentModel = model;
    console.log('✅ Model switched to:', model);
  }

  /**
   * Get current settings and configuration
   * @returns {Object} - Current configuration including model, maxTurns, allowedTools
   */
  getSettings() {
    return {
      ...this.settings,
      model: this.currentModel,
      maxTurns: this.settings?.maxTurns || 10,
      allowedTools: this.getAllowedTools(),
      isInitialized: this.isInitialized
    };
  }
}
