// ClaudeAgentSDK.js - Claude Agent SDK integration wrapper
// Uses @anthropic-ai/claude-agent-sdk for full agent capabilities with MCP tools
console.log('🤖 ClaudeAgentSDK loading...');

import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { invoke } from '@tauri-apps/api/core';

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
