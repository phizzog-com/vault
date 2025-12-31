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
      this.settings = settings;
      this.mcpServer = this.createVaultMcpServer();
      this.isInitialized = true;
      console.log('✅ Claude Agent SDK initialized');
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
   * Stream chat with the agent
   * @param {string} userMessage - User's message
   * @param {Array} contextNotes - Optional context notes
   * @yields {Object} - Processed message objects
   */
  async *chat(userMessage, contextNotes = []) {
    // Placeholder - will be implemented in cas-3.x tasks
    console.log('📤 Chat called with:', userMessage);
    yield { type: 'error', error: 'Not yet implemented' };
  }

  /**
   * Process a message from the SDK
   * @param {Object} message - Raw SDK message
   * @returns {Object|null} - Processed message for UI
   */
  processMessage(message) {
    // Placeholder - will be implemented in cas-3.x tasks
    return null;
  }

  /**
   * Build the system prompt with context
   * @param {Array} contextNotes - Notes to include in context
   * @returns {string} - Complete system prompt
   */
  buildSystemPrompt(contextNotes = []) {
    // Placeholder - will be implemented in cas-3.x tasks
    return '';
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
   * Get current settings
   * @returns {Object} - Current settings
   */
  getSettings() {
    return this.settings;
  }
}
