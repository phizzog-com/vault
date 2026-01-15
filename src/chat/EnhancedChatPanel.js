// EnhancedChatPanel.js - Enhanced chat panel with multi-provider AI support
console.log('💬 Enhanced ChatPanel loading...');

import { ChatInterface } from './ChatInterface.js';
import { ClaudeAuth } from './ClaudeAuth.js';
import { ContextManager } from './ContextManager.js';
import { ChatPersistence } from './ChatPersistence.js';
import { OpenAISDK } from './OpenAISDK.js';
import { GeminiSDK } from './GeminiSDK.js';
import { BedrockClaudeSDK } from './BedrockClaudeSDK.js';
import { AISettingsPanel } from '../settings/AISettingsPanel.js';
import { ModeToggle } from '../components/ModeToggle.js';
import { CLIContainer } from '../cli/CLIContainer.js';
import { XTermContainer } from '../cli/XTermContainer.js';

import { mcpManager } from '../mcp/MCPManager.js';
import { mcpToolHandler } from '../mcp/MCPToolHandler.js';
import { gemmaPromptToolCalling } from './GemmaPromptToolCalling.js';
import { tagContextExpander } from './TagContextExpander.js';
import { ClaudeAgentSDK } from './ClaudeAgentSDK.js';
import { AgentCostDisplay } from '../components/AgentCostDisplay.js';

// Import Tauri API
import { invoke } from '@tauri-apps/api/core';

export class EnhancedChatPanel {
    constructor() {
        console.log('🔧 Initializing Enhanced ChatPanel');
        this.container = null;
        this.isAuthenticated = false;
        // Initialize visibility from saved state to prevent state mismatch
        this.isVisible = localStorage.getItem('gaimplan-chat-visible') === 'true';
        this.width = 350;
        this.minWidth = 280;
        this.maxWidth = 600;
        
        // AI Provider Management
        this.currentProvider = 'openai'; // Default provider
        this.providers = {
            openai: {
                name: 'OpenAI/Custom',
                sdk: null,
                configured: false,
                status: 'unknown'
            },
            gemini: {
                name: 'Google Gemini',
                sdk: null,
                configured: false,
                status: 'unknown'
            },
            bedrock: {
                name: 'Amazon Bedrock (Claude)',
                sdk: null,
                configured: false,
                status: 'unknown'
            },
            claudeAgent: {
                name: 'Claude',
                sdk: null,
                configured: false,
                status: 'unknown'
            }
        };
        
        // Components
        this.auth = null;
        this.interface = null;
        this.contextManager = null;
        this.persistence = null;
        this.settingsPanel = null;
        this.showingSettings = false;
        this.costDisplay = null; // AgentCostDisplay for Claude Agent
        
        // Resize state
        this.isResizing = false;
        
        // Mode management
        this.currentMode = localStorage.getItem('gaimplan-chat-mode') || 'chat';
        this.modeToggle = null;
        this.cliContainer = null;
        this.isBuildingCLI = false;
        this.startX = 0;
        this.startWidth = 0;
        
        // Vault listener
        this.vaultOpenedListener = null;

        // Context sizing
        this.contextCharLimit = 8000; // default until settings load
    }

    updateContextCharLimit(settings) {
        const DEFAULT_LIMIT = 8000;
        const MAX_LIMIT = 500000; // guardrail to avoid excessive payloads
        const CHARS_PER_TOKEN_ESTIMATE = 4;

        if (!settings) {
            this.contextCharLimit = DEFAULT_LIMIT;
            return;
        }

        const maxTokensRaw = settings.max_tokens ?? settings.maxTokens;
        const maxTokens = Number(maxTokensRaw);

        if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
            this.contextCharLimit = DEFAULT_LIMIT;
            return;
        }

        const computed = Math.floor(maxTokens * CHARS_PER_TOKEN_ESTIMATE);
        const clamped = Math.min(Math.max(computed, DEFAULT_LIMIT), MAX_LIMIT);

        this.contextCharLimit = clamped;
        console.log(`🧠 Context character limit set to ${this.contextCharLimit} (tokens: ${maxTokens})`);
    }

    getContextCharLimit() {
        if (!this.contextCharLimit) {
            const provider = this.providers?.[this.currentProvider];
            const providerSettings = provider?.sdk?.getSettings?.();
            this.updateContextCharLimit(providerSettings);
        }

        return this.contextCharLimit || 8000;
    }
    
    async mount(parentElement) {
        console.log('📌 Mounting Enhanced ChatPanel');
        
        // Create main container (fills the right sidebar)
        this.container = document.createElement('div');
        this.container.className = `chat-panel enhanced right-sidebar-panel ${this.currentMode === 'cli' ? 'cli-mode' : ''}`;
        this.container.style.height = '100%';
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        
        // Create content wrapper
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'chat-content-wrapper';
        
        // Initialize components
        this.auth = new ClaudeAuth();
        this.interface = new ChatInterface();
        this.contextManager = new ContextManager();
        this.persistence = new ChatPersistence();
        this.settingsPanel = new AISettingsPanel();
        
        // Initialize SDKs
        this.providers.openai.sdk = new OpenAISDK();
        this.providers.gemini.sdk = new GeminiSDK();
        this.providers.bedrock.sdk = new BedrockClaudeSDK();
        this.providers.claudeAgent.sdk = new ClaudeAgentSDK();
        
        await this.initializeProviders();
        
        // Set up authentication callback
        this.auth.onAuthStateChanged = (authenticated) => {
            console.log('🔐 Auth state changed:', authenticated);
            this.isAuthenticated = authenticated;
            this.updateUI();
        };
        
        // Set up message send callback
        this.interface.onSendMessage = async (message) => {
            console.log('📤 Sending message via', this.currentProvider);
            await this.handleSendMessage(message);
        };
        
        // Set up context change callback
        this.contextManager.onContextChanged = (context) => {
            console.log('📎 Context changed:', context);
            this.interface.updateContext(context);
        };
        
        // Build initial UI
        this.buildUI(contentWrapper);
        
        // Assemble container (no resize handle for right sidebar)
        this.container.appendChild(contentWrapper);
        parentElement.appendChild(this.container);
        
        // Load saved settings
        await this.loadSavedProvider();
        
        // Check authentication status
        this.auth.checkAuthStatus();
        
        // Set up vault change listener
        this.setupVaultListener();
        
        // Load chat history
        setTimeout(() => {
            this.loadChatHistory();
        }, 100);
        
        console.log('✅ Enhanced ChatPanel mounted successfully');
    }
    
    async initializeProviders() {
        console.log('🚀 Initializing AI providers...');

        try {
            // Get settings first for all providers
            const settings = await invoke('get_ai_settings');

            // Initialize both SDKs
            const openaiInit = await this.providers.openai.sdk.initialize();
            this.providers.openai.configured = openaiInit;
            this.providers.openai.status = openaiInit ? 'ready' : 'not-configured';

            const geminiInit = await this.providers.gemini.sdk.initialize();
            this.providers.gemini.configured = geminiInit;
            this.providers.gemini.status = geminiInit ? 'ready' : 'not-configured';

            const bedrockInit = await this.providers.bedrock.sdk.initialize();
            this.providers.bedrock.configured = bedrockInit;
            this.providers.bedrock.status = bedrockInit ? 'ready' : 'not-configured';

            // Initialize Claude Agent SDK - get its own settings if claudeAgent is selected
            let claudeAgentApiKey = settings?.api_key;
            let claudeAgentModel = settings?.model || 'claude-sonnet-4-5-20250929';

            // If current provider is claudeAgent, the settings already have the right key
            // Otherwise, try to load Claude Agent specific settings
            if (settings?.provider !== 'claudeAgent') {
                try {
                    const claudeSettings = await invoke('get_ai_settings_for_provider', { provider: 'claudeAgent' });
                    if (claudeSettings?.api_key) {
                        claudeAgentApiKey = claudeSettings.api_key;
                        claudeAgentModel = claudeSettings.model || claudeAgentModel;
                    }
                } catch (e) {
                    console.log('No Claude Agent settings found, using current settings');
                }
            }

            const claudeAgentInit = await this.providers.claudeAgent.sdk.initialize({
                apiKey: claudeAgentApiKey,
                model: claudeAgentModel
            });
            this.providers.claudeAgent.configured = claudeAgentInit;
            this.providers.claudeAgent.status = claudeAgentInit ? 'ready' : 'not-configured';

            // Determine which provider to use based on the endpoint
            this.updateContextCharLimit(settings);
            if (settings?.endpoint?.includes('generativelanguage.googleapis.com')) {
                // Check if the endpoint has the incorrect /openai/ path
                if (settings.endpoint.includes('/openai/')) {
                    console.warn('⚠️ Gemini endpoint incorrectly includes /openai/ path');
                    console.warn('Please update your Gemini endpoint in AI Settings to: https://generativelanguage.googleapis.com/v1beta/');
                    // For now, still use OpenAI SDK which will call the Rust backend
                    this.currentProvider = 'openai';
                } else {
                    this.currentProvider = 'gemini';
                    console.log('🎯 Detected Gemini API endpoint, using Gemini SDK');
                }
            } else if (settings?.endpoint?.includes('/bedrock/')) {
                this.currentProvider = 'bedrock';
                console.log('🎯 Detected Bedrock endpoint, using Bedrock Claude SDK');
            } else if (settings?.endpoint?.includes('amazonaws.com/bedrock')) {
                this.currentProvider = 'bedrock';
                console.log('🎯 Detected Bedrock host, using Bedrock Claude SDK');
            } else if (settings?.provider === 'claudeAgent' || settings?.endpoint?.includes('anthropic.com')) {
                this.currentProvider = 'claudeAgent';
                console.log('🎯 Using Claude Agent SDK');
            } else {
                this.currentProvider = 'openai';
                console.log('🎯 Using OpenAI SDK for endpoint:', settings?.endpoint);
            }
            
        } catch (error) {
            console.warn('Provider initialization failed:', error);
            this.providers.openai.configured = false;
            this.providers.openai.status = 'error';
            this.providers.gemini.configured = false;
            this.providers.gemini.status = 'error';
            this.providers.bedrock.configured = false;
            this.providers.bedrock.status = 'error';
            this.providers.claudeAgent.configured = false;
            this.providers.claudeAgent.status = 'error';
            this.currentProvider = 'openai'; // Fallback to OpenAI
        }

        console.log('Providers initialized:', {
            openai: this.providers.openai.status,
            gemini: this.providers.gemini.status,
            bedrock: this.providers.bedrock.status,
            claudeAgent: this.providers.claudeAgent.status,
            current: this.currentProvider
        });
    }
    
    buildUI(wrapper) {
        wrapper.innerHTML = '';
        
        if (this.showingSettings) {
            this.buildSettingsUI(wrapper);
        } else {
            console.log('💬 Showing enhanced chat interface');
            this.buildChatUI(wrapper);
        }
    }
    
    buildChatUI(wrapper) {
        // Add header
        const header = this.createEnhancedHeader();
        wrapper.appendChild(header);
        
        // Create content container
        const contentContainer = document.createElement('div');
        contentContainer.className = 'chat-content-container';
        contentContainer.id = 'chat-content-container';
        
        if (this.currentMode === 'chat') {
            // Check if current provider is configured
            const provider = this.providers[this.currentProvider];
            
            if (!provider.configured) {
                // Show configuration prompt
                const configPrompt = this.createConfigPrompt();
                contentContainer.appendChild(configPrompt);
            } else {
                // Add chat toolbar with New Chat and Export buttons
                const chatToolbar = document.createElement('div');
                chatToolbar.className = 'chat-toolbar';

                const newChatBtn = document.createElement('button');
                newChatBtn.className = 'chat-toolbar-btn';
                newChatBtn.title = 'New Chat';
                const newChatSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                newChatSvg.setAttribute('width', '14');
                newChatSvg.setAttribute('height', '14');
                newChatSvg.setAttribute('viewBox', '0 0 24 24');
                newChatSvg.setAttribute('fill', 'none');
                newChatSvg.setAttribute('stroke', 'currentColor');
                newChatSvg.setAttribute('stroke-width', '2');
                const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line1.setAttribute('x1', '12');
                line1.setAttribute('y1', '5');
                line1.setAttribute('x2', '12');
                line1.setAttribute('y2', '19');
                const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line2.setAttribute('x1', '5');
                line2.setAttribute('y1', '12');
                line2.setAttribute('x2', '19');
                line2.setAttribute('y2', '12');
                newChatSvg.appendChild(line1);
                newChatSvg.appendChild(line2);
                const newChatLabel = document.createElement('span');
                newChatLabel.textContent = 'New Chat';
                newChatBtn.appendChild(newChatSvg);
                newChatBtn.appendChild(newChatLabel);
                newChatBtn.onclick = () => this.clearChat();

                const exportBtn = document.createElement('button');
                exportBtn.className = 'chat-toolbar-btn';
                exportBtn.title = 'Export Chat';
                const exportSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                exportSvg.setAttribute('width', '14');
                exportSvg.setAttribute('height', '14');
                exportSvg.setAttribute('viewBox', '0 0 24 24');
                exportSvg.setAttribute('fill', 'none');
                exportSvg.setAttribute('stroke', 'currentColor');
                exportSvg.setAttribute('stroke-width', '2');
                const exportPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                exportPath.setAttribute('d', 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3');
                exportSvg.appendChild(exportPath);
                const exportLabel = document.createElement('span');
                exportLabel.textContent = 'Export';
                exportBtn.appendChild(exportSvg);
                exportBtn.appendChild(exportLabel);
                exportBtn.onclick = () => this.exportChat();

                // Spacer to push settings buttons to the right
                const spacer = document.createElement('div');
                spacer.className = 'chat-toolbar-spacer';

                // MCP Settings button
                const mcpBtn = document.createElement('button');
                mcpBtn.className = 'chat-toolbar-btn icon-only';
                mcpBtn.title = 'MCP Settings';
                const mcpLabel = document.createElement('span');
                mcpLabel.textContent = 'M';
                mcpLabel.style.cssText = 'font-weight: bold; font-size: 11px;';
                mcpBtn.appendChild(mcpLabel);
                mcpBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (window.mcpSettings) {
                        window.mcpSettings.show();
                    }
                };

                // AI Settings button (gear icon)
                const settingsBtn = document.createElement('button');
                settingsBtn.className = 'chat-toolbar-btn icon-only';
                settingsBtn.title = 'AI Settings';
                const settingsSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                settingsSvg.setAttribute('width', '14');
                settingsSvg.setAttribute('height', '14');
                settingsSvg.setAttribute('viewBox', '0 0 24 24');
                settingsSvg.setAttribute('fill', 'currentColor');
                const settingsPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                settingsPath.setAttribute('d', 'M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z');
                settingsSvg.appendChild(settingsPath);
                settingsBtn.appendChild(settingsSvg);
                settingsBtn.onclick = () => this.showSettings();

                chatToolbar.appendChild(newChatBtn);
                chatToolbar.appendChild(exportBtn);
                chatToolbar.appendChild(spacer);
                chatToolbar.appendChild(mcpBtn);
                chatToolbar.appendChild(settingsBtn);
                contentContainer.appendChild(chatToolbar);

                // Add chat interface
                const chatContainer = document.createElement('div');
                chatContainer.className = 'chat-interface-container';
                this.interface.mount(chatContainer);
                contentContainer.appendChild(chatContainer);

                // Add context manager
                const contextContainer = document.createElement('div');
                contextContainer.className = 'chat-context-container';
                this.contextManager.mount(contextContainer);
                contentContainer.appendChild(contextContainer);
            }
        } else {
            // CLI mode
            this.buildCLIUI(contentContainer).catch(error => {
                console.error('Failed to build CLI UI:', error);
            });
        }
        
        wrapper.appendChild(contentContainer);
    }
    
    async buildCLIUI(container) {
        // Prevent multiple builds
        if (this.isBuildingCLI) {
            console.log('CLI Mode: Already building CLI, skipping...');
            return;
        }
        
        if (!this.cliContainer) {
            this.isBuildingCLI = true;
            
            // Get current vault path from window context first
            let vaultPath = '';
            
            // Try window context first
            if (window.windowContext) {
                console.log('CLI Mode: windowContext exists, getting vault info...');
                try {
                    const vaultInfo = await window.windowContext.getVaultInfo();
                    console.log('CLI Mode: vaultInfo from windowContext:', vaultInfo);
                    if (vaultInfo && vaultInfo.path) {
                        vaultPath = vaultInfo.path;
                        console.log('CLI Mode: Got vault path from windowContext:', vaultPath);
                    }
                } catch (error) {
                    console.error('Failed to get vault info from windowContext:', error);
                }
            } else if (window.currentVaultPath) {
                vaultPath = window.currentVaultPath;
                console.log('CLI Mode: Got vault path from window.currentVaultPath:', vaultPath);
            }
            
            // If no vault path from context, try to get from backend
            if (!vaultPath) {
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    const vaultInfo = await invoke('get_vault_info');
                    if (vaultInfo && vaultInfo.path) {
                        vaultPath = vaultInfo.path;
                    }
                } catch (error) {
                    console.error('Failed to get vault info:', error);
                }
            }
            
            const windowId = window.windowContext?.windowId || window.windowId || 'main';
            
            console.log('CLI Mode: Using vault path:', vaultPath);
            console.log('CLI Mode: vaultPath type:', typeof vaultPath);
            console.log('CLI Mode: vaultPath length:', vaultPath?.length);
            console.log('CLI Mode: windowContext available:', !!window.windowContext);
            console.log('CLI Mode: window.currentVaultPath available:', !!window.currentVaultPath);
            
            // Use XTermContainer for embedded terminal
            this.cliContainer = new XTermContainer({
                vaultPath: vaultPath,
                windowId: windowId,
                mcpConfig: true, // Enable MCP config generation
                onReady: () => {
                    console.log('Terminal ready');
                    this.isBuildingCLI = false;
                },
                onError: (error) => {
                    console.error('Terminal error:', error);
                    this.isBuildingCLI = false;
                    // Fallback to chat mode on error
                    this.modeToggle.setMode('chat');
                    this.currentMode = 'chat';
                    this.updateUI();
                }
            });
            
            try {
                await this.cliContainer.mount(container);
            } catch (error) {
                console.error('Failed to mount CLI container:', error);
                this.isBuildingCLI = false;
                this.cliContainer = null;
            }
        } else {
            await this.cliContainer.mount(container);
        }
    }
    
    async handleModeToggle(mode) {
        console.log(`🔄 Toggling mode to: ${mode}`);
        
        // Save current mode
        this.currentMode = mode;
        localStorage.setItem('gaimplan-chat-mode', mode);
        
        // Clean up previous mode
        if (mode === 'cli' && this.interface) {
            // Save chat state before switching
            this.saveConversation();
        } else if (mode === 'chat' && this.cliContainer) {
            // Stop CLI process
            await this.cliContainer.stop();
        }
        
        // Update UI
        this.updateUI();
    }
    
    buildSettingsUI(wrapper) {
        const settingsContainer = document.createElement('div');
        settingsContainer.className = 'settings-container';
        
        // Add back button
        const backButton = document.createElement('button');
        backButton.className = 'back-button';
        backButton.innerHTML = '← Back to Chat';
        backButton.onclick = () => this.hideSettings();
        
        settingsContainer.appendChild(backButton);
        
        // Create scrollable content area
        const scrollableContent = document.createElement('div');
        scrollableContent.className = 'settings-scrollable-content';
        scrollableContent.style.flex = '1';
        scrollableContent.style.overflow = 'hidden';
        
        // Mount settings panel
        this.settingsPanel.mount(scrollableContent, {
            onSave: async (settings) => {
                console.log('Settings saved, refreshing providers...');
                this.updateContextCharLimit(settings);
                await this.refreshProviders();
                try {
                    const active = await invoke('get_active_ai_provider');
                    this.currentProvider = active;
                } catch (e) {
                    // Fallback to provider from saved settings
                    this.currentProvider = settings.provider || this.currentProvider;
                }
                this.hideSettings();
            }
        });
        
        settingsContainer.appendChild(scrollableContent);
        wrapper.appendChild(settingsContainer);
    }
    
    createEnhancedHeader() {
        const header = document.createElement('div');
        header.className = 'chat-header simple';
        
        // Left side - title and model selector
        const leftSection = document.createElement('div');
        leftSection.className = 'chat-header-left';
        
        const title = document.createElement('h3');
        title.className = 'chat-title';
        title.textContent = 'AI Chat';
        
        // Status indicator (moved to left side, after title)
        const statusDot = document.createElement('span');
        statusDot.className = 'status-dot';
        const isConnected = this.providers[this.currentProvider].configured;
        statusDot.classList.add(isConnected ? 'connected' : 'disconnected');
        statusDot.title = isConnected ? 'AI online' : 'AI offline';
        
        leftSection.appendChild(title);
        leftSection.appendChild(statusDot);

        // Mode toggle - reuse existing instance to prevent listener accumulation
        if (!this.modeToggle) {
            this.modeToggle = new ModeToggle({
                initialMode: this.currentMode,
                onToggle: (mode) => this.handleModeToggle(mode)
            });
        } else {
            // Update mode in case it changed
            this.modeToggle.setMode(this.currentMode);
        }
        leftSection.appendChild(this.modeToggle.element);
        
        // All action buttons moved to AI chat toolbar

        header.appendChild(leftSection);
        
        return header;
    }
    
    createConfigPrompt() {
        const prompt = document.createElement('div');
        prompt.className = 'config-prompt simple';
        
        prompt.innerHTML = `
            <div class="config-content">
                <div class="config-icon">🤖</div>
                <h3>Set up AI chat</h3>
                <p>Connect your AI provider to start chatting</p>
                <button onclick="window.enhancedChatPanel.showSettings()" class="config-button">
                    Configure
                </button>
            </div>
        `;
        
        return prompt;
    }
    
    buildProviderOptions() {
        // Only show OpenAI/Custom option, not Claude
        return `<option value="openai">OpenAI/Custom</option>`;
    }
    
    getProviderStatusIcon() {
        const provider = this.providers[this.currentProvider];
        
        switch (provider.status) {
            case 'ready':
                return '🟢';
            case 'not-configured':
                return '⚫';
            case 'error':
                return '🔴';
            default:
                return '🟡';
        }
    }
    
    async switchProvider(providerKey) {
        console.log('🔄 Switching to provider:', providerKey);

        this.currentProvider = providerKey;

        const provider = this.providers[providerKey];
        if (provider?.sdk?.getSettings) {
            this.updateContextCharLimit(provider.sdk.getSettings());
        }

        // Update UI
        this.updateUI();
        
        // Save preference
        localStorage.setItem('gaimplan-chat-provider', providerKey);
    }
    
    async refreshProviders() {
        console.log('🔄 Refreshing providers...');
        await this.initializeProviders();
        this.updateUI();
    }
    
    showSettings() {
        console.log('⚙️ Showing settings');
        this.showingSettings = true;
        this.updateUI();
    }
    
    hideSettings() {
        console.log('⚙️ Hiding settings');
        this.showingSettings = false;
        this.updateUI();
    }
    
    async handleSendMessage(message) {
        try {
            const provider = this.providers[this.currentProvider];

            console.log('Current provider:', this.currentProvider, provider);

            // Sync context size with latest provider settings (after potential edits)
            if (provider?.sdk?.getSettings) {
                this.updateContextCharLimit(provider.sdk.getSettings());
            }
            
            if (!provider.configured) {
                this.interface.addMessage({
                    type: 'error',
                    content: `${provider.name} is not configured. Please check your settings.`,
                    timestamp: new Date()
                });
                return;
            }
            
            if (!provider.sdk) {
                this.interface.addMessage({
                    type: 'error',
                    content: `${provider.name} SDK is not initialized. Please refresh the page.`,
                    timestamp: new Date()
                });
                return;
            }
            
            // Add user message to the interface
            this.interface.addMessage({
                type: 'user',
                content: message,
                timestamp: new Date()
            });
            
            // Show thinking indicator IMMEDIATELY after user message
            const settings = provider.sdk.getSettings();
            const isOllama = settings?.endpoint?.includes('ollama') || settings?.endpoint?.includes('11434');
            this.interface.showTyping(isOllama);
            
            // Small delay to ensure UI updates are visible
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Get context from ChatInterface (what's shown in the pills)
            const allContext = await this.getAllContext();
            console.log('All context from pills:', allContext);
            console.log('Context details:');
            allContext.forEach((ctx, i) => {
                console.log(`  Context ${i}: ${ctx.title} - ${ctx.content?.length || 0} chars`);
            });
            
            // 🏷️ TAG CONTEXT EXPANSION
            const tagEnhancement = await tagContextExpander.enhanceConversationWithTags(message, allContext);
            if (tagEnhancement) {
                console.log('🎯 Tag enhancement applied:', tagEnhancement.relatedTags.map(t => `#${t.tag}`).join(', '));
                
                // Add tag context message to show discovered tags
                if (tagEnhancement.relatedTags.length > 0) {
                    const tagsList = tagEnhancement.relatedTags.map(t => `#${t.tag}`).join(', ');
                    this.interface.addMessage({
                        type: 'context',
                        content: `🏷️ Related tags: ${tagsList}`,
                        timestamp: new Date()
                    });
                }
                
                // Add any additional context notes found via tags
                if (tagEnhancement.additionalContext.length > 0) {
                    const additionalFiles = tagEnhancement.additionalContext.map(note => note.file).join(', ');
                    this.interface.addMessage({
                        type: 'context',
                        content: `📎 Additional context via tags: ${additionalFiles}`,
                        timestamp: new Date()
                    });
                }
            }
            
            // Add context message to show which files were included
            if (allContext.length > 0) {
                const contextFileNames = allContext.map(ctx => ctx.title).join(', ');
                this.interface.addMessage({
                    type: 'context',
                    content: `Context: ${contextFileNames}`,
                    timestamp: new Date()
                });
            }
            
            
            let response = '';

            if (this.currentProvider === 'claudeAgent') {
                // Use Claude Agent SDK with streaming
                console.log('🤖 Using Claude Agent SDK');

                // Create a streaming message
                const messageId = 'msg_' + Date.now();
                const streamingMessage = {
                    id: messageId,
                    type: 'assistant',
                    content: '',
                    timestamp: new Date()
                };
                this.interface.addMessage(streamingMessage);
                this.interface.hideTyping();

                try {
                    for await (const event of provider.sdk.chat(message, allContext)) {
                        switch (event.type) {
                            case 'start':
                                console.log('🚀 Claude Agent started, model:', event.model);
                                // Initialize or reset cost display
                                if (!this.costDisplay) {
                                    this.costDisplay = new AgentCostDisplay({
                                        model: event.model || this.providers.claudeAgent.sdk.currentModel
                                    });
                                    // Add to chat interface header or messages area
                                    this.interface.addElement(this.costDisplay.getElement());
                                }
                                this.costDisplay.setModel(event.model || this.providers.claudeAgent.sdk.currentModel);
                                this.costDisplay.show();
                                if (event.usage) {
                                    this.costDisplay.update(event.usage);
                                }
                                break;

                            case 'chunk':
                                // Streaming text chunk
                                streamingMessage.content += event.text;
                                this.interface.updateMessage(messageId, streamingMessage.content);
                                break;

                            case 'tool_start':
                                // Deprecated - now handled by tool_use
                                console.log('🔧 Tool started:', event.toolName);
                                break;

                            case 'tool_use':
                                // Create tool use card with running status
                                console.log('🔧 Tool use:', event.toolName, event.toolInput);
                                this.interface.addToolUse(event.id, event.toolName, event.toolInput);
                                break;

                            case 'tool_result':
                                // Update tool card with result
                                console.log('✅ Tool result:', event.toolName, event.id);
                                this.interface.updateToolResult(event.id, event.result);
                                break;

                            case 'assistant':
                                // Complete message - extract text content
                                if (event.content && Array.isArray(event.content)) {
                                    const textContent = event.content
                                        .filter(block => block.type === 'text')
                                        .map(block => block.text)
                                        .join('');
                                    if (textContent && !streamingMessage.content) {
                                        streamingMessage.content = textContent;
                                        this.interface.updateMessage(messageId, streamingMessage.content);
                                    }
                                }
                                break;

                            case 'result':
                                // Final result with statistics
                                console.log('📊 Result:', {
                                    success: event.success,
                                    cost: event.cost,
                                    turns: event.turns
                                });
                                // Update cost display with final usage
                                if (this.costDisplay && event.usage) {
                                    this.costDisplay.update(event.usage);
                                }
                                break;

                            case 'error':
                                console.error('❌ Claude Agent error:', event.error);
                                this.interface.finalizeStreamingMessage(messageId);
                                this.interface.addMessage({
                                    type: 'error',
                                    content: event.error,
                                    timestamp: new Date()
                                });
                                return;

                            case 'aborted':
                                console.log('🛑 Request aborted');
                                this.interface.finalizeStreamingMessage(messageId);
                                return;
                        }
                    }

                    // Finalize the streaming message
                    this.interface.finalizeStreamingMessage(messageId);

                } catch (agentError) {
                    console.error('Claude Agent error:', agentError);
                    this.interface.finalizeStreamingMessage(messageId);
                    this.interface.addMessage({
                        type: 'error',
                        content: `Claude error: ${agentError.message}`,
                        timestamp: new Date()
                    });
                }
            } else if (this.currentProvider === 'claude') {
                // Use Claude SDK
                response = await provider.sdk.sendMessage(message, allContext);
                this.interface.hideTyping();
                this.interface.addMessage({
                    type: 'assistant',
                    content: response,
                    timestamp: new Date()
                });
            } else if (this.currentProvider === 'bedrock') {
                // Use Bedrock Claude SDK (non-streaming)
                response = await provider.sdk.sendMessage(message, allContext, tagEnhancement);
                this.interface.hideTyping();
                this.interface.addMessage({
                    type: 'assistant',
                    content: response,
                    timestamp: new Date()
                });
            } else if (this.currentProvider === 'gemini') {
                // Use Gemini SDK with streaming
                console.log('🤖 Using Gemini SDK');

                // Get conversation history
                const conversationHistory = this.interface.getMessages() || [];
                const formattedHistory = conversationHistory
                    .filter(msg => msg.type !== 'error' && msg.type !== 'context')
                    .map(msg => ({
                        role: msg.type === 'user' ? 'user' : 'assistant',
                        content: msg.content
                    }));

                // Format messages for Gemini
                const messages = await provider.sdk.formatMessages(message, allContext, tagEnhancement);

                // Add history
                const historyWithoutCurrent = formattedHistory.filter(
                    msg => !(msg.role === 'user' && msg.content === message)
                );

                const fullMessages = [
                    ...messages.filter(m => m.role === 'system'),
                    ...historyWithoutCurrent.slice(-10),
                    messages.find(m => m.role === 'user')
                ].filter(Boolean);

                // Create streaming message (add to UI when first chunk arrives)
                const messageId = 'msg_' + Date.now();
                const streamingMessage = {
                    id: messageId,
                    type: 'assistant',
                    content: '',
                    timestamp: new Date()
                };
                let messageAdded = false;

                try {
                    const stream = await provider.sdk.streamChat(fullMessages);

                    for await (const chunk of stream) {
                        if (chunk.type === 'text') {
                            // Add message to UI on first chunk (keeps "Thinking..." visible until then)
                            if (!messageAdded) {
                                this.interface.addMessage(streamingMessage);
                                messageAdded = true;
                            }
                            streamingMessage.content += chunk.content;
                            this.interface.updateMessage(messageId, streamingMessage.content);
                        } else if (chunk.type === 'function_call') {
                            console.log('Function call in stream:', chunk.functionCall);
                        }
                    }

                    console.log('✅ Gemini streaming complete - final content length:', streamingMessage.content.length);
                    this.interface.finalizeStreamingMessage(messageId);

                } catch (geminiError) {
                    console.error('Gemini streaming error:', geminiError);
                    // Hide typing indicator if message wasn't added yet
                    if (!messageAdded) {
                        this.interface.hideTyping();
                    } else {
                        this.interface.finalizeStreamingMessage(messageId);
                    }
                    this.interface.addMessage({
                        type: 'error',
                        content: `Gemini error: ${geminiError.message}`,
                        timestamp: new Date()
                    });
                }
            } else if (this.currentProvider === 'openai') {
                // Use OpenAI SDK
                // Get conversation history for context (excluding errors and context messages)
                const conversationHistory = this.interface.getMessages() || [];
                const formattedHistory = conversationHistory
                    .filter(msg => msg.type !== 'error' && msg.type !== 'context') // Exclude error and context messages
                    .map(msg => ({
                        role: msg.type === 'user' ? 'user' : 'assistant',
                        content: msg.content
                    }));
                
                // Format messages with history and tag context
                console.log('Formatting messages with context:', allContext.length, 'notes');
                const messages = await provider.sdk.formatMessages(message, allContext, tagEnhancement);
                console.log('Formatted messages:', messages.length, 'total');
                
                // Add conversation history before the current message (but after system messages)
                const systemMessages = messages.filter(m => m.role === 'system');
                const currentUserMessage = messages.find(m => m.role === 'user');
                
                // Only include history messages that aren't the current message
                const historyWithoutCurrent = formattedHistory.filter(
                    msg => !(msg.role === 'user' && msg.content === message)
                );
                
                const fullMessages = [
                    ...systemMessages,
                    ...historyWithoutCurrent.slice(-10), // Include last 10 messages for context
                    currentUserMessage
                ].filter(Boolean);
                
                // Debug: Check if context is in messages
                const hasContextMessage = fullMessages.some(msg => 
                    msg.role === 'system' && msg.content.includes('CURRENT CONTEXT')
                );
                console.log('Has context in fullMessages?', hasContextMessage);
                
                console.log('Sending messages to OpenAI:', fullMessages);
                console.log('Messages array length:', fullMessages.length);
                
                if (!fullMessages || fullMessages.length === 0) {
                    throw new Error('No messages to send');
                }
                
                // Check if MCP tools are available
                let mcpFunctions = [];
                try {
                    mcpFunctions = await mcpToolHandler.getOpenAIFunctions();
                    console.log('Available MCP functions:', mcpFunctions.length);
                } catch (error) {
                    console.log('No MCP functions available:', error);
                }
                
                // Log model info
                const settings = provider.sdk.getSettings();
                const model = settings?.model || '';
                console.log(`Model: ${model}`);
                
                try {
                    let response;
                    
                    // Check if we should use prompt-based tool calling
                    const usePromptTools = gemmaPromptToolCalling.supportsPromptTools(model) && 
                                         !settings?.endpoint?.includes('openai.com');
                    
                    // Check if we should use streaming based on the provider
                    const useStreaming = this.shouldUseStreaming(provider.sdk);
                    
                    if (mcpFunctions.length > 0 && usePromptTools) {
                        // Use prompt-based tool calling for Gemma and similar models
                        console.log('Using prompt-based tool calling for', model);
                        response = await this.handlePromptBasedToolCalling(
                            provider.sdk,
                            fullMessages,
                            mcpFunctions,
                            allContext
                        );
                        
                        // Add response to UI if not already added
                        if (response && typeof response === 'string') {
                            this.interface.addMessage({
                                type: 'assistant',
                                content: response,
                                timestamp: new Date()
                            });
                        }
                    } else if (mcpFunctions.length > 0) {
                        // Use function calling if MCP tools are available
                        console.log('Using function calling with MCP tools');
                        if (useStreaming) {
                            await this.handleStreamingFunctionResponse(
                                provider.sdk,
                                fullMessages,
                                mcpFunctions,
                                allContext
                            );
                        } else {
                            response = await this.handleFunctionCallingResponse(
                                provider.sdk,
                                fullMessages,
                                mcpFunctions,
                                allContext
                            );
                            
                            // Response is already added in handleFunctionCallingResponse
                        }
                    } else {
                        // Regular chat without functions
                        if (useStreaming) {
                            await this.handleStreamingResponse(provider.sdk, fullMessages);
                        } else {
                            response = await provider.sdk.sendChat(fullMessages);
                            
                            // Handle non-streaming response
                            if (response && response.choices && response.choices[0]) {
                                const content = response.choices[0].message?.content || '';
                                this.interface.addMessage({
                                    type: 'assistant',
                                    content: content,
                                    timestamp: new Date()
                                });
                            }
                        }
                    }
                } catch (chatError) {
                    console.error('Chat error:', chatError);
                    this.interface.hideTyping();
                    throw chatError;
                }
            }
            
            // Save conversation
            this.saveConversation();
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.interface.hideTyping();
            this.interface.addMessage({
                type: 'error',
                content: `Error: ${error.message}`,
                timestamp: new Date()
            });
        }
    }
    
    shouldUseStreaming(sdk) {
        // Check if the provider supports streaming
        const settings = sdk.getSettings();
        if (!settings) return true; // Default to streaming
        
        // Ollama native endpoints don't support streaming well
        const isOllamaNative = (settings.endpoint?.includes('ollama') || settings.endpoint?.includes('11434')) 
                               && !settings.endpoint?.includes('/v1');
        
        // Only use streaming for OpenAI-compatible endpoints
        return !isOllamaNative;
    }
    
    async getAllContext() {
        // Get all context from the ChatInterface (what's shown in the pills)
        const contextNotes = [];

        // Get active note
        console.log('Getting all context...');
        const activeNote = await this.getActiveNoteContent();
        console.log('Active note:', activeNote ? `Found: ${activeNote.title}` : 'None');

        if (activeNote) {
            contextNotes.push(activeNote);
        }

        // Get mentioned notes from currentContext
        const mentionedNotes = this.interface.currentContext || [];
        console.log('Mentioned notes:', mentionedNotes.length);

        for (const note of mentionedNotes) {
            // Check if this is a CSV file - get rich context if available
            const isCsv = note.path?.toLowerCase().endsWith('.csv');

            if (isCsv) {
                const csvContext = await this.getCsvContext(note.path, note.title || note.name);
                if (csvContext) {
                    contextNotes.push(csvContext);
                    continue;
                }
            }

            // Default: get raw file content
            const content = await this.getNoteContent(note.path);
            if (content) {
                contextNotes.push({
                    title: note.title || note.name,
                    content: content,
                    path: note.path,
                    type: isCsv ? 'csv' : 'markdown'
                });
            }
        }

        console.log('Total context notes:', contextNotes.length);
        return contextNotes;
    }

    /**
     * Get rich AI context for a CSV file.
     * For premium users, returns structured context with schema, sample data, and metadata.
     * For free users, falls back to raw file content.
     *
     * @param {string} path - Path to the CSV file
     * @param {string} title - Display title for the file
     * @returns {Object|null} Context object with title, content, path, and type
     */
    async getCsvContext(path, title) {
        try {
            const { invoke } = await import('@tauri-apps/api/core');

            // Try to get rich AI context (premium feature)
            const aiContext = await invoke('get_csv_ai_context', {
                path: path,
                maxSampleRows: 10
            });

            console.log('Got rich CSV AI context for:', title);

            // Format the AI context as markdown for the chat
            let content = `## CSV File: ${title}\n\n`;

            if (aiContext.schema_summary) {
                content += `### Schema\n${aiContext.schema_summary}\n\n`;
            }

            if (aiContext.column_descriptions && aiContext.column_descriptions.length > 0) {
                content += `### Columns\n`;
                for (const col of aiContext.column_descriptions) {
                    content += `- **${col.name}** (${col.data_type}): ${col.description || 'No description'}\n`;
                }
                content += '\n';
            }

            if (aiContext.sample_data_markdown) {
                content += `### Sample Data\n${aiContext.sample_data_markdown}\n\n`;
            }

            if (aiContext.row_count !== undefined) {
                content += `### Statistics\n- Total rows: ${aiContext.row_count}\n`;
            }

            if (aiContext.relationship_context) {
                content += `\n### Relationships\n${aiContext.relationship_context}\n`;
            }

            return {
                title: title,
                content: content,
                path: path,
                type: 'csv',
                isPremium: true
            };

        } catch (error) {
            // Check if this is a premium feature error
            const errorMessage = error?.message || error?.toString() || '';
            const isPremiumError = errorMessage.includes('premium') ||
                                   errorMessage.includes('Premium') ||
                                   errorMessage.includes('subscription');

            if (isPremiumError) {
                console.log('CSV AI context requires premium, falling back to basic content');

                // Fall back to raw file content for free users
                const rawContent = await this.getNoteContent(path);
                if (rawContent) {
                    return {
                        title: title,
                        content: `## CSV File: ${title}\n\n(Premium feature: Rich CSV context is available with CSV Editor Pro)\n\n### Raw Content Preview:\n\`\`\`csv\n${rawContent}\n\`\`\``,
                        path: path,
                        type: 'csv',
                        isPremium: false
                    };
                }
            } else {
                console.error('Error getting CSV context:', error);
            }

            return null;
        }
    }
    
    async getActiveNoteContent() {
        // Get current note content from CodeMirror or CSV editor
        console.log('Getting active note content...');

        if (!window.paneManager) {
            console.log('No paneManager found');
            return null;
        }

        const activeTabManager = window.paneManager.getActiveTabManager();
        console.log('Active tab manager:', activeTabManager);

        if (!activeTabManager) {
            console.log('No active tab manager');
            return null;
        }

        const activeTab = activeTabManager.getActiveTab();
        console.log('Active tab:', activeTab);

        if (!activeTab) {
            console.log('No active tab');
            return null;
        }

        const title = activeTab.title || 'Current Note';
        const filePath = activeTab.filePath;

        // Check if this is a CSV file - use rich context if available
        const isCsv = filePath?.toLowerCase().endsWith('.csv');
        if (isCsv) {
            console.log('Active file is CSV, getting rich context...');
            const csvContext = await this.getCsvContext(filePath, title);
            if (csvContext) {
                return csvContext;
            }
            // Fall through to raw content if getCsvContext fails
        }

        // Try to get content from editor first
        let content = '';

        if (activeTab.editor) {
            // activeTab.editor is a MarkdownEditor instance
            // Use the getContent method if available
            if (typeof activeTab.editor.getContent === 'function') {
                content = activeTab.editor.getContent();
            } else if (activeTab.editor.view) {
                content = activeTab.editor.view.state.doc.toString();
            } else if (activeTab.editor.state) {
                content = activeTab.editor.state.doc.toString();
            }
        }

        // If we couldn't get content from editor, try reading from file
        if ((!content || content.length === 0) && filePath) {
            console.log('No content from editor, trying to read from file:', filePath);
            try {
                content = await this.getNoteContent(filePath);
                console.log('Got content from file:', content?.length || 0, 'chars');
            } catch (error) {
                console.error('Failed to read file:', error);
            }
        }

        if (!content || content.length === 0) {
            console.error('No content found! This is why context is lost.');
            return null;
        }

        console.log('Got content from:', title, 'Length:', content.length);

        // Truncate if too long
        const maxLength = this.getContextCharLimit();
        const truncatedContent = content.length > maxLength
            ? content.substring(0, maxLength) + '...[truncated]'
            : content;

        return {
            title: title,
            content: truncatedContent,
            path: filePath,
            type: isCsv ? 'csv' : 'markdown'
        };
    }
    
    async getNoteContent(path) {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const content = await invoke('read_file_content', {
                filePath: path
            });
            
            // Truncate if too long
            const maxLength = this.getContextCharLimit();
            return content.length > maxLength 
                ? content.substring(0, maxLength) + '...[truncated]'
                : content;
        } catch (error) {
            console.error('Error reading note content:', error);
            return null;
        }
    }
    
    
    showAddToNoteButton(messageId, content) {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageEl) {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'message-actions';
            buttonContainer.innerHTML = `
                <button onclick="window.enhancedChatPanel.addToActiveNote('${messageId}')">
                    Add to Note
                </button>
            `;
            messageEl.appendChild(buttonContainer);
        }
    }
    
    async addToActiveNote(messageId) {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        const content = messageEl.querySelector('.message-content').textContent;
        
        if (window.paneManager) {
            const activeTab = window.paneManager.getActiveTabManager()?.getActiveTab();
            if (activeTab && activeTab.editor) {
                const view = activeTab.editor;
                const state = view.state;
                const cursorPos = state.selection.main.head;
                
                const transaction = state.update({
                    changes: {
                        from: cursorPos,
                        to: cursorPos,
                        insert: `\n\n${content}\n\n`
                    }
                });
                
                view.dispatch(transaction);
                this.showNotification('Added to note');
            } else {
                this.showNotification('No active note to add to', 'error');
            }
        }
    }
    
    showNotification(message, type = 'success') {
        console.log(`📢 ${type}: ${message}`);
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `chat-notification ${type}`;
        notification.textContent = message;
        
        // Add to container
        if (this.container) {
            this.container.appendChild(notification);
            
            // Remove after 3 seconds
            setTimeout(() => {
                notification.remove();
            }, 3000);
        }
    }
    
    updateUI() {
        if (!this.container) return;
        
        // Update container class for CLI mode
        this.container.className = `chat-panel enhanced right-sidebar-panel ${this.currentMode === 'cli' ? 'cli-mode' : ''}`;
        
        // Also update the right sidebar class for proper width
        const rightSidebar = document.getElementById('right-sidebar');
        if (rightSidebar) {
            if (this.currentMode === 'cli') {
                rightSidebar.classList.add('cli-mode');
            } else {
                rightSidebar.classList.remove('cli-mode');
            }
        }
        
        const wrapper = this.container.querySelector('.chat-content-wrapper');
        if (wrapper) {
            this.buildUI(wrapper);
        }
        
        // Make this instance globally available
        window.enhancedChatPanel = this;
    }
    
    setupVaultListener() {
        // Listen for vault-opened events from WindowContext
        if (window.windowContext) {
            this.vaultOpenedListener = async (vaultInfo) => {
                console.log('EnhancedChatPanel: Vault opened event received:', vaultInfo);
                
                // IMPORTANT: Restart MCP servers with new vault path
                console.log('🔄 Restarting MCP servers for new vault:', vaultInfo.path);
                try {
                    // Update the current vault path globally
                    window.currentVaultPath = vaultInfo.path;
                    
                    // First stop all existing MCP servers
                    await mcpManager.stopAllServers();
                    
                    // Force kill any lingering MCP processes at OS level
                    try {
                        console.log('🔨 Force killing any lingering MCP processes...');
                        await invoke('kill_all_mcp_processes');
                    } catch (killError) {
                        console.log('Note: kill_all_mcp_processes not available or failed:', killError);
                    }
                    
                    // Longer delay to ensure complete cleanup
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Clear any cached state in MCPManager
                    mcpManager.clients.clear();
                    mcpManager.capabilities.clear();
                    mcpManager.status.clear();
                    
                    // Start all enabled MCP servers with new vault path
                    await mcpManager.startAllEnabledServers();
                    
                    console.log('✅ MCP servers restarted for vault:', vaultInfo.path);
                } catch (error) {
                    console.error('❌ Failed to restart MCP servers:', error);
                }
                
                // If we're in CLI mode and have a CLI container, reset it
                if (this.currentMode === 'cli' && this.cliContainer) {
                    console.log('EnhancedChatPanel: Resetting CLI for new vault:', vaultInfo.path);
                    
                    // Stop the current CLI session
                    await this.cliContainer.destroy();
                    this.cliContainer = null;
                    
                    // Add a small delay to ensure proper cleanup
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    // Rebuild the entire UI to ensure proper state
                    this.updateUI();
                }
            };
            
            window.windowContext.on('vault-opened', this.vaultOpenedListener);
        }
    }
    
    // Toggle right sidebar visibility
    toggle() {
        try {
            console.log(`🔄 Toggling chat panel visibility: ${this.isVisible} -> ${!this.isVisible}`);
            
            this.isVisible = !this.isVisible;
            const rightSidebar = document.getElementById('right-sidebar');
            const chatToggleBtns = document.querySelectorAll('.chat-toggle-btn');

            if (!rightSidebar) {
                console.error('❌ Right sidebar element not found');
                return;
            }

            if (this.isVisible) {
                rightSidebar.classList.add('visible');
                // Apply saved width if available
                const savedWidth = localStorage.getItem('chatPanelWidth');
                if (savedWidth) {
                    rightSidebar.style.width = savedWidth + 'px';
                }
                console.log('✅ Chat panel shown');
            } else {
                rightSidebar.classList.remove('visible');
                // Remove inline width style to ensure CSS takes over
                rightSidebar.style.width = '';
                console.log('✅ Chat panel hidden');
            }

            // Update ALL button active states
            chatToggleBtns.forEach(btn => {
                if (this.isVisible) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            
            // Save visibility state
            localStorage.setItem('gaimplan-chat-visible', this.isVisible.toString());
            
            console.log('💬 Chat panel toggled:', this.isVisible ? 'visible' : 'hidden');
            
        } catch (error) {
            console.error('❌ Error toggling chat panel:', error);
            // Reset state on error
            this.isVisible = !this.isVisible;
            throw error;
        }
    }
    
    async loadSavedProvider() {
        // Load the active provider from backend
        try {
            const activeProvider = await invoke('get_active_ai_provider');
            // Convert backend format to frontend format (e.g., "claude_agent" -> "claudeAgent")
            const providerKey = typeof activeProvider === 'string'
                ? activeProvider
                : activeProvider?.toLowerCase?.() || 'openai';

            // Check if this provider exists in our providers map
            if (this.providers[providerKey]) {
                this.currentProvider = providerKey;
                console.log('Loaded active provider from backend:', providerKey);
            } else {
                console.log('Unknown provider from backend:', activeProvider, '- defaulting to openai');
                this.currentProvider = 'openai';
            }
        } catch (error) {
            console.error('Failed to load active provider:', error);
            this.currentProvider = 'openai';
        }

        // Load saved visibility state
        const savedVisibility = localStorage.getItem('gaimplan-chat-visible');
        if (savedVisibility === 'true') {
            this.isVisible = true;
            const rightSidebar = document.getElementById('right-sidebar');
            const chatToggleBtns = document.querySelectorAll('.chat-toggle-btn');

            if (rightSidebar) {
                rightSidebar.classList.add('visible');
            }
            // Update ALL chat toggle buttons
            chatToggleBtns.forEach(btn => btn.classList.add('active'));
        }
    }
    
    clearChat() {
        this.interface.clearMessages();
        this.persistence.clearHistory();
    }
    
    async exportChat() {
        console.log('💾 Exporting chat...');
        
        try {
            // Get all messages
            const messages = this.interface.getMessages();
            if (!messages || messages.length === 0) {
                alert('No messages to export');
                return;
            }
            
            // Format chat as markdown with context information
            let markdown = '# Chat Export\n\n';
            markdown += `**Date**: ${new Date().toLocaleString()}\n`;
            markdown += `**Provider**: ${this.providers[this.currentProvider].name}\n`;
            markdown += `**Messages**: ${messages.length}\n\n`;
            
            // Add context information if available
            const contextIndicator = document.getElementById('chat-context-indicator');
            const contextPills = contextIndicator?.querySelectorAll('.context-pill');
            if (contextPills && contextPills.length > 0) {
                markdown += '## Context Used\n\n';
                contextPills.forEach(pill => {
                    const noteName = pill.querySelector('span')?.textContent || 'Unknown';
                    const isActive = pill.classList.contains('active-note');
                    markdown += `- ${noteName}${isActive ? ' (Active Note)' : ''}\n`;
                });
                markdown += '\n';
            }
            
            markdown += '## Conversation\n\n';
            
            messages.forEach((msg, index) => {
                const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
                
                if (msg.type === 'user') {
                    markdown += `### You - ${timestamp}\n${msg.content}\n\n`;
                } else if (msg.type === 'assistant') {
                    markdown += `### AI - ${timestamp}\n${msg.content}\n\n`;
                } else if (msg.type === 'error') {
                    markdown += `### Error - ${timestamp}\n${msg.content}\n\n`;
                } else if (msg.type === 'context') {
                    markdown += `*${msg.content}*\n\n`;
                }
            });
            
            // Export to vault's Chat History folder
            const { invoke } = await import('@tauri-apps/api/core');
            
            const filePath = await invoke('export_chat_to_vault', {
                content: markdown,
                filename: null // Let the backend generate timestamp-based filename
            });
            
            console.log('✅ Chat exported successfully to:', filePath);
            this.showNotification('Chat exported to Chat History folder');
            
            // Refresh the file tree to show the new file
            // This will trigger the file tree update if it's listening for changes
            window.dispatchEvent(new CustomEvent('vault-files-changed'));
            
            // Also try direct refresh as a fallback
            if (window.refreshFileTree) {
                console.log('📁 Directly refreshing file tree...');
                window.refreshFileTree();
            }
            
        } catch (error) {
            console.error('Error exporting chat:', error);
            this.showNotification('Failed to export chat', 'error');
        }
    }
    
    saveConversation() {
        // Save current conversation
        const messages = this.interface.getMessages();
        this.persistence.saveHistory(messages);
    }
    
    loadChatHistory() {
        const history = this.persistence.loadHistory();
        if (history && history.length > 0) {
            this.interface.loadMessages(history);
        }
    }
    
    async handleFunctionCallingResponse(sdk, messages, functions, context) {
        console.log('🔧 Handling function calling response');
        
        // Send initial request with functions
        const response = await sdk.sendChatWithFunctions(messages, functions);
        console.log('Initial response:', response);
        
        // Check if the model wants to call a function
        if (response.choices && response.choices[0]) {
            const choice = response.choices[0];
            
            // Debug: Log the actual message structure
            console.log('Choice message:', choice.message);
            console.log('Has function_call?', !!choice.message?.function_call);
            console.log('Has tool_calls?', !!choice.message?.tool_calls);
            
            // Check for both OpenAI and Ollama formats
            let functionCall = null;
            
            if (choice.message && choice.message.function_call) {
                // OpenAI format
                functionCall = choice.message.function_call;
            } else if (choice.message && choice.message.tool_calls && choice.message.tool_calls.length > 0) {
                // Ollama format - extract first tool call
                const toolCall = choice.message.tool_calls[0];
                if (toolCall.function) {
                    functionCall = {
                        name: toolCall.function.name,
                        arguments: typeof toolCall.function.arguments === 'string' 
                            ? toolCall.function.arguments 
                            : JSON.stringify(toolCall.function.arguments)
                    };
                }
            }
            
            if (functionCall) {
                // AI wants to call a function
                console.log('AI wants to call function:', functionCall.name);
                
                // Show tool usage in UI
                const toolDisplay = mcpToolHandler.createToolUsageDisplay(
                    functionCall.name,
                    functionCall.name.split('_')[0], // Extract server name from function name
                    'running'
                );
                this.interface.addElement(toolDisplay);
                
                try {
                    // Execute the function
                    const args = JSON.parse(functionCall.arguments);
                    const result = await mcpToolHandler.executeTool(functionCall.name, args);
                    
                    console.log('Tool execution result:', result);
                    
                    // Update tool display
                    const statusElement = toolDisplay.querySelector('.tool-status');
                    statusElement.textContent = result.success ? '✅' : '❌';
                    statusElement.classList.remove('spinning');
                    toolDisplay.querySelector('.tool-usage-status').textContent = 
                        result.success ? 'Completed successfully' : `Failed: ${result.error}`;
                    
                    // Add function response to messages
                    // Check if we need tools format (Ollama/Gemini)
                    const settings = sdk.getSettings();
                    const isOllama = settings?.endpoint?.includes('ollama') || settings?.endpoint?.includes('11434');
                    const isGemini = settings?.endpoint?.includes('generativelanguage.googleapis.com');
                    const useToolsFormat = isOllama || isGemini;
                    
                    let updatedMessages;
                    
                    if (useToolsFormat) {
                        // Tools format for Ollama/Gemini
                        const toolCallId = 'call_' + Date.now();
                        
                        if (isGemini) {
                            // Gemini format - include function name in the response
                            updatedMessages = [
                                ...messages,
                                {
                                    role: 'assistant',
                                    content: choice.message.content || '',
                                    tool_calls: [{
                                        id: toolCallId,
                                        type: 'function',
                                        function: functionCall
                                    }]
                                },
                                {
                                    role: 'tool',
                                    content: result.success ? result.result : `Error: ${result.error}`,
                                    tool_call_id: toolCallId,
                                    name: functionCall.name  // Gemini requires the function name
                                }
                            ];
                        } else {
                            // Ollama format
                            updatedMessages = [
                                ...messages,
                                {
                                    role: 'assistant',
                                    content: choice.message.content || '',
                                    tool_calls: [{
                                        id: toolCallId,
                                        type: 'function',
                                        function: functionCall
                                    }]
                                },
                                {
                                    role: 'tool',
                                    content: result.success ? result.result : `Error: ${result.error}`,
                                    tool_call_id: toolCallId
                                }
                            ];
                        }
                    } else {
                        // OpenAI format
                        const functionMessage = {
                            role: 'function',
                            name: functionCall.name,
                            content: result.success ? result.result : `Error: ${result.error}`
                        };
                        
                        updatedMessages = [
                            ...messages,
                            {
                                role: 'assistant',
                                content: choice.message.content || '',
                                function_call: functionCall
                            },
                            functionMessage
                        ];
                    }
                    
                    // Send another request with the function result
                    const finalResponse = await sdk.sendChat(updatedMessages);
                    
                    // Extract content from response and add to UI
                    if (finalResponse.choices && finalResponse.choices[0] && finalResponse.choices[0].message) {
                        const content = finalResponse.choices[0].message.content || '';
                        this.interface.addMessage({
                            type: 'assistant',
                            content: content,
                            timestamp: new Date()
                        });
                        return content;
                    }
                    
                    return finalResponse;
                    
                } catch (error) {
                    console.error('Function execution error:', error);
                    
                    // Update tool display
                    const statusElement = toolDisplay.querySelector('.tool-status');
                    statusElement.textContent = '❌';
                    statusElement.classList.remove('spinning');
                    toolDisplay.querySelector('.tool-usage-status').textContent = `Failed: ${error.message}`;
                    
                    // Return error message
                    return `I tried to use a tool but encountered an error: ${error.message}`;
                }
            } else if (choice.message && choice.message.content) {
                // Regular response without function call
                console.log('Model returned regular content without function call');
                this.interface.addMessage({
                    type: 'assistant',
                    content: choice.message.content,
                    timestamp: new Date()
                });
                return choice.message.content;
            }
        }
        
        throw new Error('Unexpected response format from AI');
    }
    
    async handlePromptBasedToolCalling(sdk, messages, functions, context) {
        console.log('🔧 Handling prompt-based tool calling');
        
        // Add tool descriptions to the system message
        const toolPrompt = gemmaPromptToolCalling.formatToolsForPrompt(functions);
        
        // Modify the system message to include tools
        const modifiedMessages = messages.map(msg => {
            if (msg.role === 'system' && !msg.content.includes('To use a tool')) {
                return {
                    ...msg,
                    content: msg.content + '\n\n' + toolPrompt
                };
            }
            return msg;
        });
        
        // Send initial request
        const response = await sdk.sendChat(modifiedMessages);
        console.log('Initial response:', response);
        
        // Check if the response contains a tool call
        const toolCall = gemmaPromptToolCalling.extractToolCall(response);
        
        if (toolCall) {
            console.log('Detected tool call:', toolCall);
            
            // Show tool usage in UI
            const toolDisplay = mcpToolHandler.createToolUsageDisplay(
                toolCall.name,
                toolCall.name.split('_')[0], // Extract server name from function name
                'running'
            );
            this.interface.addElement(toolDisplay);
            
            try {
                // Execute the function
                const args = JSON.parse(toolCall.arguments);
                const result = await mcpToolHandler.executeTool(toolCall.name, args);
                
                console.log('Tool execution result:', result);
                
                // Update tool display
                const statusElement = toolDisplay.querySelector('.tool-status');
                statusElement.textContent = result.success ? '✅' : '❌';
                statusElement.classList.remove('spinning');
                toolDisplay.querySelector('.tool-usage-status').textContent = 
                    result.success ? 'Completed successfully' : `Failed: ${result.error}`;
                
                // Add the tool result to the conversation
                const toolResultMessage = {
                    role: 'user',
                    content: `${gemmaPromptToolCalling.formatToolResult(result)}\n\nBased on this tool result, please provide a natural language response to the user's original question.`
                };
                
                const updatedMessages = [
                    ...modifiedMessages,
                    {
                        role: 'assistant',
                        content: response
                    },
                    toolResultMessage
                ];
                
                // Get final response with tool result
                const finalResponse = await sdk.sendChat(updatedMessages);
                return finalResponse;
                
            } catch (error) {
                console.error('Function execution error:', error);
                
                // Update tool display
                const statusElement = toolDisplay.querySelector('.tool-status');
                statusElement.textContent = '❌';
                statusElement.classList.remove('spinning');
                toolDisplay.querySelector('.tool-usage-status').textContent = `Failed: ${error.message}`;
                
                // Return error message
                return `I tried to use a tool but encountered an error: ${error.message}`;
            }
        } else {
            // No tool call detected, return the response as is
            return response;
        }
    }
    
    /**
     * MCP tools indicator removed for cleaner UI
     */
    
    async testMCPConnection() {
        console.log('🧪 Testing MCP connection...');
        
        try {
            // Show status
            this.showNotification('Testing basic MCP functionality...');
            
            // Use invoke directly to test
            const { invoke } = await import('@tauri-apps/api/core');
            
            // First, test if the commands are available
            console.log('Testing get_mcp_server_statuses...');
            
            try {
                const statuses = await invoke('get_mcp_server_statuses');
                console.log('✅ get_mcp_server_statuses works:', statuses);
                this.showNotification('Basic MCP commands working!', 'success');
            } catch (e) {
                console.error('❌ get_mcp_server_statuses failed:', e);
                this.showNotification(`MCP commands failed: ${e.message}`, 'error');
                return;
            }
            
            // Test basic process spawning first
            console.log('Testing basic process spawning...');
            this.showNotification('Testing basic spawn...', 'info');
            
            try {
                const spawnResult = await invoke('test_process_spawn');
                console.log('✅ Basic spawn test:', spawnResult);
                this.showNotification('Basic spawn works!', 'success');
            } catch (e) {
                console.error('❌ Basic spawn failed:', e);
                this.showNotification(`Basic spawn failed: ${e.message}`, 'error');
                return;
            }
            
            // Now test the echo server
            console.log('Testing echo server...');
            this.showNotification('Testing echo server...', 'info');
            
            try {
                const echoResult = await invoke('test_stdio_echo');
                console.log('✅ Echo test:', echoResult);
                this.showNotification('Echo test completed!', 'success');
            } catch (e) {
                console.error('❌ Echo test failed:', e);
                this.showNotification(`Echo test failed: ${e.message}`, 'error');
            }
            
        } catch (error) {
            console.error('MCP test failed:', error);
            console.error('Error stack:', error.stack);
            this.showNotification(`MCP test failed: ${error.message}`, 'error');
        }
        
        // Final summary
        setTimeout(() => {
            console.log('🎯 MCP Test Summary:');
            console.log('✅ Basic MCP commands working');
            console.log('🔧 Process spawning needs refinement for long-running servers');
            console.log('🚀 Ready for next phase: Real MCP server testing');
            
            // Add a button for testing the real Node.js MCP server
            console.log('💡 To test the real Node.js MCP server, check browser console for testRealMCP()');
            
            // Add basic spawn test
            window.testSpawn = async () => {
                console.log('🧪 Testing basic process spawn...');
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    const result = await invoke('test_process_spawn');
                    console.log('✅ Spawn test result:', result);
                } catch (error) {
                    console.error('❌ Spawn test failed:', error);
                }
            };
            
            // Add direct MCP test
            window.testMCPDirect = async () => {
                console.log('🧪 Testing direct MCP communication...');
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    const result = await invoke('test_mcp_direct');
                    console.log('✅ Direct MCP test result:', result);
                } catch (error) {
                    console.error('❌ Direct MCP test failed:', error);
                }
            };
            
            // Add transport test
            window.testTransport = async () => {
                console.log('🧪 Testing transport layer...');
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    const result = await invoke('test_transport_direct');
                    console.log('✅ Transport test result:', result);
                } catch (error) {
                    console.error('❌ Transport test failed:', error);
                }
            };
            
            // Add echo test
            window.testEcho = async () => {
                console.log('🧪 Testing stdio echo...');
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    const result = await invoke('test_stdio_echo');
                    console.log('✅ Echo test result:', result);
                } catch (error) {
                    console.error('❌ Echo test failed:', error);
                }
            };
            
            window.testRealMCP = async () => {
                console.log('🧪 Testing Real Node.js MCP Server...');
                
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    
                    const nodeConfig = {
                        enabled: true,
                        transport: {
                            type: 'stdio',
                            command: 'node',
                            args: ['./mcp-servers/test-server/index.js'],
                            env: {},
                            working_dir: null
                        },
                        capabilities: {
                            tools: true,
                            resources: true,
                            prompts: false,
                            sampling: false
                        },
                        permissions: {
                            read: true,
                            write: false,
                            delete: false,
                            external_access: false
                        }
                    };
                    
                    console.log('Starting Node.js MCP server...');
                    console.log('Config:', JSON.stringify(nodeConfig, null, 2));
                    
                    // Add timeout to see if it's hanging
                    const startPromise = invoke('start_mcp_server', {
                        serverId: 'node-test',
                        config: nodeConfig
                    });
                    
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Server start timeout after 30s')), 30000);
                    });
                    
                    await Promise.race([startPromise, timeoutPromise]);
                    
                    console.log('✅ Node.js MCP server started successfully!');
                    
                    // Check server status
                    const statuses = await invoke('get_mcp_server_statuses');
                    console.log('📊 Server statuses:', statuses);
                    
                } catch (error) {
                    console.error('❌ Node.js MCP test failed:', error);
                    console.error('Full error:', error.stack);
                }
            };
        }, 3000);
    }
    
    async handleStreamingResponse(sdk, messages) {
        console.log('🌊 Starting streaming response');
        
        // Hide typing indicator
        this.interface.hideTyping();
        
        // Create a new message for streaming
        const messageId = 'msg_' + Date.now();
        const streamingMessage = {
            id: messageId,
            type: 'assistant',
            content: '',
            timestamp: new Date()
        };
        
        // Add empty message to UI
        this.interface.addMessage(streamingMessage);
        
        // Check if using Gemini SDK
        const isGeminiSDK = sdk instanceof GeminiSDK;
        
        if (isGeminiSDK) {
            // Handle Gemini streaming
            try {
                const stream = await sdk.streamChat(messages);
                
                for await (const chunk of stream) {
                    if (chunk.type === 'text') {
                        streamingMessage.content += chunk.content;
                        this.interface.updateMessage(messageId, streamingMessage.content);
                    } else if (chunk.type === 'function_call') {
                        // Handle function calls if needed
                        console.log('Function call in stream:', chunk.functionCall);
                    }
                }
                
                console.log('✅ Gemini streaming complete - final content length:', streamingMessage.content.length);
                if (streamingMessage.content.length === 0) {
                    console.warn('⚠️ No content received during streaming - this may indicate an API issue');
                }
                this.interface.finalizeStreamingMessage(messageId);
                
            } catch (error) {
                console.error('Gemini streaming error:', error);
                this.interface.finalizeStreamingMessage(messageId);
                this.interface.addMessage({
                    type: 'error',
                    content: `Stream error: ${error.message}`,
                    timestamp: new Date()
                });
                throw error;
            }
        } else {
            // Handle OpenAI SDK streaming (existing code)
            const callbacks = {
                onToken: (token) => {
                    console.log('📝 Received token:', token);
                    // Accumulate content
                    streamingMessage.content += token;
                    // Update the message in the UI
                    this.interface.updateMessage(messageId, streamingMessage.content);
                },
                
                onError: (error) => {
                    console.error('Streaming error:', error);
                    this.interface.finalizeStreamingMessage(messageId);
                    this.interface.addMessage({
                        type: 'error',
                        content: `Stream error: ${error.message}`,
                        timestamp: new Date()
                    });
                },
                
                onDone: () => {
                    console.log('✅ Streaming complete - final content length:', streamingMessage.content.length);
                    if (streamingMessage.content.length === 0) {
                        console.warn('⚠️ No content received during streaming - this may indicate an API issue');
                    }
                    this.interface.finalizeStreamingMessage(messageId);
                }
            };
            
            // Start streaming
            try {
                await sdk.sendChatStream(messages, callbacks);
            } catch (error) {
                console.error('Failed to start stream:', error);
                this.interface.hideTyping();
                throw error;
            }
        }
    }
    
    async handleStreamingFunctionResponse(sdk, messages, functions, context) {
        console.log('🌊 Starting streaming response with functions');
        
        // Hide typing indicator
        this.interface.hideTyping();
        
        // Create a new message for streaming
        const messageId = 'msg_' + Date.now();
        const streamingMessage = {
            id: messageId,
            type: 'assistant',
            content: '',
            timestamp: new Date()
        };
        
        // Add empty message to UI
        this.interface.addMessage(streamingMessage);
        
        // Check if using Gemini SDK
        const isGeminiSDK = sdk instanceof GeminiSDK;
        
        if (isGeminiSDK) {
            // Set functions for Gemini
            sdk.setFunctions(functions);
            
            try {
                const stream = await sdk.streamChat(messages);
                
                for await (const chunk of stream) {
                    if (chunk.type === 'text') {
                        streamingMessage.content += chunk.content;
                        this.interface.updateMessage(messageId, streamingMessage.content);
                    } else if (chunk.type === 'function_call') {
                        // Handle function call
                        console.log('🔧 Gemini function call:', chunk.functionCall);
                        
                        // Execute the function
                        const functionName = chunk.functionCall.name;
                        const args = JSON.parse(chunk.functionCall.arguments);
                        
                        // Find and execute the function
                        const func = functions.find(f => f.name === functionName);
                        if (func) {
                            // Add tool usage element
                            const toolUsageElement = this.interface.addCustomElement('tool-usage', {
                                toolName: functionName,
                                status: 'running'
                            });
                            
                            try {
                                // Execute the function through MCP handler
                                const result = await mcpToolHandler.executeFunction(functionName, args);
                                
                                // Update tool status
                                toolUsageElement.querySelector('.tool-status').textContent = 'Complete';
                                
                                // Continue conversation with the result
                                const followUpMessages = [
                                    ...messages,
                                    {
                                        role: 'assistant',
                                        content: '',
                                        tool_calls: [{
                                            id: 'call_' + Date.now(),
                                            type: 'function',
                                            function: {
                                                name: functionName,
                                                arguments: JSON.stringify(args)
                                            }
                                        }]
                                    },
                                    {
                                        role: 'tool',
                                        content: JSON.stringify(result),
                                        tool_call_id: 'call_' + Date.now(),
                                        name: functionName
                                    }
                                ];
                                
                                // Continue streaming with the result
                                await this.handleStreamingResponse(sdk, followUpMessages);
                                
                            } catch (error) {
                                console.error('Function execution failed:', error);
                                toolUsageElement.querySelector('.tool-status').textContent = 'Failed';
                                toolUsageElement.querySelector('.tool-status').classList.add('error');
                            }
                        }
                    }
                }
                
                this.interface.finalizeStreamingMessage(messageId);
                
            } catch (error) {
                console.error('Gemini streaming with functions error:', error);
                this.interface.finalizeStreamingMessage(messageId);
                throw error;
            }
            
            return;
        }
        
        // Original OpenAI SDK code continues below...
        // Variables to track function calls
        let functionCallName = '';
        let functionCallArgs = '';
        let isAccumulatingFunction = false;
        
        // Set up streaming callbacks
        const callbacks = {
            onToken: (token) => {
                // Regular content token
                streamingMessage.content += token;
                this.interface.updateMessage(messageId, streamingMessage.content);
            },
            
            onFunctionCall: async (functionCall) => {
                console.log('Function call during stream:', functionCall);
                
                // Accumulate function call data
                if (functionCall.name) {
                    functionCallName = functionCall.name;
                    isAccumulatingFunction = true;
                }
                if (functionCall.arguments) {
                    functionCallArgs += functionCall.arguments;
                }
            },
            
            onToolCall: async (toolCall) => {
                console.log('Tool call during stream:', toolCall);
                
                // Handle tool calls similarly
                if (toolCall.name && toolCall.arguments) {
                    await this.executeToolCall(toolCall.name, toolCall.arguments, messageId);
                }
            },
            
            onError: (error) => {
                console.error('Streaming error:', error);
                this.interface.finalizeStreamingMessage(messageId);
                this.interface.addMessage({
                    type: 'error',
                    content: `Stream error: ${error.message}`,
                    timestamp: new Date()
                });
            },
            
            onDone: async () => {
                console.log('✅ Streaming complete');
                
                // If we accumulated a function call, execute it
                if (isAccumulatingFunction && functionCallName && functionCallArgs) {
                    console.log('Executing accumulated function:', functionCallName);
                    try {
                        // Parse the arguments
                        const args = JSON.parse(functionCallArgs);
                        
                        // Execute the function
                        await this.executeToolCall(functionCallName, args, messageId);
                        
                    } catch (error) {
                        console.error('Failed to execute function:', error);
                        this.interface.addMessage({
                            type: 'error',
                            content: `Failed to execute function: ${error.message}`,
                            timestamp: new Date()
                        });
                    }
                }
                
                this.interface.finalizeStreamingMessage(messageId);
            }
        };
        
        // Start streaming with functions
        try {
            await sdk.sendChatWithFunctionsStream(messages, functions, callbacks);
        } catch (error) {
            console.error('Failed to start stream:', error);
            this.interface.hideTyping();
            throw error;
        }
    }
    
    async executeToolCall(functionName, args, messageId) {
        console.log('🔧 Executing tool call:', functionName, args);
        
        // Parse arguments if they're a string
        let parsedArgs = args;
        if (typeof args === 'string') {
            try {
                parsedArgs = JSON.parse(args);
                console.log('Parsed string arguments:', parsedArgs);
            } catch (e) {
                console.error('Failed to parse arguments:', e);
                parsedArgs = args; // Use as-is if parsing fails
            }
        }
        
        // Show tool usage in UI
        const toolUsageElement = document.createElement('div');
        toolUsageElement.className = 'tool-usage';
        toolUsageElement.innerHTML = `
            <div class="tool-header">
                <span class="tool-icon">🔧</span>
                <span class="tool-name">${functionName}</span>
                <span class="tool-status">Running...</span>
            </div>
        `;
        
        this.interface.addElement(toolUsageElement);
        
        try {
            // Execute the tool with parsed arguments
            const result = await mcpToolHandler.executeTool(functionName, parsedArgs);
            
            // Update tool status
            toolUsageElement.querySelector('.tool-status').textContent = 'Success';
            toolUsageElement.querySelector('.tool-status').classList.add('success');
            
            // Continue conversation with tool result
            // Check if we need tools format
            const settings = this.providers[this.currentProvider].sdk.getSettings();
            const isGemini = settings?.endpoint?.includes('generativelanguage.googleapis.com');
            const isOllama = settings?.endpoint?.includes('ollama') || settings?.endpoint?.includes('11434');
            
            let toolResultMessage;
            if (isGemini || isOllama) {
                // Tools format
                toolResultMessage = {
                    role: 'tool',
                    content: JSON.stringify(result),
                    tool_call_id: messageId  // Use the messageId as tool_call_id
                };
                
                // Gemini requires the function name
                if (isGemini) {
                    toolResultMessage.name = functionName;
                    console.log('Added name field for Gemini:', functionName);
                    
                    // For Gemini, modify the tool result to explicitly request a response
                    const toolResult = JSON.parse(toolResultMessage.content);
                    if (toolResult.success && toolResult.result) {
                        toolResultMessage.content = JSON.stringify({
                            ...toolResult,
                            instruction: "Please analyze this tool result and provide a helpful response to the user's original question."
                        });
                    }
                }
            } else {
                // OpenAI format
                toolResultMessage = {
                    role: 'function',
                    name: functionName,
                    content: JSON.stringify(result)
                };
            }
            
            // Get current messages and add tool result
            // We need to reconstruct the assistant message with the tool call
            const currentMessages = this.interface.messages
                .filter(m => m.type === 'user' || m.type === 'assistant')
                .slice(0, -1)  // Remove the last assistant message (which is empty)
                .map(m => ({
                    role: m.type === 'user' ? 'user' : 'assistant',
                    content: m.content
                }));
            
            // Add the assistant message with the tool call
            const assistantWithToolCall = {
                role: 'assistant',
                content: '',  // Gemini expects empty content with tool calls
                tool_calls: [{
                    id: messageId,
                    type: 'function',
                    function: {
                        name: functionName,
                        arguments: JSON.stringify(parsedArgs)
                    }
                }]
            };
            
            currentMessages.push(assistantWithToolCall);
            currentMessages.push(toolResultMessage);
            
            // For Gemini, add an explicit request for response after tool result
            if (isGemini) {
                currentMessages.push({
                    role: 'user',
                    content: 'Based on the tool result above, please provide a helpful response to my original question.'
                });
            }
            
            // Debug: Log the messages being sent
            console.log('Messages being sent to streaming API (total:', currentMessages.length, ')');
            currentMessages.forEach((msg, i) => {
                console.log(`Message ${i}:`, {
                    role: msg.role,
                    content: msg.content?.substring(0, 100) || '',
                    tool_calls: msg.tool_calls,
                    tool_call_id: msg.tool_call_id,
                    name: msg.name
                });
            });
            
            // Continue streaming with tool result
            await this.handleStreamingResponse(this.providers[this.currentProvider].sdk, currentMessages);
            
        } catch (error) {
            console.error('Tool execution failed:', error);
            
            // Update tool status
            toolUsageElement.querySelector('.tool-status').textContent = 'Failed';
            toolUsageElement.querySelector('.tool-status').classList.add('error');
            
            this.interface.addMessage({
                type: 'error',
                content: `Tool execution failed: ${error.message}`,
                timestamp: new Date()
            });
        }
    }
    
    // Clean up method
    async destroy() {
        console.log('🧹 Destroying EnhancedChatPanel');
        
        // Clean up vault listener
        if (this.vaultOpenedListener && window.windowContext) {
            window.windowContext.off('vault-opened', this.vaultOpenedListener);
            this.vaultOpenedListener = null;
        }
        
        // Clean up CLI container if exists
        if (this.cliContainer) {
            await this.cliContainer.destroy();
            this.cliContainer = null;
        }
        
        // Reset building flag
        this.isBuildingCLI = false;
        
        // Clean up other components
        if (this.interface) {
            this.interface.destroy();
        }
        
        if (this.contextManager) {
            // Add destroy method if contextManager has one
        }
        
        // Clear container
        if (this.container) {
            this.container.innerHTML = '';
            this.container = null;
        }
        
        // Remove global reference
        if (window.enhancedChatPanel === this) {
            window.enhancedChatPanel = null;
        }
    }
}
