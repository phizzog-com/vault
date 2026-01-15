// Tauri v2 Modern Approach with CodeMirror Editor Integration
console.log('🚀 TAURI V2 APPROACH WITH EDITOR - Loading...');

// Initialize Node.js shims for browser compatibility (must be first!)
import './shims/process-shim.js';

// Import Tauri v2 APIs and editor components
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { ask } from '@tauri-apps/plugin-dialog';
import { MarkdownEditor } from './editor/markdown-editor.js';
import { ThemeManager } from './editor/theme-manager.js';
import { markdownExtensions, markdownStyles } from './editor/markdown-extensions.js';
import { PaneManager } from './PaneManager.js';
import { EnhancedChatPanel } from './chat/EnhancedChatPanel.js';
import { mcpSettingsPanel } from './mcp/MCPSettingsPanel.js';
import { userSettingsPanel } from './settings/UserSettingsPanel.js';
import { WidgetSidebar } from './widgets/WidgetSidebar.js';
import { perfMonitor } from './performance/PerformanceMonitor.js';
import { perfTestSuite } from './performance/PerformanceTestSuite.js';
import { globalSearch } from './search/GlobalSearch.js';
import windowContext from './contexts/WindowContext.js';
import { VaultPicker } from './components/VaultPicker.js';
import pluginHub from './plugin-hub/PluginHub.js';
import './utils/uuid-utils.js';
import './utils/readwise-uuid-fix.js';
import { TaskDashboard } from './tasks/TaskDashboard.js';
import { icons } from './icons/icon-utils.js';
import './plugin-hub/components/Toast.css';
import EntitlementManager from './services/entitlement-manager.js';
import GlobalSearchPanel from './components/GlobalSearchPanel.js';
import PACASDBClient from './services/pacasdb-client.js';
import VaultSync from './services/vault-sync.js';

console.log('✅ Tauri v2 APIs and editor components imported successfully!');
console.log('🔍 EnhancedChatPanel class:', EnhancedChatPanel);

// Global state
window.expandedFolders = new Set();
// Drag-and-drop debug flag (toggle via enableDnDDebug/disableDnDDebug)
window.__dndDebug = true;

// Premium features
let entitlementManager = null;
let pacasdbClient = null;
let globalSearchPanel = null;
let vaultSync = null;
window.enableDnDDebug = () => { window.__dndDebug = true; console.log('[DnD] debug enabled'); };
window.disableDnDDebug = () => { window.__dndDebug = false; console.log('[DnD] debug disabled'); };
function dndLog(...args) { if (window.__dndDebug) console.log('[DnD]', ...args); }

// Enable synthetic drag mode for WKWebView
window.enableSyntheticDrag = function() {
  window.__useSyntheticDrag = true;
  console.log('[DnD] Synthetic drag mode ENABLED - using press-hold-drop fallback');
  initSyntheticDragHandlers();
};

window.disableSyntheticDrag = function() {
  window.__useSyntheticDrag = false;
  console.log('[DnD] Synthetic drag mode DISABLED');
};

// Synthetic drag implementation for WKWebView
function initSyntheticDragHandlers() {
  if (window.__syntheticDragInitialized) return;
  window.__syntheticDragInitialized = true;
  
  let draggedElement = null;
  let dragGhost = null;
  let dropTarget = null;
  
  const createDragGhost = (element) => {
    const ghost = element.cloneNode(true);
    ghost.style.position = 'fixed';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '0.5';
    ghost.style.zIndex = '99999';
    ghost.style.transition = 'none';
    ghost.classList.add('synthetic-dragging');
    document.body.appendChild(ghost);
    return ghost;
  };
  
  const updateGhostPosition = (x, y) => {
    if (dragGhost) {
      dragGhost.style.left = `${x + 10}px`;
      dragGhost.style.top = `${y - 10}px`;
    }
  };
  
  const findDropTarget = (x, y) => {
    if (dragGhost) dragGhost.style.display = 'none';
    const elements = document.elementsFromPoint(x, y);
    if (dragGhost) dragGhost.style.display = '';
    
    // 1) Prefer folders under the pointer
    for (const el of elements) {
      const folder = el.closest?.('.tree-item.folder');
      if (folder && folder !== draggedElement) {
        return folder;
      }
    }
    // 2) If hovering a root-level file row, treat as root drop
    for (const el of elements) {
      const fileRow = el.closest?.('.tree-item.file');
      if (fileRow) {
        const p = fileRow.getAttribute('data-path') || '';
        const isRootLevel = !p.includes('/');
        if (isRootLevel) {
          const tree = fileRow.closest('.file-tree-content');
          if (tree) return tree; // root
        } else {
          // Hovering a nested file; do not treat as root
          return null;
        }
      }
    }
    // 3) Otherwise, if pointer is within whitespace of the tree content, treat as root
    for (const el of elements) {
      const inTree = el.classList?.contains('file-tree-content') ? el : el.closest?.('.file-tree-content');
      if (inTree) return inTree;
    }
    return null;
  };
  
  // Handle mousedown on draggable files
  document.addEventListener('mousedown', (e) => {
    if (!window.__useSyntheticDrag) return;
    
    const file = e.target.closest('.tree-item.file[draggable="true"]');
    if (!file) return;
    
    e.preventDefault();
    draggedElement = file;
    const path = file.getAttribute('data-path');
    window.__dragSourcePath = path;
    
    // Create visual ghost
    dragGhost = createDragGhost(file);
    updateGhostPosition(e.clientX, e.clientY);
    
    file.classList.add('dragging');
    dndLog('synthetic drag start', { path });
  }, true);

  // Suppress native HTML5 drag when using synthetic mode
  document.addEventListener('dragstart', (e) => {
    if (window.__useSyntheticDrag) {
      e.preventDefault();
      dndLog('suppressed native dragstart (synthetic mode)');
    }
  }, true);
  
  // Handle mousemove during synthetic drag
  document.addEventListener('mousemove', (e) => {
    if (!draggedElement || !window.__useSyntheticDrag) return;
    
    updateGhostPosition(e.clientX, e.clientY);
    
    // Find and highlight drop target
    const newTarget = findDropTarget(e.clientX, e.clientY);
    if (newTarget !== dropTarget) {
      if (dropTarget && dropTarget.classList?.contains('tree-item') && dropTarget.classList.contains('folder')) {
        dropTarget.classList.remove('drag-over');
      }
      if (newTarget && newTarget.classList?.contains('tree-item') && newTarget.classList.contains('folder')) {
        newTarget.classList.add('drag-over');
      }
      dropTarget = newTarget;
      dndLog('synthetic drag over', { target: dropTarget?.getAttribute('data-path') });
    }
  }, true);
  
  // Handle mouseup to complete synthetic drag
  document.addEventListener('mouseup', async (e) => {
    if (!draggedElement || !window.__useSyntheticDrag) return;
    
    const sourcePath = window.__dragSourcePath;
    // Determine destination; root target uses data-path="" (vault root)
    const destinationPath = dropTarget?.getAttribute('data-path') ?? '';
    
    // Clean up UI
    if (dragGhost) {
      dragGhost.remove();
      dragGhost = null;
    }
    if (draggedElement) {
      draggedElement.classList.remove('dragging');
    }
    if (dropTarget && dropTarget.classList?.contains('tree-item') && dropTarget.classList.contains('folder')) {
      dropTarget.classList.remove('drag-over');
    }
    
    // Perform move if we had a recognized drop target (folder or root target)
    if (sourcePath && dropTarget) {
      dndLog('synthetic drop', { sourcePath, destinationPath });
      await performMoveToFolder(sourcePath, destinationPath);
    } else {
      dndLog('synthetic drag cancelled');
    }
    
    // Reset state
    draggedElement = null;
    dropTarget = null;
    window.__dragSourcePath = null;
  }, true);
  
  console.log('[DnD] Synthetic drag handlers initialized');
}

// Auto-enable synthetic drag on WebKit (WKWebView)
try {
  const isWebKit = !!window.webkit || /AppleWebKit/i.test(navigator.userAgent || '');
  if (isWebKit) {
    console.log('[DnD] WebKit detected — enabling synthetic drag mode');
    window.enableSyntheticDrag();
  }
} catch (_) {}

// Add root drop zone support (OPTIONAL - call this after enableSyntheticDrag)
// (Root drop zone feature removed to restore documented working solution)

// DnD Test Harness - Call window.testDnD() to create test zones
window.testDnD = function() {
  const testHtml = `
    <div id="dnd-test-harness" style="position: fixed; top: 100px; left: 50%; transform: translateX(-50%); 
         background: white; border: 2px solid red; padding: 20px; z-index: 99999; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">
      <h3 style="margin: 0 0 10px 0;">DnD Test Harness</h3>
      <div style="display: flex; gap: 20px;">
        <div id="test-drag-source" draggable="true" style="width: 100px; height: 100px; background: #4CAF50; 
             display: flex; align-items: center; justify-content: center; cursor: move; color: white; font-weight: bold;">
          DRAG ME
        </div>
        <div id="test-drop-target" style="width: 100px; height: 100px; background: #2196F3; border: 2px dashed white;
             display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
          DROP HERE
        </div>
      </div>
      <div id="test-log" style="margin-top: 10px; max-height: 200px; overflow-y: auto; background: #f0f0f0; 
           padding: 5px; font-family: monospace; font-size: 12px;"></div>
      <button onclick="document.getElementById('dnd-test-harness').remove();" 
              style="margin-top: 10px; padding: 5px 10px;">Close Test</button>
    </div>
  `;
  
  // Remove existing test harness if any
  const existing = document.getElementById('dnd-test-harness');
  if (existing) existing.remove();
  
  // Add test harness to page
  document.body.insertAdjacentHTML('beforeend', testHtml);
  
  const source = document.getElementById('test-drag-source');
  const target = document.getElementById('test-drop-target');
  const log = document.getElementById('test-log');
  
  const testLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    log.innerHTML = `<div>${time}: ${msg}</div>` + log.innerHTML;
    console.log('[DnD Test]', msg);
  };
  
  // Source events
  source.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', 'test-data');
    e.dataTransfer.setData('text/uri-list', 'file://test');
    e.dataTransfer.setData('application/x-test', 'test');
    e.dataTransfer.effectAllowed = 'move';
    source.style.opacity = '0.5';
    testLog(`dragstart - types: ${Array.from(e.dataTransfer.types).join(', ')}`);
  });
  
  source.addEventListener('dragend', (e) => {
    source.style.opacity = '1';
    testLog(`dragend - dropEffect: ${e.dataTransfer.dropEffect}`);
  });
  
  // Target events
  target.addEventListener('dragenter', (e) => {
    e.preventDefault();
    target.style.background = '#FF9800';
    testLog('dragenter on target');
  });
  
  target.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    testLog('dragover on target');
  });
  
  target.addEventListener('dragleave', (e) => {
    target.style.background = '#2196F3';
    testLog('dragleave on target');
  });
  
  target.addEventListener('drop', (e) => {
    e.preventDefault();
    target.style.background = '#4CAF50';
    const data = e.dataTransfer.getData('text/plain');
    testLog(`DROP SUCCESS! Data: ${data}`);
    setTimeout(() => {
      target.style.background = '#2196F3';
    }, 1000);
  });
  
  testLog('Test harness ready. Try dragging green box to blue box.');
};

// Enhanced debugging for hit-testing
window.testHitTest = function() {
  const handler = (e) => {
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    const info = els.slice(0, 5).map(el => {
      const id = el.id ? `#${el.id}` : '';
      const classes = el.className ? `.${el.className.split(' ').join('.')}` : '';
      return `${el.tagName.toLowerCase()}${id}${classes}`;
    }).join(' > ');
    console.log('[HitTest]', info);
  };
  
  document.addEventListener('mousemove', handler);
  console.log('[HitTest] Started. Move mouse to see element stack. Run window.stopHitTest() to stop.');
  
  window.stopHitTest = () => {
    document.removeEventListener('mousemove', handler);
    console.log('[HitTest] Stopped.');
  };
};
let currentEditor = null;
let currentThemeManager = null;
let currentFile = null;
let appInitialized = false;
let paneManager = null;
window.paneManager = null; // Make accessible globally
let statusBarVisible = true; // Global status bar visibility state
let chatPanel = null; // Enhanced chat panel
window.chatPanel = null; // Make accessible globally
let mcpSettings = null; // MCP settings panel
window.mcpSettings = null; // Make accessible globally

// Import event listener from Tauri
import { listen } from '@tauri-apps/api/event';

// Set up graph sync event listeners
function setupGraphSyncListeners() {
    console.log('🎯 Setting up graph sync event listeners...');
    
    // Listen for sync started events
    listen('graph:sync:started', (event) => {
        console.log('🔄 Graph sync started:', event.payload);
    });
    
    // Listen for sync completed events
    listen('graph:sync:completed', (event) => {
        console.log('✅ Graph sync completed:', event.payload);
    });
    
    // Listen for sync error events
    listen('graph:sync:error', (event) => {
        console.error('❌ Graph sync error:', event.payload);
    });
    
    // Poll for sync status periodically (every 5 seconds)
    setInterval(async () => {
        try {
            const status = await invoke('graph_sync_status');
            if (status.enabled && status.pendingUpdates > 0) {
                console.log(`📊 Graph sync queue: ${status.pendingUpdates} pending updates`);
            }
        } catch (e) {
            // Silently ignore if graph sync not available
        }
    }, 5000);
}

// Listen for navigation to a file and line from backend commands
listen('open-file-at-line', async (event) => {
  try {
    const { filePath, lineNumber } = event.payload || {}
    if (!filePath) return
    // Open file (or activate if open)
    await window.openFile(filePath)
    // Move cursor to line if editor is available
    if (window.paneManager) {
      const tabManager = window.paneManager.getActiveTabManager()
      const activeTab = tabManager?.getActiveTab()
      const editor = activeTab?.editor
      if (editor?.view && Number.isInteger(lineNumber) && lineNumber > 0) {
        const line = editor.view.state.doc.line(Math.min(lineNumber, editor.view.state.doc.lines))
        editor.view.dispatch({
          selection: { anchor: line.from },
          scrollIntoView: true
        })
        editor.view.focus()
      }
    }
  } catch (e) {
    console.warn('Failed to handle open-file-at-line event:', e)
  }
})

// Test functions for streaming
window.testStreaming = async function() {
    console.log('🧪 Testing AI Streaming...');
    
    try {
        // Get the chat panel
        const chatPanel = window.chatPanel;
        if (!chatPanel) {
            console.error('Chat panel not found. Make sure chat is open.');
            return;
        }
        
        // Get the OpenAI SDK
        const sdk = chatPanel.providers.openai.sdk;
        if (!sdk || !sdk.isInitialized) {
            console.error('OpenAI SDK not initialized');
            return;
        }
        
        console.log('✅ SDK found and initialized');
        
        // Check if streaming should be used
        const useStreaming = chatPanel.shouldUseStreaming(sdk);
        console.log('Should use streaming?', useStreaming);
        
        // Test messages
        const messages = [
            {
                role: 'system',
                content: 'You are a helpful assistant.'
            },
            {
                role: 'user',
                content: 'Tell me a short story about a robot learning to paint. Make it about 3 paragraphs.'
            }
        ];
        
        if (useStreaming) {
            console.log('📤 Sending streaming request...');
            
            let fullResponse = '';
            let tokenCount = 0;
            
            // Set up callbacks
            const callbacks = {
                onToken: (token) => {
                    tokenCount++;
                    fullResponse += token;
                    console.log(`Token ${tokenCount}: "${token}"`);
                },
                
                onError: (error) => {
                    console.error('❌ Stream error:', error);
                },
                
                onDone: () => {
                    console.log('✅ Streaming complete!');
                    console.log(`Total tokens: ${tokenCount}`);
                    console.log('Full response:', fullResponse);
                }
            };
            
            // Start streaming
            await sdk.sendChatStream(messages, callbacks);
        } else {
            console.log('📤 Sending non-streaming request...');
            const response = await sdk.sendChat(messages);
            console.log('✅ Response received:', response);
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
};

// Test context retrieval and message formatting
window.testContext = async function() {
    console.log('🧪 Testing context retrieval and message formatting...');
    
    try {
        const chatPanel = window.chatPanel;
        if (!chatPanel) {
            console.error('Chat panel not found');
            return;
        }
        
        // Test 1: Get context
        const context = await chatPanel.getAllContext();
        console.log('\n1. Retrieved context:', context);
        
        if (context && context.length > 0) {
            context.forEach((note, index) => {
                console.log(`Note ${index + 1}:`);
                console.log('  Title:', note.title);
                console.log('  Path:', note.path);
                console.log('  Content length:', note.content?.length || 0);
                console.log('  Content preview:', note.content?.substring(0, 100) + '...');
            });
        } else {
            console.log('No context found');
        }
        
        // Test 2: Format messages
        const sdk = chatPanel.providers.openai.sdk;
        if (sdk && sdk.isInitialized) {
            console.log('\n2. Testing message formatting...');
            const testMessage = 'summarize this note';
            const formattedMessages = await sdk.formatMessages(testMessage, context);
            
            console.log('Formatted messages:', formattedMessages.length);
            formattedMessages.forEach((msg, index) => {
                console.log(`\nMessage ${index + 1}:`);
                console.log('  Role:', msg.role);
                console.log('  Content preview:', msg.content.substring(0, 200) + '...');
                if (msg.content.includes('CURRENT CONTEXT')) {
                    console.log('  ✅ Contains CURRENT CONTEXT marker');
                }
            });
        }
        
        // Test 3: Check tab manager
        console.log('\n3. Checking tab manager state...');
        if (window.paneManager) {
            const activeTabManager = window.paneManager.getActiveTabManager();
            console.log('Active tab manager exists?', !!activeTabManager);
            
            if (activeTabManager) {
                const activeTab = activeTabManager.getActiveTab();
                console.log('Active tab exists?', !!activeTab);
                if (activeTab) {
                    console.log('Tab has editor?', !!activeTab.editor);
                    console.log('Tab title:', activeTab.title);
                    console.log('Tab file path:', activeTab.filePath);
                    if (activeTab.editor) {
                        console.log('Editor has view?', !!activeTab.editor.view);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('Test failed:', error);
        console.error(error.stack);
    }
};

// Test context right before sending message
window.debugNextMessage = function() {
    console.log('🔍 Debugging enabled for next message...');
    
    if (!window.chatPanel) {
        console.error('Chat panel not found');
        return;
    }
    
    // Store original getAllContext method
    const originalGetAllContext = window.chatPanel.getAllContext.bind(window.chatPanel);
    
    // Override temporarily
    window.chatPanel.getAllContext = async function() {
        console.log('🚨 getAllContext called!');
        const context = await originalGetAllContext();
        console.log('Context retrieved:', context);
        
        if (context.length === 0) {
            console.error('❌ NO CONTEXT FOUND! This is why AI doesn\'t see your note.');
            
            // Try to debug why
            const activeNote = await this.getActiveNoteContent();
            console.log('Active note check:', activeNote ? 'Found' : 'Not found');
            
            if (!activeNote) {
                console.log('Debugging active note retrieval...');
                if (window.paneManager) {
                    const mgr = window.paneManager.getActiveTabManager();
                    const tab = mgr?.getActiveTab();
                    console.log('Tab manager:', !!mgr, 'Active tab:', !!tab);
                    if (tab) {
                        console.log('Tab has editor?', !!tab.editor);
                        console.log('Tab title:', tab.title);
                    }
                }
            }
        }
        
        // Restore original method
        window.chatPanel.getAllContext = originalGetAllContext;
        
        return context;
    };
    
    console.log('✅ Debug mode enabled. Send a message now to see detailed context info.');
};

// Quick test for active note content
window.testActiveNote = async function() {
    console.log('📄 Quick test for active note content...');
    
    if (!window.chatPanel) {
        console.error('Chat panel not found');
        return;
    }
    
    const activeNote = await window.chatPanel.getActiveNoteContent();
    if (activeNote) {
        console.log('✅ Active note found!');
        console.log('Title:', activeNote.title);
        console.log('Path:', activeNote.path);
        console.log('Content length:', activeNote.content.length);
        console.log('First 200 chars:', activeNote.content.substring(0, 200));
    } else {
        console.log('❌ No active note found');
    }
};

// Test message formatting
window.testMessageFormat = async function() {
    console.log('🧪 Testing message formatting...');
    
    try {
        const chatPanel = window.chatPanel;
        if (!chatPanel) {
            console.error('Chat panel not found');
            return;
        }
        
        const sdk = chatPanel.providers.openai.sdk;
        if (!sdk || !sdk.isInitialized) {
            console.error('SDK not initialized');
            return;
        }
        
        // Get context
        const context = await chatPanel.getAllContext();
        console.log('Context:', context.length, 'notes');
        
        // Format test message
        const messages = await sdk.formatMessages('summarize this note', context);
        
        console.log('\nFormatted messages:');
        messages.forEach((msg, i) => {
            console.log(`\nMessage ${i + 1}:`);
            console.log('Role:', msg.role);
            console.log('Content:', msg.content.substring(0, 500) + '...');
        });
        
        // Check if using Gemma format
        const settings = sdk.getSettings();
        console.log('\nModel:', settings?.model);
        console.log('Should use Gemma format?', settings?.model?.toLowerCase().includes('gemma'));
        
    } catch (error) {
        console.error('Test failed:', error);
    }
};

// Test Ollama non-streaming
window.testOllama = async function() {
    console.log('🧪 Testing Ollama integration...');
    
    try {
        const chatPanel = window.chatPanel;
        if (!chatPanel) {
            console.error('Chat panel not found. Make sure chat is open.');
            return;
        }
        
        const sdk = chatPanel.providers.openai.sdk;
        if (!sdk || !sdk.isInitialized) {
            console.error('SDK not initialized');
            return;
        }
        
        const settings = sdk.getSettings();
        console.log('Current settings:', settings);
        
        // Check if we're using Ollama
        const isOllama = settings?.endpoint?.includes('ollama') || settings?.endpoint?.includes('11434');
        console.log('Is Ollama endpoint?', isOllama);
        
        // Test shouldUseStreaming
        const useStreaming = chatPanel.shouldUseStreaming(sdk);
        console.log('Should use streaming?', useStreaming);
        
        // Send a test message
        const messages = [
            {
                role: 'system',
                content: 'You are a helpful assistant.'
            },
            {
                role: 'user',
                content: 'Say hello in one sentence.'
            }
        ];
        
        console.log('Sending test message...');
        const response = await sdk.sendChat(messages);
        console.log('Response:', response);
        
    } catch (error) {
        console.error('Test failed:', error);
    }
};

// Also test with the chat interface
window.testStreamingInChat = async function() {
    console.log('🧪 Testing streaming in chat interface...');
    
    try {
        const chatPanel = window.chatPanel;
        if (!chatPanel) {
            console.error('Chat panel not found');
            return;
        }
        
        // Simulate sending a message
        await chatPanel.handleSendMessage('Write a haiku about programming with streaming enabled.');
        
    } catch (error) {
        console.error('Chat test failed:', error);
    }
};

// Initialize Enhanced Chat Panel
async function initializeChatPanel() {
  console.log('💬 Initializing Enhanced Chat Panel...');
  
  const chatContainer = document.getElementById('chat-panel-container');
  if (!chatContainer) {
    console.error('❌ Chat panel container not found in DOM');
    console.log('🔍 Available containers:', document.querySelectorAll('[id*="chat"]'));
    return;
  }
  
  try {
    console.log('🔧 Creating EnhancedChatPanel instance...');
    chatPanel = new EnhancedChatPanel();
    window.chatPanel = chatPanel;
    
    console.log('📌 Mounting chat panel to container...');
    await chatPanel.mount(chatContainer);
    console.log('✅ Enhanced Chat Panel initialized successfully');
    console.log('🔍 Chat panel object:', chatPanel);
  } catch (error) {
    console.error('❌ Failed to initialize Enhanced Chat Panel:', error);
    console.error('📋 Error details:', error.stack);
  }
}

// Initialize MCP Settings Panel
async function initializeMCPSettings() {
  console.log('🔧 Initializing MCP Settings Panel...');
  
  // Create container for MCP settings
  let settingsContainer = document.getElementById('mcp-settings-container');
  if (!settingsContainer) {
    settingsContainer = document.createElement('div');
    settingsContainer.id = 'mcp-settings-container';
    document.body.appendChild(settingsContainer);
  }
  
  try {
    console.log('🔧 Creating MCPSettingsPanel instance...');
    mcpSettings = mcpSettingsPanel;
    window.mcpSettings = mcpSettings;
    
    console.log('📌 Mounting MCP settings panel...');
    await mcpSettings.mount(settingsContainer);
    console.log('✅ MCP Settings Panel initialized successfully');
    console.log('🔍 mcpSettings object:', mcpSettings);
    console.log('🔍 mcpSettings.show method exists?', typeof mcpSettings.show);
  } catch (error) {
    console.error('❌ Failed to initialize MCP Settings Panel:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Initialize CodeMirror editor with panes
async function initializeEditor() {
  const editorWrapper = document.getElementById('editor-wrapper');
  if (!editorWrapper) {
    console.error('❌ Editor wrapper not found');
    return;
  }

  try {
    console.log('🔲 Creating PaneManager...');
    paneManager = new PaneManager();
    window.paneManager = paneManager; // Make accessible globally
    console.log('✅ PaneManager created');
    
    // Clear editor wrapper and mount PaneManager
    editorWrapper.innerHTML = '';
    paneManager.mount(editorWrapper);
    
    // Get the initial TabManager from the first pane
    const tabManager = paneManager.getActiveTabManager();
    window.tabManager = tabManager; // Keep compatibility with NewTabScreen
    
    // Update window.tabManager when pane is activated
    paneManager.on('pane-activated', ({ paneId }) => {
      window.tabManager = paneManager.getTabManager(paneId);
      updateNavigationButtons(); // Update nav button states
    });
    
    // Set up navigation listeners when new panes are created
    paneManager.on('split-created', ({ paneId }) => {
      const pane = paneManager.panes.get(paneId);
      if (pane && pane.tabManager) {
        setupTabNavigationListeners(pane.tabManager);
      }
    });
    
    // Listen for tab changes to update editor reference
    tabManager.on('tab-changed', ({ tabId }) => {
      const tab = tabManager.getActiveTab();
      if (tab) {
        currentEditor = tab.editor;
        currentFile = tab.filePath;
        updateEditorHeader(tab.title);
        updateWordCount();
        updateNavigationButtons(); // Update nav button states
        
        // Apply theme to new editor
        if (currentThemeManager) {
          currentThemeManager.setEditor(currentEditor);
        }
        
        // Update widget sidebar with new editor
        if (window.widgetSidebar) {
          window.widgetSidebar.updateActiveEditor(currentEditor);
        }
        
        // Show editor wrapper
        const editorWrapper = document.getElementById('editor-wrapper');
        if (editorWrapper) {
          editorWrapper.style.display = 'block';
        }
        const welcomeContainer = document.querySelector('.welcome-container');
        if (welcomeContainer) {
          welcomeContainer.style.display = 'none';
        }
        
        // Apply global status bar visibility when switching tabs
        const statusBar = document.getElementById('editor-status-bar');
        if (statusBar) {
          statusBar.style.display = statusBarVisible ? 'flex' : 'none';
        }
        
        // Update menu text to match current state
        const menuText = document.getElementById('status-bar-text');
        if (menuText) {
          menuText.textContent = statusBarVisible ? 'Hide status bar' : 'Show status bar';
        }
      } else {
        // No tabs, show welcome screen
        showWelcomeScreen();
      }
    });
    
    // Set up navigation listeners for this tab manager
    setupTabNavigationListeners(tabManager);
    
    // Listen for tab closed to show welcome when no tabs
    tabManager.on('tab-closed', () => {
      if (tabManager.tabs.size === 0) {
        showWelcomeScreen();
      }
    });
    
    // Listen for editor changes to update dirty state
    tabManager.on('tab-created', ({ tabId, tab }) => {
      setupEditorChangeTracking(tabId, tab);
    });
    
    // Show welcome screen initially
    showWelcomeScreen();
    
    // Hide navigation buttons initially since no tabs are open
    updateNavigationButtons();
    
    // Listen for file events for PACASDB sync
    window.addEventListener('file-created', async (event) => {
      const filePath = event.detail.filePath;
      if (vaultSync && filePath.endsWith('.md')) {
        vaultSync.handleFileEvent(filePath, 'create');
      }
    });

    window.addEventListener('file-deleted', async (event) => {
      const filePath = event.detail.filePath;
      if (vaultSync && filePath.endsWith('.md')) {
        vaultSync.handleFileEvent(filePath, 'remove');
      }
    });

    // Listen for file updates to reload open tabs
    window.addEventListener('file-updated', async (event) => {
      const updatedFilePath = event.detail.filePath;
      console.log('📝 File updated event received:', updatedFilePath);

      // Trigger PACASDB sync for markdown files
      if (vaultSync && updatedFilePath.endsWith('.md')) {
        vaultSync.handleFileEvent(updatedFilePath, 'modify');
      }
      
      // Check all panes for tabs showing this file
      for (const [paneId, pane] of paneManager.panes) {
        const tabManager = pane.tabManager;
        
        // Find any tabs showing this file
        for (const [tabId, tab] of tabManager.tabs) {
          if (tab.filePath === updatedFilePath && tab.editor) {
            console.log(`🔄 Reloading tab ${tabId} in pane ${paneId}`);
            
            try {
              // Read the updated content
              const content = await invoke('read_file_content', { filePath: updatedFilePath });
              
              // Update the editor
              tab.editor.setContent(content, false, updatedFilePath, false);
              tab.editor.currentFile = updatedFilePath;
              
              // Mark as not dirty since we just loaded from disk
              tabManager.setTabDirty(tabId, false);
              pane.tabBar.updateTabDirtyState(tabId, false);
              
              console.log(`✅ Reloaded ${updatedFilePath} in tab ${tabId}`);
            } catch (error) {
              console.error('Error reloading file:', error);
            }
          }
        }
      }
    });
    
    console.log('✅ Pane system initialized');
    
    // Set up keyboard shortcuts for tabs
    setupTabKeyboardShortcuts();
  } catch (error) {
    console.error('❌ Error initializing editor:', error);
    throw error;
  }
}

// Set up keyboard shortcuts for tab navigation
// Helper function to set up navigation listeners for a TabManager
function setupTabNavigationListeners(tabManager) {
  // Listen for tab navigation to load file content
  tabManager.on('tab-navigated', async ({ tabId, filePath }) => {
    const tab = tabManager.tabs.get(tabId);
    if (!tab || !filePath) return;
    
    try {
      // Load the file content
      const content = await invoke('read_file_content', { filePath });
      
      // Update editor with new content
      if (tab.editor) {
        tab.editor.setContent(content, false, filePath, false);
        tab.editor.currentFile = filePath;
      }
      
      // Update tab title - find the pane that owns this TabManager
      let owningPane = null;
      for (const [paneId, pane] of paneManager.panes) {
        if (pane.tabManager === tabManager) {
          owningPane = pane;
          break;
        }
      }
      
      if (owningPane && owningPane.tabBar) {
        owningPane.tabBar.updateTabTitle(tab.id, tab.title);
      }
      
      // Update global references if this is the active tab in the active pane
      if (paneManager.activePaneId && owningPane && owningPane.id === paneManager.activePaneId && tabManager.activeTabId === tabId) {
        currentFile = filePath;
        currentEditor = tab.editor;
        updateEditorHeader(tab.title);
        updateNavigationButtons();
        
        // Update widget sidebar with new editor
        if (window.widgetSidebar) {
          window.widgetSidebar.updateActiveEditor(currentEditor);
        }
      }
    } catch (error) {
      console.error('Error loading file during navigation:', error);
      showError(`Failed to load ${filePath}: ${error}`);
    }
  });
}

// Helper function to set up change tracking for an editor
function setupEditorChangeTracking(tabId, tab) {
  if (tab.editor && tab.editor.view) {
    // Use the editor's built-in change tracking
    const originalSetContent = tab.editor.setContent.bind(tab.editor);
    tab.editor.setContent = function(...args) {
      // Forward all args so selection/scroll preservation flags continue to work
      originalSetContent(...args);
      // Reset dirty state when content is set
      const tabManager = paneManager ? paneManager.getActiveTabManager() : null;
      if (tabManager) {
        tabManager.setTabDirty(tabId, false);
        // Update TabBar through the active pane
        const activePane = paneManager.panes.get(paneManager.activePaneId);
        if (activePane && activePane.tabBar) {
          activePane.tabBar.updateTabDirtyState(tabId, false);
        }
      }
    };
    
    // Mark as dirty on any edit
    const originalDispatch = tab.editor.view.dispatch.bind(tab.editor.view);
    tab.editor.view.dispatch = function(tr) {
      originalDispatch(tr);
      if (tr.docChanged && tab.filePath) {
        const tabManager = paneManager ? paneManager.getActiveTabManager() : null;
        if (tabManager) {
          tabManager.setTabDirty(tabId, true);
          // Update TabBar through the active pane
          const activePane = paneManager.panes.get(paneManager.activePaneId);
          if (activePane && activePane.tabBar) {
            activePane.tabBar.updateTabDirtyState(tabId, true);
          }
        }
      }
    };
  }
}

// Global callback for when files are saved - clears dirty state
window.onFileSaved = function(filePath) {
  console.log('🔍 onFileSaved called with:', filePath)
  if (!paneManager) {
    console.log('❌ No paneManager available')
    return
  }
  
  console.log('🔍 Searching for tab with path:', filePath)
  console.log('🔍 Number of panes:', paneManager.panes.size)
  
  // Find the tab with this file path in all panes
  for (const [paneId, pane] of paneManager.panes) {
    console.log('🔍 Checking pane:', paneId)
    console.log('🔍 Pane has tabManager:', !!pane.tabManager)
    
    // Log all tabs in this pane
    if (pane.tabManager && pane.tabManager.tabs) {
      for (const [tabId, tab] of pane.tabManager.tabs) {
        console.log(`🔍 Tab ${tabId} has filePath:`, tab.filePath)
      }
    }
    
    const tab = pane.tabManager.findTabByPath(filePath)
    if (tab) {
      console.log('✅ Found tab:', tab.id, 'with path:', tab.filePath)
      console.log('🧹 Clearing dirty state for saved file:', filePath)
      pane.tabManager.setTabDirty(tab.id, false)
      if (pane.tabBar) {
        pane.tabBar.updateTabDirtyState(tab.id, false)
      }
      break
    } else {
      console.log('❌ No tab found in pane', paneId, 'for path:', filePath)
    }
  }
}

// MCP status removed from UI for cleaner interface

// Track tool executions
window.onMCPToolExecuted = function(toolName) {
  window.lastMCPToolExecution = {
    tool: toolName,
    time: Date.now()
  };
  // MCP status removed from UI
}

let keyboardShortcutsInitialized = false;

/**
 * Toggle global search panel visibility
 */
function toggleGlobalSearchPanel() {
  if (!globalSearchPanel) {
    console.error('Global search panel not initialized');
    return;
  }

  const modalId = 'global-search-modal';
  let modal = document.getElementById(modalId);

  if (modal) {
    // Modal exists, remove it
    modal.remove();
    return;
  }

  // Create modal
  modal = document.createElement('div');
  modal.id = modalId;
  modal.className = 'modal-overlay';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';
  modalContent.style.cssText = `
    background: var(--background);
    border-radius: 8px;
    padding: 20px;
    max-width: 800px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `;

  // Render search panel
  const panelElement = globalSearchPanel.render();
  modalContent.appendChild(panelElement);

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });

  // Close on Escape
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);

  // Auto-focus search input
  setTimeout(() => {
    const searchInput = panelElement.querySelector('input.search-input');
    if (searchInput) {
      searchInput.focus();
    }
  }, 100);
}

function setupTabKeyboardShortcuts() {
  // Only set up keyboard shortcuts once
  if (keyboardShortcutsInitialized) {
    console.log('⚠️ Keyboard shortcuts already initialized, skipping...');
    return;
  }
  keyboardShortcutsInitialized = true;
  console.log('⌨️ Setting up keyboard shortcuts...');
  
  document.addEventListener('keydown', async (e) => {
    // Debug keyboard events with Shift
    if (e.shiftKey && e.metaKey) {
      console.log('Shift+Cmd key pressed:', e.key, 'keyCode:', e.keyCode);
    }
    
    // Cmd+Option+I: Open Developer Tools
    if (e.metaKey && e.altKey && e.key === 'i') {
      e.preventDefault();
      console.log('Opening developer tools...');
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('toggle_devtools');
        console.log('Developer tools opened successfully');
      } catch (error) {
        console.error('Failed to open devtools:', error);
      }
      return;
    }
    
    // Cmd+F: Global Search
    if ((e.metaKey || e.ctrlKey) && e.key === 'f' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      console.log('Cmd+F pressed - Opening global search');
      console.log('globalSearch instance exists:', !!globalSearch);
      console.log('globalSearch state:', {
        container: !!globalSearch?.container,
        isVisible: globalSearch?.isVisible,
        instance: globalSearch
      });
      try {
        globalSearch.toggle();
      } catch (error) {
        console.error('Error calling globalSearch.toggle():', error);
      }
      return;
    }
    
    // Cmd+Shift+F: PACASDB Global Search (Premium)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      console.log('Cmd+Shift+F pressed - Opening PACASDB Global Search');

      if (globalSearchPanel) {
        toggleGlobalSearchPanel();
      } else {
        console.log('Global search panel not initialized');
      }
      return;
    }
    
    // Cmd+Shift+P: Plugin Hub
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
      e.preventDefault();
      console.log('Cmd+Shift+P pressed - Opening Plugin Hub');
      if (window.pluginHub) {
        console.log('Plugin Hub instance found, calling open()...');
        window.pluginHub.open().then(() => {
          console.log('Plugin Hub opened successfully');
        }).catch(err => {
          console.error('Error opening Plugin Hub:', err);
        });
      } else {
        console.warn('Plugin Hub not initialized');
      }
      return;
    }
    
    // Cmd+Shift+M: MCP Settings (check this first, before tab shortcuts)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'M') {
      e.preventDefault();
      console.log('Cmd+Shift+M pressed');
      window.showMCPSettings();
      return;
    }
    
    // Cmd+Alt+T: Open Task Dashboard (before tabManager check)
    if (e.metaKey && e.altKey && (e.key === 't' || e.key === 'T')) {
      e.preventDefault();
      console.log('Opening Task Dashboard with Cmd+Alt+T');
      window.openTaskDashboard();
      return;
    }
    
    const tabManager = paneManager ? paneManager.getActiveTabManager() : null;
    if (!tabManager) return;
    
    // Cmd+Shift+T: New Tab
    if (e.metaKey && e.shiftKey && (e.key === 't' || e.key === 'T')) {
      e.preventDefault();
      if (tabManager.tabs.size < tabManager.maxTabs) {
        const tabId = tabManager.createTab();
        tabManager.activateTab(tabId);
      }
    }
    
    // Cmd+T: Insert markdown task checkbox
    if (e.metaKey && !e.shiftKey && e.key === 't') {
      e.preventDefault();
      const activeTab = tabManager.getActiveTab();
      if (activeTab && activeTab.editor && activeTab.type === 'markdown') {
        const editor = activeTab.editor;
        const selection = editor.view.state.selection.main;
        const text = '- [ ] ';
        
        // Insert the text and move cursor to the end
        editor.view.dispatch({
          changes: {
            from: selection.from,
            to: selection.to,
            insert: text
          },
          selection: { anchor: selection.from + text.length }
        });
      }
    }
    
    // Cmd+W: Close current tab
    if (e.metaKey && e.key === 'w') {
      e.preventDefault();
      const activeTab = tabManager.getActiveTab();
      if (activeTab) {
        tabManager.closeTab(activeTab.id);
      }
    }
    
    // Cmd+Tab: Next tab
    if (e.metaKey && e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const tabs = tabManager.getTabs();
      const activeTab = tabManager.getActiveTab();
      if (activeTab && tabs.length > 1) {
        const currentIndex = tabs.findIndex(t => t.id === activeTab.id);
        const nextIndex = (currentIndex + 1) % tabs.length;
        tabManager.activateTab(tabs[nextIndex].id);
      }
    }
    
    // Cmd+Shift+Tab: Previous tab
    if (e.metaKey && e.shiftKey && e.key === 'Tab') {
      e.preventDefault();
      const tabs = tabManager.getTabs();
      const activeTab = tabManager.getActiveTab();
      if (activeTab && tabs.length > 1) {
        const currentIndex = tabs.findIndex(t => t.id === activeTab.id);
        const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        tabManager.activateTab(tabs[prevIndex].id);
      }
    }
    
    // Cmd+1-5: Switch to specific tab
    if (e.metaKey && e.key >= '1' && e.key <= '5') {
      e.preventDefault();
      const tabIndex = parseInt(e.key) - 1;
      const tabs = tabManager.getTabs();
      if (tabIndex < tabs.length) {
        tabManager.activateTab(tabs[tabIndex].id);
      }
    }
    
    // Cmd+\: Toggle split view
    if (e.metaKey && e.key === '\\') {
      e.preventDefault();
      window.toggleSplitView();
    }
    
    // Cmd+[ or Alt+Left: Navigate back
    if ((e.metaKey && e.key === '[') || (e.altKey && e.key === 'ArrowLeft')) {
      e.preventDefault();
      window.navigateBack();
    }
    
    // Cmd+] or Alt+Right: Navigate forward
    if ((e.metaKey && e.key === ']') || (e.altKey && e.key === 'ArrowRight')) {
      e.preventDefault();
      window.navigateForward();
    }
    
    // Cmd+Option+Z: Toggle zen mode
    if (e.metaKey && e.altKey && (e.key === 'z' || e.key === 'Ω')) {
      e.preventDefault();
      console.log('🔑 Zen mode shortcut triggered');
      window.toggleZenMode();
    }
    
    // ESC to exit zen mode
    if (e.key === 'Escape' && isZenMode) {
      e.preventDefault();
      window.toggleZenMode();
    }
    
    // Cmd+N: Create new note in root folder
    if (e.metaKey && e.key === 'n') {
      e.preventDefault();
      console.log('📝 Creating new note with Cmd+N');
      window.showCreateFileModal('');
    }
    
    // Cmd+S: Save current file
    if (e.metaKey && e.key === 's') {
      e.preventDefault();
      const activeTab = tabManager.getActiveTab();
      if (activeTab && activeTab.editor && activeTab.type === 'markdown') {
        activeTab.editor.save();
      }
    }
    
    // Cmd+B: Handle bold formatting
    if (e.metaKey && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      if (currentEditor && currentEditor.view) {
        e.preventDefault();
        console.log('Calling toggleBold on active editor');
        currentEditor.toggleBold();
        return;
      }
    }
    
    
    // Cmd+J: Handle underline formatting
    if (e.metaKey && !e.shiftKey && (e.key === 'j' || e.key === 'J')) {
      if (currentEditor && currentEditor.view) {
        e.preventDefault();
        console.log('Calling toggleUnderline on active editor');
        currentEditor.toggleUnderline();
        return;
      }
    }
    
    // Cmd+H: Handle highlight formatting
    if (e.metaKey && !e.shiftKey && (e.key === 'h' || e.key === 'H')) {
      if (currentEditor && currentEditor.view) {
        e.preventDefault();
        console.log('Calling toggleHighlight on active editor');
        currentEditor.toggleHighlight();
        return;
      }
    }
    
    // Cmd+K: Insert link
    if (e.metaKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
      if (currentEditor && currentEditor.view) {
        e.preventDefault();
        console.log('Calling insertLink on active editor');
        currentEditor.insertLink();
        return;
      }
    }
    
    // Cmd+Shift+X: Handle strikethrough formatting
    if (e.metaKey && e.shiftKey && (e.key === 'x' || e.key === 'X')) {
      if (currentEditor && currentEditor.view) {
        e.preventDefault();
        console.log('Calling toggleStrikethrough on active editor');
        currentEditor.toggleStrikethrough();
        return;
      }
    }
    
    // Cmd+Shift+C: Toggle AI Chat Panel
    if (e.metaKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      console.log('💬 Toggling chat panel with Cmd+Shift+C');
      window.toggleChatPanel();
    }
    
    // Cmd+Shift+E: Export to PDF
    if (e.metaKey && e.shiftKey && e.key === 'E') {
      e.preventDefault();
      console.log('📄 Export to PDF with Cmd+Shift+E');
      window.exportToPDF();
    }
    
    // Cmd+Shift+W: Export to Word
    if (e.metaKey && e.shiftKey && e.key === 'W') {
      e.preventDefault();
      console.log('📄 Export to Word with Cmd+Shift+W');
      window.exportToWord();
    }
  });
}

async function loadEditorPreferences(editor) {
  try {
    const prefs = await invoke('get_editor_preferences');
    console.log('[loadEditorPreferences] Loaded prefs:', prefs);
    console.log('[loadEditorPreferences] Theme from prefs:', prefs.theme);

    // Create theme manager if needed
    if (!currentThemeManager) {
      console.log('[loadEditorPreferences] Creating new ThemeManager');
      currentThemeManager = new ThemeManager(editor);
      window.themeManager = currentThemeManager; // Expose to window for settings panel
    } else {
      console.log('[loadEditorPreferences] Reusing existing ThemeManager');
      currentThemeManager.setEditor(editor);
      window.themeManager = currentThemeManager; // Update window reference
    }

    // Apply theme (default to 'default' if not set)
    const themeToUse = prefs.theme || 'default';
    console.log('[loadEditorPreferences] Applying theme:', themeToUse);
    currentThemeManager.applyTheme(themeToUse);

    // Apply font color if provided and refresh editors to pick up CSS vars
    if (prefs.font_color) {
      try {
        currentThemeManager.setFontColor(prefs.font_color);
        // Allow CSS variables to propagate before reconfiguring themes
        setTimeout(() => {
          refreshAllEditors();
        }, 100);
      } catch (e) {
        console.error('Failed to apply saved font color:', e);
      }
    }
    
    // Apply font size (default to 16 if not set)
    const fontSize = prefs.font_size || 16;
    editor.view.dispatch({
      effects: editor.fontSizeCompartment.reconfigure(
        editor.createFontSizeTheme(fontSize)
      )
    });
    
    // Apply line wrapping (default to true if not set)
    const lineWrapping = prefs.line_wrapping !== false;
    if (!lineWrapping) {
      editor.view.dispatch({
        effects: editor.lineWrappingCompartment.reconfigure([])
      });
    }
    
    console.log('✅ Editor preferences loaded');
  } catch (error) {
    console.log('⚠️ No editor preferences found, using defaults');
    // Create default theme manager
    if (!currentThemeManager) {
      currentThemeManager = new ThemeManager(editor);
      window.themeManager = currentThemeManager; // Expose to window for settings panel
      currentThemeManager.applyTheme('default');
    }
  }
}

// Helper to refresh all open editors' themes (used after CSS variable changes)
function refreshAllEditors() {
  if (!window.paneManager || !window.paneManager.panes) return;
  for (const pane of window.paneManager.panes.values()) {
    const tabManager = pane.tabManager;
    if (!tabManager || !tabManager.tabs) continue;
    for (const tab of tabManager.tabs.values()) {
      if (tab.editor && tab.type === 'markdown' && typeof tab.editor.refreshTheme === 'function') {
        try {
          tab.editor.refreshTheme();
        } catch (e) {
          console.warn('Theme refresh failed for an editor:', e);
        }
      }
    }
  }
}

// Simple initialization - no complex waiting needed with Tauri v2
async function initTauri() {
  console.log('🚀 Tauri v2: Ready to use!');
  console.log('✅ invoke function type:', typeof invoke);
  console.log('✅ dialog open function type:', typeof open);
}

// Vault name prompt modal
async function promptForVaultName() {
  return new Promise((resolve) => {
    const modalHTML = `
      <div id="vault-name-modal" class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Create New Vault</h3>
          </div>
          <div class="modal-body">
            <p class="modal-description">A new folder will be created with this name:</p>
            <label for="vault-name-input">Vault Name:</label>
            <input type="text" id="vault-name-input" placeholder="My Vault" value="My Vault" autofocus spellcheck="false">
          </div>
          <div class="modal-footer">
            <button id="vault-cancel-btn" class="secondary-button">Cancel</button>
            <button id="vault-create-btn" class="primary-button">Create</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('vault-name-modal');
    const input = document.getElementById('vault-name-input');
    const cancelBtn = document.getElementById('vault-cancel-btn');
    const createBtn = document.getElementById('vault-create-btn');
    
    setTimeout(() => {
      input.focus();
      input.select();
    }, 100);
    
    createBtn.onclick = () => {
      const name = input.value.trim();
      modal.remove();
      resolve(name);
    };
    
    cancelBtn.onclick = () => {
      modal.remove();
      resolve(null);
    };
    
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        createBtn.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelBtn.click();
      }
    };
    
    modal.onclick = (e) => {
      if (e.target === modal) {
        cancelBtn.click();
      }
    };
  });
}

// Create new file modal
window.showCreateFileModal = async function(folderPath = '', event = null) {
  if (event) event.stopPropagation();
  
  console.log('📄 Opening create file modal for folder:', folderPath);
  
  try {
    const fileName = await promptForFileName(folderPath);
    console.log('📝 File name from prompt:', fileName);
    
    if (!fileName || fileName.trim() === '') {
      console.log('❌ No file name provided');
      return;
    }
    
    const fullPath = folderPath ? `${folderPath}/${fileName.trim()}` : fileName.trim();
    console.log('📝 Creating new file:', fullPath);
    console.log('📝 Invoking create_new_file with:', { fileName: fullPath });
    
    await invoke('create_new_file', { fileName: fullPath });
    console.log('✅ File created successfully');
    
    if (folderPath) {
      window.expandedFolders.add(folderPath);
    }
    
    refreshFileTree();
    
    setTimeout(() => {
      window.handleFileClick(fullPath, false);
    }, 100);
    
  } catch (error) {
    console.error('❌ Failed to create file:', error);
    console.error('❌ Error details:', JSON.stringify(error));
    showError('Failed to create file: ' + (error.message || error));
  }
};

// Create new folder modal
window.showCreateFolderModal = async function() {
  console.log('📁 Opening create folder modal...');
  
  const folderName = await promptForFolderName();
  if (!folderName || folderName.trim() === '') {
    console.log('❌ No folder name provided');
    return;
  }
  
  try {
    console.log('📂 Creating new folder:', folderName);
    await invoke('create_new_folder', { folderName: folderName.trim() });
    console.log('✅ Folder created successfully');
    
    const fileTree = await invoke('get_file_tree');
    displayFileTree(fileTree);
    
  } catch (error) {
    console.error('❌ Failed to create folder:', error);
    showError('Failed to create folder: ' + error);
  }
};

// File name prompt modal
async function promptForFileName(folderPath = '') {
  return new Promise((resolve) => {
    console.log('📝 promptForFileName called with folderPath:', folderPath);
    
    // Remove any existing modal first
    const existingModal = document.getElementById('file-name-modal');
    if (existingModal) {
      console.log('🗑️ Removing existing modal');
      existingModal.remove();
    }
    
    const locationText = folderPath ? `in folder "${folderPath}"` : 'in vault root';
    const modalHTML = `
      <div id="file-name-modal" class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Create New File</h3>
          </div>
          <div class="modal-body">
            <p class="modal-description">Creating new markdown file ${locationText}:</p>
            <label for="file-name-input">File Name:</label>
            <input type="text" id="file-name-input" placeholder="My Note.md" value="Untitled.md" autofocus spellcheck="false">
          </div>
          <div class="modal-footer">
            <button id="file-cancel-btn" class="secondary-button">Cancel</button>
            <button id="file-create-btn" class="primary-button">Create File</button>
          </div>
        </div>
      </div>
    `;
    
    console.log('📝 Inserting modal HTML');
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('file-name-modal');
    const input = document.getElementById('file-name-input');
    const cancelBtn = document.getElementById('file-cancel-btn');
    const createBtn = document.getElementById('file-create-btn');
    
    console.log('📝 Modal elements:', {
      modal: !!modal,
      input: !!input,
      cancelBtn: !!cancelBtn,
      createBtn: !!createBtn
    });
    
    if (!modal || !input || !cancelBtn || !createBtn) {
      console.error('❌ Failed to create modal elements');
      resolve(null);
      return;
    }
    
    // Check if modal is visible
    const modalStyles = window.getComputedStyle(modal);
    console.log('📝 Modal visibility:', {
      display: modalStyles.display,
      visibility: modalStyles.visibility,
      opacity: modalStyles.opacity,
      zIndex: modalStyles.zIndex,
      position: modalStyles.position
    });
    
    // Get modal bounding rect to check if it's in viewport
    const rect = modal.getBoundingClientRect();
    console.log('📝 Modal position:', {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      inViewport: rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth
    });
    
    // Force modal to be visible and on top
    modal.style.display = 'flex';
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
    modal.style.zIndex = '10000001';
    
    setTimeout(() => {
      input.focus();
      input.select();
    }, 100);
    
    createBtn.onclick = () => {
      let name = input.value.trim();
      if (name && !name.toLowerCase().endsWith('.md')) {
        name += '.md';
      }
      modal.remove();
      resolve(name);
    };
    
    cancelBtn.onclick = () => {
      modal.remove();
      resolve(null);
    };
    
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        createBtn.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelBtn.click();
      }
    };
    
    modal.onclick = (e) => {
      if (e.target === modal) {
        cancelBtn.click();
      }
    };
  });
}

// Folder name prompt modal
async function promptForFolderName() {
  return new Promise((resolve) => {
    const modalHTML = `
      <div id="folder-name-modal" class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Create New Folder</h3>
          </div>
          <div class="modal-body">
            <p class="modal-description">Enter the name for your new folder:</p>
            <label for="folder-name-input">Folder Name:</label>
            <input type="text" id="folder-name-input" placeholder="My Folder" value="New Folder" autofocus spellcheck="false">
          </div>
          <div class="modal-footer">
            <button id="folder-cancel-btn" class="secondary-button">Cancel</button>
            <button id="folder-create-btn" class="primary-button">Create Folder</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('folder-name-modal');
    const input = document.getElementById('folder-name-input');
    const cancelBtn = document.getElementById('folder-cancel-btn');
    const createBtn = document.getElementById('folder-create-btn');

    // Ensure modal is visible above any plugin modal styles
    // Some global CSS sets `.modal-overlay { opacity: 0 }` by default
    // Mirror the file modal behavior to force visibility
    if (modal) {
      modal.classList.add('modal-show');
      modal.style.display = 'flex';
      modal.style.visibility = 'visible';
      modal.style.opacity = '1';
      modal.style.zIndex = '10000001';
    }
    
    setTimeout(() => {
      input.focus();
      input.select();
    }, 100);
    
    createBtn.onclick = () => {
      const name = input.value.trim();
      modal.remove();
      resolve(name);
    };
    
    cancelBtn.onclick = () => {
      modal.remove();
      resolve(null);
    };
    
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        createBtn.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelBtn.click();
      }
    };
    
    modal.onclick = (e) => {
      if (e.target === modal) {
        cancelBtn.click();
      }
    };
  });
}

// Global functions for vault menu
window.toggleVaultMenu = function() {
  console.log('🔽 Toggling vault menu...');
  const dropdown = document.getElementById('vault-dropdown');
  const sortDropdown = document.getElementById('sort-dropdown');
  
  if (dropdown) {
    dropdown.classList.toggle('hidden');
    console.log('📋 Menu visibility:', !dropdown.classList.contains('hidden'));
    
    // Close sort dropdown if open
    if (sortDropdown && !sortDropdown.classList.contains('hidden')) {
      sortDropdown.classList.add('hidden');
    }
  }
};

// Global sort state
let currentSortOption = localStorage.getItem('gaimplan-sort-option') || 'alphabetical';

// Sort menu functions
window.toggleSortMenu = function() {
  console.log('🔽 Toggling sort menu...');
  const dropdown = document.getElementById('sort-dropdown');
  const vaultDropdown = document.getElementById('vault-dropdown');
  
  if (dropdown) {
    dropdown.classList.toggle('hidden');
    console.log('📋 Sort menu visibility:', !dropdown.classList.contains('hidden'));
    
    // Close vault dropdown if open
    if (vaultDropdown && !vaultDropdown.classList.contains('hidden')) {
      vaultDropdown.classList.add('hidden');
    }
  }
};

window.setSortOption = function(option) {
  console.log('📊 Setting sort option:', option);
  currentSortOption = option;
  
  // Hide the dropdown
  const dropdown = document.getElementById('sort-dropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
  }
  
  // Save preference
  localStorage.setItem('gaimplan-sort-option', option);
  
  // Refresh the file tree with new sort
  refreshFileTree();
};

// Helper function to rebuild editor header with all controls
function updateEditorHeader(fileName = 'Welcome to Vault') {
  const fileNameEl = document.querySelector('.file-name');
  if (fileNameEl) {
    fileNameEl.textContent = fileName;
  }
}

function rebuildEditorHeader(fileName = 'Welcome to Vault') {
  const editorHeader = document.getElementById('editor-header');
  if (editorHeader) {
    // Ensure drag region attribute is set
    editorHeader.setAttribute('data-tauri-drag-region', '');
    editorHeader.innerHTML = `
      <div class="editor-left-controls">
        <button id="sidebar-toggle" class="editor-control-btn" onclick="toggleSidebar()" title="Toggle Sidebar">
          ${icons.panelLeft()}
        </button>
        <button id="split-view-btn" class="editor-control-btn${paneManager?.isSplit ? ' active' : ''}" onclick="toggleSplitView()" title="Split View (Cmd+\\)">
          ${icons.columns2()}
        </button>
        <button id="zen-mode-btn" class="editor-control-btn" onclick="toggleZenMode()" title="Zen Mode (Cmd+Option+Z)">
          ${icons.yinYang()}
        </button>
        <button id="nav-back-btn" class="editor-control-btn" onclick="navigateBack()" title="Go back (Cmd+[)" disabled>
          ${icons.chevronLeft()}
        </button>
        <button id="nav-forward-btn" class="editor-control-btn" onclick="navigateForward()" title="Go forward (Cmd+])" disabled>
          ${icons.chevronRight()}
        </button>
      </div>
      <span class="file-name">${fileName}</span>
      <div class="editor-controls">
        <button class="widget-toggle-btn editor-control-btn${window.widgetSidebar?.visible ? ' active' : ''}" onclick="toggleWidgetSidebar()" title="Toggle Widgets">
          ${icons.layoutGrid()}
        </button>
        <button class="chat-toggle-btn editor-control-btn${window.chatPanel?.isVisible ? ' active' : ''}" onclick="toggleChatPanel()" title="AI Chat (Cmd+Shift+C)">
          ${icons.messageSquare()}
        </button>
        <div class="editor-menu-container">
          <button id="editor-menu-btn" class="editor-control-btn" onclick="toggleEditorMenu()" title="Editor Menu">
            ${icons.menu()}
          </button>
          <div id="editor-dropdown" class="editor-dropdown hidden">
            <div class="editor-dropdown-item" onclick="showEditorSettings()">
              <span>Editor Settings</span>
            </div>
            <div class="editor-dropdown-divider"></div>
            <div class="editor-dropdown-item" onclick="generateHighlightsSummary()">
              <span>Generate Highlights Summary</span>
            </div>
            <div class="editor-dropdown-divider"></div>
            <div class="editor-dropdown-item" onclick="exportToPDF()">
              <span>Export as PDF</span>
            </div>
            <div class="editor-dropdown-item" onclick="exportToHTML()">
              <span>Export as HTML</span>
            </div>
            <div class="editor-dropdown-item" onclick="exportToWord()">
              <span>Export as Word (.doc)</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

window.closeCurrentVault = async function() {
  console.log('❌ Closing current vault...');
  
  // Clear the last vault preference
  try {
    await invoke('save_last_vault', { vaultPath: '' });
    console.log('✅ Cleared last vault preference');
  } catch (error) {
    console.error('⚠️ Failed to clear last vault:', error);
  }
  
  const dropdown = document.getElementById('vault-dropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
  }
  
  const vaultNameEl = document.querySelector('.vault-name');
  if (vaultNameEl) {
    vaultNameEl.textContent = 'No Vault';
  }
  
  // Hide vault actions (sidebar ribbon)
  const vaultActions = document.getElementById('vault-actions');
  if (vaultActions) {
    vaultActions.style.display = 'none';
  }
  
  const fileTreeElement = document.getElementById('file-tree');
  if (fileTreeElement) {
    fileTreeElement.innerHTML = `
      <div class="empty-state">
        <p>No vault open</p>
        <button id="open-vault" class="primary-button" onclick="window.openVault()">Open Vault</button>
        <button id="create-vault" class="secondary-button" onclick="window.createVault()">Create Vault</button>
      </div>
    `;
  }
  
  // Close all tabs
  if (tabManager) {
    const tabs = tabManager.getTabs();
    tabs.forEach(tab => {
      tabManager.closeTab(tab.id, true); // Force close
    });
  }
  
  // Reset current references
  currentEditor = null;
  currentFile = null;
  
  // Clear widget sidebar editor
  if (window.widgetSidebar) {
    window.widgetSidebar.updateActiveEditor(null);
  }
  
  // Show welcome screen
  showWelcomeScreen();
};

// Show welcome screen as a landing page
function showWelcomeScreen() {
  // Hide editor header/title bar on welcome screen
  const editorHeader = document.getElementById('editor-header');
  if (editorHeader) {
    editorHeader.style.display = 'none';
  }
  
  // Tab bars are now handled by PaneManager
  
  // Hide status bar on welcome screen
  const statusBar = document.getElementById('editor-status-bar');
  if (statusBar) {
    statusBar.style.display = 'none';
  }
  
  // Hide editor wrapper and show welcome landing page
  const editorWrapper = document.getElementById('editor-wrapper');
  if (editorWrapper) {
    editorWrapper.style.display = 'none';
  }
  
  // Add welcome container after editor wrapper
  const existingWelcome = document.querySelector('.welcome-container');
  if (existingWelcome) {
    existingWelcome.style.display = 'flex';
  } else {
    const editorContainer = document.querySelector('.editor-container');
    if (editorContainer) {
      const welcomeDiv = document.createElement('div');
      welcomeDiv.className = 'welcome-container';
      welcomeDiv.innerHTML = `
      <div class="welcome-landing-page">
        <div class="welcome-header">
          <h1>Welcome to Vault</h1>
          <img src="/vault-logo-transparent.png" alt="Vault Logo" class="welcome-logo" />
          <h2 class="welcome-tagline">A local-first notes app that brings together everything you've saved, highlighted, or written — private, fast, AI-ready.</h2>
        </div>
        
        <div class="features-section">
          <div class="feature-cards">
            <div class="feature-card">
              <div class="feature-icon">${icons.lock({ size: 32 })}</div>
              <h3>Private</h3>
              <h4>SECURE BY DESIGN</h4>
              <p>Plain Markdown with total control. Your thoughts never leave your machine unless you say so. Zero telemetry. Zero lock-in.</p>
            </div>

            <div class="feature-card">
              <div class="feature-icon">${icons.zap({ size: 32 })}</div>
              <h3>Blazing Fast</h3>
              <h4>NATIVE PERFORMANCE</h4>
              <p>Native desktop performance that keeps pace with how you think. Built for professionals who refuse to wait.</p>
            </div>

            <div class="feature-card">
              <div class="feature-icon">${icons.settings({ size: 32 })}</div>
              <h3>AI-Ready</h3>
              <h4>PROGRESSIVE CONTEXT</h4>
              <p>Every note and highlight compounds into deeper AI context. You control what to share, nothing is sent automatically.</p>
            </div>
          </div>
        </div>
      </div>
    `;
      editorContainer.appendChild(welcomeDiv);
    }
  }
  
  console.log('✅ Welcome landing page displayed');
  currentFile = null;
}

// Global functions for vault management
window.openVault = async function() {
  console.log('🎯 Opening vault...');
  
  const dropdown = document.getElementById('vault-dropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
  }
  
  const btn = document.getElementById('open-vault');
  
  try {
    if (btn) {
      btn.textContent = 'Selecting...';
      btn.disabled = true;
    }
    
    console.log('📁 Opening folder selection dialog...');
    const folderPath = await open({
      directory: true,
      multiple: false
    });
    
    if (!folderPath) {
      console.log('❌ No folder selected');
      return;
    }
    
    console.log('📂 Selected folder:', folderPath);
    
    if (btn) btn.textContent = 'Opening...';
    
    // Use WindowContext to open vault
    await windowContext.openVault(folderPath);
    
    console.log('✅ Vault opened via WindowContext');
    
  } catch (error) {
    console.error('❌ Error opening vault:', error);
    showError('Failed to open vault: ' + error);
  } finally {
    if (btn) {
      btn.textContent = 'Open Vault';
      btn.disabled = false;
    }
  }
};

window.createVault = async function() {
  console.log('🎯 Creating new vault...');
  
  const dropdown = document.getElementById('vault-dropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
  }
  
  const btn = document.getElementById('create-vault');
  
  try {
    if (btn) {
      btn.textContent = 'Selecting...';
      btn.disabled = true;
    }
    
    console.log('📁 Opening directory selection dialog...');
    const parentPath = await open({
      directory: true,
      multiple: false,
      title: 'Select directory where vault will be created'
    });
    
    if (!parentPath) {
      console.log('❌ No parent folder selected');
      return;
    }
    
    console.log('📂 Selected parent folder:', parentPath);
    
    console.log('📝 Prompting for vault name...');
    const vaultName = await promptForVaultName();
    if (!vaultName || vaultName.trim() === '') {
      console.log('❌ No vault name provided');
      return;
    }
    
    console.log('📝 Vault name:', vaultName);
    
    if (btn) btn.textContent = 'Creating...';
    const vaultInfo = await invoke('create_new_vault', { 
      parentPath: parentPath, 
      vaultName: vaultName.trim() 
    });
    
    console.log('✅ Vault created:', vaultInfo);
    
    // Use WindowContext to open the newly created vault
    await windowContext.openVault(vaultInfo.path);
    
  } catch (error) {
    console.error('❌ Error creating vault:', error);
    showError('Failed to create vault: ' + error);
  } finally {
    if (btn) {
      btn.textContent = 'Create Vault';
      btn.disabled = false;
    }
  }
};

// Helper functions
async function updateUIWithVault(vaultInfo) {
  console.log('🔄 Updating UI with vault:', vaultInfo);
  
  // Store vault path globally for MCP servers
  window.currentVaultPath = vaultInfo.path;
  
  // MCP servers are now managed by MCPSettingsPanel (bundledServers.js)
  // Trigger reload of MCP settings when vault opens
  if (window.mcpSettings) {
    console.log('🔄 Reloading MCP settings for vault:', vaultInfo.path);
    window.mcpSettings.loadServers().catch(err => {
      console.error('Failed to reload MCP servers:', err);
    });
  }
  
  // Save this as the last opened vault
  try {
    await invoke('save_last_vault', { vaultPath: vaultInfo.path });
    console.log('✅ Saved last vault path');
  } catch (error) {
    console.error('⚠️ Failed to save last vault:', error);
  }
  
  // Load vault-specific settings
  try {
    const vaultSettings = await invoke('get_vault_settings', { vaultPath: vaultInfo.path });
    console.log('✅ Loaded vault settings:', vaultSettings);
    
    // Apply editor settings
    if (vaultSettings && vaultSettings.editor) {
      // Store pending settings for new editors
      window.pendingEditorSettings = {
        fontSize: vaultSettings.editor.font_size,
        fontFamily: vaultSettings.editor.font_family,
        theme: vaultSettings.editor.theme,
        lineNumbers: vaultSettings.editor.line_numbers,
        lineWrapping: vaultSettings.editor.line_wrapping,
        showStatusBar: vaultSettings.editor.show_status_bar,
        wysiwygMode: vaultSettings.editor.wysiwyg_mode
      };
      
      // Apply to any existing editors
      applySettingsToAllEditors({
        fontSize: vaultSettings.editor.font_size,
        fontFamily: vaultSettings.editor.font_family,
        fontColor: vaultSettings.editor.font_color,
        theme: vaultSettings.editor.theme,
        lineNumbers: vaultSettings.editor.line_numbers,
        lineWrapping: vaultSettings.editor.line_wrapping,
        showStatusBar: vaultSettings.editor.show_status_bar,
        wysiwygMode: vaultSettings.editor.wysiwyg_mode
      });
      
      // Store image location globally
      if (vaultSettings.files && vaultSettings.files.image_location) {
        window.imageSaveLocation = vaultSettings.files.image_location;
      }
    }
  } catch (error) {
    console.error('⚠️ Failed to load vault settings:', error);
    // Continue with defaults
  }
  
  // Restore editor header if it was hidden during welcome screen
  const editorHeader = document.getElementById('editor-header');
  if (editorHeader) {
    editorHeader.style.display = 'flex';
    // Rebuild header to ensure navigation buttons exist
    rebuildEditorHeader('Welcome to Vault');
  }
  
  // Update navigation buttons
  updateNavigationButtons();
  
  
  const vaultNameEl = document.querySelector('.vault-name');
  if (vaultNameEl) {
    vaultNameEl.textContent = vaultInfo.name;
  }
  
  // Show vault actions (sidebar ribbon)
  const vaultActions = document.getElementById('vault-actions');
  if (vaultActions) {
    vaultActions.style.display = 'flex';
  }
  
  try {
    console.log('📁 Loading file tree...');
    const fileTree = await invoke('get_file_tree');
    console.log('📊 File tree loaded:', fileTree);
    
    displayFileTree(fileTree);
    
    // Start file system watcher for this vault
    console.log('👁️ Starting file system watcher...');
    await invoke('start_file_watcher', { vaultPath: vaultInfo.path });
    console.log('✅ File system watcher started');
  } catch (error) {
    console.error('❌ Failed to load file tree:', error);
    showFileTreeError(error);
  }
  
  // Show vault success message in editor
  if (currentEditor) {
    const successContent = `# 🎉 Vault Ready!

## ${vaultInfo.name}

Your vault is now open and ready to use.

**Location:** \`${vaultInfo.path}\`

*Click on any file in the sidebar to start editing!*

### Quick Tips

- Use **Ctrl/Cmd + S** to save files
- Create [[wiki links]] by typing \`[[Note Name]]\`
- Add #tags anywhere in your notes
- Use **Ctrl/Cmd + B** for bold, **Ctrl/Cmd + I** for italic
`;
    
    currentEditor.setContent(successContent, false, null, false);
    currentFile = null;
  }
}

function displayFileTree(fileTree) {
  console.log('🌲 Displaying file tree with', fileTree.files.length, 'items');
  console.log('📂 Currently expanded folders:', Array.from(window.expandedFolders));
  
  // Debug: Log first few items to see structure
  console.log('📊 Sample file tree items:', fileTree.files.slice(0, 5));
  
  // Debug: Show root level items
  const rootItems = fileTree.files.filter(f => !f.parent_path);
  console.log('🌳 Root level items:', rootItems.map(f => f.name));
  
  const fileTreeElement = document.getElementById('file-tree');
  if (!fileTreeElement) {
    console.error('❌ File tree element not found');
    return;
  }
  
  if (fileTree.files.length === 0) {
    fileTreeElement.innerHTML = `
      <div class="empty-vault">
        <p>📁 Vault is empty</p>
        <p><em>Create your first note to get started!</em></p>
      </div>
    `;
    return;
  }
  
  // Create a tree structure for proper sorting
  const buildTree = (files) => {
    const tree = new Map();
    
    // First pass: organize by parent
    files.forEach(file => {
      const parent = file.parent_path || '';
      if (!tree.has(parent)) {
        tree.set(parent, []);
      }
      tree.get(parent).push(file);
    });
    
    // Sort each level
    tree.forEach((children, parent) => {
      children.sort((a, b) => {
        // Always put directories before files
        if (a.is_dir !== b.is_dir) {
          return a.is_dir ? -1 : 1;
        }
        
        // Apply the selected sort option
        switch (currentSortOption) {
          case 'alphabetical':
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            
          case 'created':
            if (a.created !== null && b.created !== null) {
              return b.created - a.created;
            }
            if (a.created !== null) return -1;
            if (b.created !== null) return 1;
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            
          case 'modified':
            if (a.modified !== null && b.modified !== null) {
              return b.modified - a.modified;
            }
            if (a.modified !== null) return -1;
            if (b.modified !== null) return 1;
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            
          default:
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        }
      });
    });
    
    // Flatten the tree in depth-first order
    const result = [];
    const addToResult = (parentPath) => {
      const children = tree.get(parentPath) || [];
      children.forEach(child => {
        result.push(child);
        if (child.is_dir) {
          addToResult(child.path);
        }
      });
    };
    
    // Start from root
    addToResult('');
    
    return result;
  };
  
  const sortedFiles = buildTree(fileTree.files);
  
  let html = `
    <div class="file-tree-content" data-path="">
  `;

  sortedFiles.forEach(file => {
    // Skip .obsidian folders and their contents
    if (file.name === '.obsidian' || file.path.includes('/.obsidian/')) {
      return;
    }
    
    // Debug Chat History folder and parent paths
    // if (file.name === 'Chat History' || file.path.includes('Chat History')) {
    //   console.log('🔍 Found Chat History:', file);
    //   console.log('   Parent path:', file.parent_path);
    //   console.log('   Is parent expanded?', file.parent_path ? window.expandedFolders.has(file.parent_path) : 'N/A (root)');
    // }
    
    // For files (not folders), check if their parent folder is expanded
    // For folders, always show if their parent is expanded (or if they're root level)
    if (file.parent_path) {
      // This item has a parent
      if (!window.expandedFolders.has(file.parent_path)) {
        // Parent is not expanded, skip this item
        // console.log(`⏭️ Skipping ${file.path} because parent ${file.parent_path} is not expanded`);
        return;
      }
    }
    
    const indent = file.depth * 20;
    const isExpanded = window.expandedFolders.has(file.path);
    
    if (file.is_dir) {
      const expandIcon = isExpanded ? '▼' : '▶';
      const escapedPath = file.path.replace(/'/g, "\\'").replace(/"/g, "&quot;");
      const folderIcon = isExpanded ? icons.folderOpen({ size: 16 }) : icons.folder({ size: 16 });

      html += `
        <div class="tree-item folder" data-path="${file.path}" style="padding-left: ${indent + 8}px;" title="${file.name}"
             ondragenter="handleFolderDragEnter(event)" ondragover="handleFolderDragOver(event)" ondragleave="handleFolderDragLeave(event)" ondrop="handleFolderDrop(event)">
          <span class="expand-icon" onclick="toggleFolder('${escapedPath}', event)">${expandIcon}</span>
          <span class="tree-icon folder-icon">${folderIcon}</span>
          <span class="tree-label" onclick="handleFolderClick('${escapedPath}', event)">${file.name}</span>
          <span class="folder-actions">
            <button class="folder-action-btn" onclick="showCreateFileModal('${escapedPath}', event)" title="New File in Folder">${icons.filePlus({ size: 14 })}</button>
          </span>
        </div>
      `;
    } else {
      const escapedPath = file.path.replace(/'/g, "\\'").replace(/"/g, "&quot;");
      const fileIndent = indent + 24;

      // Get file extension and determine icon
      const ext = file.name.split('.').pop()?.toLowerCase();
      let fileIcon = '';

      if (ext === 'pdf') {
        fileIcon = '<span class="file-type-badge pdf">PDF</span>';
      } else if (ext === 'csv') {
        fileIcon = '<span class="file-type-badge csv">CSV</span>';
      } else if (ext === 'json') {
        fileIcon = '<span class="file-type-badge json">JSON</span>';
      } else if (ext === 'md' || ext === 'markdown') {
        fileIcon = `<span class="tree-icon file-icon">${icons.fileText({ size: 16 })}</span>`;
      } else if (ext === 'txt') {
        fileIcon = `<span class="tree-icon file-icon">${icons.file({ size: 16 })}</span>`;
      } else {
        fileIcon = `<span class="tree-icon file-icon">${icons.file({ size: 16 })}</span>`;
      }

      // Remove file extension for display
      const displayName = file.name.replace(/\.(md|markdown|txt|doc|docx|pdf|csv|json)$/i, '');

      html += `
        <div class="tree-item file" data-path="${file.path}" style="padding-left: ${fileIndent}px;" data-file-path="${escapedPath}" draggable="true" ondragstart="handleFileDragStart(event)" ondrag="handleFileDrag(event)" ondragend="handleFileDragEnd(event)" title="${file.name}">
          ${fileIcon}
          <span class="tree-label" onclick="handleFileClick('${escapedPath}', false)">${displayName}</span>
        </div>
      `;
    }
  });
  
  html += '</div>';
  fileTreeElement.innerHTML = html;
}

function showFileTreeError(error) {
  const fileTreeElement = document.getElementById('file-tree');
  if (fileTreeElement) {
    fileTreeElement.innerHTML = `
      <div class="error-state">
        <p>❌ Failed to load files</p>
        <p><em>${error}</em></p>
      </div>
    `;
  }
}

// Toggle folder expansion
window.toggleFolder = function(folderPath, event) {
  event.stopPropagation();
  console.log('🔽 Toggling folder:', folderPath);
  
  if (window.expandedFolders.has(folderPath)) {
    window.expandedFolders.delete(folderPath);
  } else {
    window.expandedFolders.add(folderPath);
  }
  
  refreshFileTree();
};

// Handle folder clicks
window.handleFolderClick = function(folderPath, event) {
  event.stopPropagation();
  console.log('📁 Folder clicked:', folderPath);
  window.toggleFolder(folderPath, event);
};

// Drag & Drop: Move file into folder
window.handleFileDragStart = function(event) {
  const item = event.currentTarget.closest('.tree-item.file');
  const path = item?.getAttribute('data-path');
  if (path) {
    // Set multiple data types to keep drag in "internal" mode
    event.dataTransfer.setData('text/plain', path);
    event.dataTransfer.setData('text/uri-list', `file://${path}`);
    event.dataTransfer.setData('application/x-vault-file', path);
    // Fallback for environments that strip dataTransfer (WebKit quirks)
    window.__dragSourcePath = path;
  }
  window.__dndDropProcessed = false;
  try { 
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.dropEffect = 'move';
  } catch (_) {}
  dndLog('dragstart', { path, types: Array.from(event.dataTransfer?.types || []), effectAllowed: event.dataTransfer?.effectAllowed });
  if (item) item.classList.add('dragging');
};

window.handleFileDrag = function(event) {
  // Track last mouse position during drag for end-of-drag fallback
  // Note: Some browsers report 0,0 during drag events
  if (typeof event.clientX === 'number' && typeof event.clientY === 'number' && 
      (event.clientX !== 0 || event.clientY !== 0)) {
    window.__dragLastPt = { x: event.clientX, y: event.clientY };
    dndLog('drag', window.__dragLastPt);
  }
};


window.handleFileDragEnd = function(event) {
  const item = event.currentTarget.closest('.tree-item.file');
  if (item) item.classList.remove('dragging');
  document.querySelectorAll('.tree-item.folder.drag-over').forEach(el => el.classList.remove('drag-over'));
  
  // Enhanced dragend fallback for WKWebView
  if (window.__dragSourcePath && !window.__dndDropProcessed) {
    // Try multiple sources for coordinates
    let pt = null;
    
    // 1. Try last tracked position during drag
    if (window.__dragLastPt && window.__dragLastPt.x && window.__dragLastPt.y) {
      pt = window.__dragLastPt;
      dndLog('dragend using last tracked pt', pt);
    }
    // 2. Try event coordinates if valid
    else if (typeof event.clientX === 'number' && typeof event.clientY === 'number' && 
             (event.clientX !== 0 || event.clientY !== 0)) {
      pt = { x: event.clientX, y: event.clientY };
      dndLog('dragend using event coordinates', pt);
    }
    // 3. Try to get cursor position from mouse event (fallback)
    else if (event.pageX && event.pageY) {
      pt = { x: event.pageX, y: event.pageY };
      dndLog('dragend using page coordinates', pt);
    }
    
    if (pt && pt.x && pt.y) {
      const els = document.elementsFromPoint(pt.x, pt.y) || [];
      dndLog('dragend elements at point', els.length, els.slice(0, 3).map(e => e.className));
      
      // Look for folder in the element stack
      let folderEl = null;
      for (const el of els) {
        if (el.classList && el.classList.contains('folder')) {
          folderEl = el;
          break;
        }
        const parent = el.closest?.('.tree-item.folder');
        if (parent) {
          folderEl = parent;
          break;
        }
      }
      
      const destinationPath = folderEl?.getAttribute('data-path') || '';
      dndLog('dragend fallback result', { 
        pt, 
        destinationPath, 
        sourcePath: window.__dragSourcePath,
        folderFound: !!folderEl 
      });
      
      if (destinationPath && destinationPath !== window.__dragSourcePath) {
        performMoveToFolder(window.__dragSourcePath, destinationPath);
      } else if (!destinationPath) {
        dndLog('dragend - no valid drop target found');
      }
    } else {
      dndLog('dragend - no valid coordinates available for fallback');
    }
  }
  
  // Clean up global state
  window.__dragSourcePath = null;
  window.__dragLastPt = null;
  window.__dndDropProcessed = false;
  dndLog('dragend complete');
};

window.handleFolderDragEnter = function(event) {
  event.preventDefault();
  event.stopPropagation();
  const folderEl = event.currentTarget.closest('.tree-item.folder');
  if (folderEl) folderEl.classList.add('drag-over');
  const dest = folderEl?.getAttribute('data-path');
  dndLog('dragenter', { dest, types: event.dataTransfer?.types, effectAllowed: event.dataTransfer?.effectAllowed });
};

window.handleFolderDragOver = function(event) {
  event.preventDefault(); // Allow drop
  event.stopPropagation();
  try { event.dataTransfer.dropEffect = 'move'; } catch (_) {}
  const folderEl = event.currentTarget.closest('.tree-item.folder');
  if (folderEl) folderEl.classList.add('drag-over');
  const dest = folderEl?.getAttribute('data-path');
  dndLog('dragover', { dest, dropEffect: event.dataTransfer?.dropEffect });
};

window.handleFolderDragLeave = function(event) {
  event.stopPropagation();
  const folderEl = event.currentTarget.closest('.tree-item.folder');
  if (folderEl) folderEl.classList.remove('drag-over');
  const dest = folderEl?.getAttribute('data-path');
  dndLog('dragleave', { dest });
};

window.handleFolderDrop = async function(event) {
  event.preventDefault();
  event.stopPropagation();
  const folderEl = event.currentTarget.closest('.tree-item.folder');
  if (folderEl) folderEl.classList.remove('drag-over');
  const destinationPath = folderEl?.getAttribute('data-path') || '';
  const sourcePath = event.dataTransfer.getData('text/plain') || window.__dragSourcePath || '';
  dndLog('drop', { destinationPath, sourcePath, types: event.dataTransfer?.types, dropEffect: event.dataTransfer?.dropEffect });
  if (!sourcePath) return;

  await performMoveToFolder(sourcePath, destinationPath);
};

async function performMoveToFolder(sourcePath, destinationPath) {
  // Ignore drops where file would stay in same parent
  const srcParent = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : '';
  if (srcParent === destinationPath) { dndLog('noop: same parent'); return; }

  const fileName = sourcePath.split('/').pop();
  const newPath = destinationPath ? `${destinationPath}/${fileName}` : fileName;
  dndLog('move_file invoke', { oldPath: sourcePath, newPath });

  try {
    await invoke('move_file', { oldPath: sourcePath, newPath });
    dndLog('move_file success', { oldPath: sourcePath, newPath });
    const fileTree = await invoke('get_file_tree');
    displayFileTree(fileTree);
  } catch (error) {
    console.error('Error moving file via drag-and-drop:', error);
    dndLog('move_file error', { error });
    alert('Error moving file: ' + error);
  } finally {
    window.__dragSourcePath = null;
  }
}

// Refresh file tree
async function refreshFileTree() {
  try {
    const fileTree = await invoke('get_file_tree');
    displayFileTree(fileTree);
  } catch (error) {
    console.error('❌ Failed to refresh file tree:', error);
  }
}

// Expose refreshFileTree globally
window.refreshFileTree = refreshFileTree;

// Listen for vault files changed events from frontend
window.addEventListener('vault-files-changed', () => {
  console.log('📁 Vault files changed (frontend event), refreshing file tree...');
  refreshFileTree();
  
  // Also dispatch generic file change event for WikiLink cache
  const fileChangeEvent = new CustomEvent('file-updated', {
    detail: { path: 'vault-changed' }
  });
  document.dispatchEvent(fileChangeEvent);
});

// Listen for vault files changed events from Tauri backend
async function setupFileSystemWatcher() {
  try {
    const { listen } = await import('@tauri-apps/api/event');
    
    // Listen for file system changes from backend
    const unlisten = await listen('vault-files-changed', (event) => {
      console.log('📁 File system changed (backend event), refreshing file tree...');
      refreshFileTree();
      
      // Dispatch WikiLink cache invalidation events based on the change type
      if (event.payload && event.payload.path) {
        const eventType = event.payload.type || 'file-updated';
        const customEvent = new CustomEvent(eventType, {
          detail: { 
            path: event.payload.path,
            oldPath: event.payload.oldPath,
            newPath: event.payload.newPath
          }
        });
        document.dispatchEvent(customEvent);
      }
    });
    
    // Store unlisten function for cleanup if needed
    window.fileWatcherUnlisten = unlisten;
  } catch (error) {
    console.error('Failed to setup file system watcher:', error);
  }
}

// Call this when DOM is ready
setupFileSystemWatcher();

// Helper to check if CSV support is enabled (reads from localStorage)
function isCsvSupportEnabled() {
  try {
    const key = 'bundled_plugin_csv-support';
    const rawValue = localStorage.getItem(key);
    console.log('🔧 CSV plugin localStorage raw value:', rawValue);
    const settings = JSON.parse(rawValue || '{}');
    console.log('🔧 CSV plugin settings parsed:', settings);
    // If enabled is explicitly set, use that value; default to true
    if (settings.enabled !== undefined) {
      console.log('🔧 CSV plugin enabled explicitly set to:', settings.enabled);
      return settings.enabled;
    }
    console.log('🔧 CSV plugin enabled not set, defaulting to true');
    return true;
  } catch (e) {
    console.log('🔧 CSV plugin settings error:', e);
    return true; // Default to enabled
  }
}

// Handle file clicks with tabs
window.handleFileClick = async function(filePath, isDir) {
  console.log('🔍 File clicked:', filePath, 'isDir:', isDir);

  if (isDir) {
    console.log('📁 Directory clicked - not implemented yet');
    return;
  }

  // Check file type
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif'];
  const fileExtension = filePath.split('.').pop().toLowerCase();
  const isImage = imageExtensions.includes(fileExtension);
  const isPDF = fileExtension === 'pdf';
  const isCSV = fileExtension === 'csv';

  try {
    // Get the active pane's TabManager
    const tabManager = paneManager ? paneManager.getActiveTabManager() : null;
    if (!tabManager) {
      console.error('❌ No active TabManager found');
      return;
    }

    // Check if file is already open in any pane
    const existingPane = paneManager.findPaneByFilePath(filePath);
    if (existingPane) {
      const existingTab = existingPane.tabManager.findTabByPath(filePath);

      // For CSV files, check if the tab type matches the current plugin state
      // If plugin is enabled but tab is markdown (or vice versa), close and reopen
      if (isCSV && existingTab) {
        const csvEnabled = isCsvSupportEnabled();
        const tabIsCsv = existingTab.type === 'csv';

        if (csvEnabled !== tabIsCsv) {
          console.log('📑 CSV tab type mismatch - closing and reopening with correct type');
          console.log('   Plugin enabled:', csvEnabled, 'Tab is CSV:', tabIsCsv);
          // Close the existing tab and fall through to reopen
          await existingPane.tabManager.closeTab(existingTab.id, true);
        } else {
          console.log('📑 File already open in pane, switching to it');
          paneManager.activatePane(existingPane.id);
          existingPane.tabManager.activateTab(existingTab.id);
          return;
        }
      } else {
        console.log('📑 File already open in pane, switching to it');
        // Activate the pane and tab
        paneManager.activatePane(existingPane.id);
        if (existingTab) {
          existingPane.tabManager.activateTab(existingTab.id);
        }
        return;
      }
    }
    
    // Handle PDF files
    if (isPDF) {
      console.log('📄 Opening PDF file:', filePath);
      await tabManager.openFile(filePath);
      
      // Hide welcome screen if visible
      const welcomeContainer = document.querySelector('.welcome-container');
      if (welcomeContainer) {
        welcomeContainer.style.display = 'none';
      }
      
      // Show editor header if hidden
      const editorHeader = document.getElementById('editor-header');
      if (editorHeader) {
        editorHeader.style.display = 'flex';
        // Rebuild header to ensure navigation buttons exist
        rebuildEditorHeader(filePath.split('/').pop());
      }
      
      // Update navigation buttons
      updateNavigationButtons();
      
      return;
    }
    
    console.log('📖 Reading file:', filePath);
    let content;
    
    if (isImage) {
      // For images, create a markdown content that displays the image
      console.log('🖼️ Loading image file:', filePath);
      const filename = filePath.split('/').pop();
      content = `# ${filename}\n\n![[${filename}]]`;
    } else {
      content = await invoke('read_file_content', { filePath: filePath });
      console.log('📄 File content loaded, length:', content.length);
    }
    
    // Get the active tab or create one if none exist
    let activeTab = tabManager.getActiveTab();

    // Check if this is a CSV file - use openFile which handles CSV detection
    if (isCSV) {
      console.log('📊 Opening CSV file via openFile():', filePath);
      const tabId = await tabManager.openFile(filePath, content);
      activeTab = tabManager.tabs.get(tabId);
      if (activeTab?.editor) {
        await loadEditorPreferences(activeTab.editor);
      }

      // Hide welcome screen if visible
      const welcomeContainer = document.querySelector('.welcome-container');
      if (welcomeContainer) {
        welcomeContainer.style.display = 'none';
      }

      // Show editor header
      const editorHeader = document.getElementById('editor-header');
      if (editorHeader) {
        editorHeader.style.display = 'flex';
        rebuildEditorHeader(filePath.split('/').pop());
      }

      updateNavigationButtons();
      return;
    }

    if (!activeTab || tabManager.tabs.size === 0) {
      // No tabs exist, create the first one
      const tabId = tabManager.createTab(filePath, content);
      activeTab = tabManager.tabs.get(tabId);
      await loadEditorPreferences(activeTab.editor);
      tabManager.activateTab(tabId);
    } else {
      // Replace content in active tab
      // Check if current tab has unsaved changes (but not for untitled tabs)
      if (activeTab.isDirty && activeTab.filePath) {
        const confirmed = confirm(`"${activeTab.title}" has unsaved changes. Continue without saving?`);
        if (!confirmed) {
          return;
        }
      }
      
      // Use the navigation system to track history
      await tabManager.navigateToFile(activeTab.id, filePath);
      activeTab.isDirty = false;
      
      // Check if we need to recreate the editor (for new tab screen)
      const hasNewTabScreen = activeTab.editorContainer.querySelector('.new-tab-screen');
      
      if (hasNewTabScreen || !activeTab.editor || !activeTab.editor.view) {
        // Destroy existing editor if it exists
        if (activeTab.editor && activeTab.editor.destroy) {
          console.log('🧹 Destroying existing editor before recreating');
          activeTab.editor.destroy();
        }
        
        // Clear new tab screen and recreate editor
        activeTab.editorContainer.innerHTML = '';
        activeTab.editor = new MarkdownEditor(activeTab.editorContainer);
        await loadEditorPreferences(activeTab.editor);
        setupEditorChangeTracking(activeTab.id, activeTab);
      }
      
      // Set content in the editor
      activeTab.editor.setContent(content);
      activeTab.editor.currentFile = filePath;
      
      // Update tab UI through the active pane's TabBar
      const activePane = paneManager.panes.get(paneManager.activePaneId);
      if (activePane && activePane.tabBar) {
        activePane.tabBar.updateTabTitle(activeTab.id, activeTab.title);
        activePane.tabBar.updateTabDirtyState(activeTab.id, false);
      }
      
      // Update global references
      currentFile = filePath;
      currentEditor = activeTab.editor;
      updateEditorHeader(activeTab.title);
      
      // Update widget sidebar with new editor
      if (window.widgetSidebar) {
        window.widgetSidebar.updateActiveEditor(currentEditor);
      }
      
      // Trigger tab change event to update UI properly
      tabManager.emit('tab-changed', { tabId: activeTab.id });
    }
    
    // Hide welcome screen if visible
    const welcomeContainer = document.querySelector('.welcome-container');
    if (welcomeContainer) {
      welcomeContainer.style.display = 'none';
    }
    
    // Show editor header if hidden
    const editorHeader = document.getElementById('editor-header');
    if (editorHeader) {
      editorHeader.style.display = 'flex';
      // Rebuild header to ensure navigation buttons exist
      rebuildEditorHeader(activeTab.title);
    }
    
    // Update navigation buttons
    updateNavigationButtons();
    
    // Apply global status bar visibility when opening a file
    const statusBar = document.getElementById('editor-status-bar');
    if (statusBar) {
      statusBar.style.display = statusBarVisible ? 'flex' : 'none';
    }
    
    // Update word count for the loaded content
    updateWordCount();
    
  } catch (error) {
    console.error('❌ Failed to read file:', error);
    showError('Failed to load file: ' + error);
  }
};

// Save current file
async function saveCurrentFile() {
  const tabManager = paneManager ? paneManager.getActiveTabManager() : null;
  if (!tabManager) return;
  
  const activeTab = tabManager.getActiveTab();
  if (!activeTab || !activeTab.filePath) {
    return;
  }
  
  // Don't save image or PDF files
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif'];
  const fileExtension = activeTab.filePath.split('.').pop().toLowerCase();
  if (imageExtensions.includes(fileExtension) || fileExtension === 'pdf') {
    console.log('🖼️ Skipping save for image/PDF file');
    return;
  }
  
  try {
    console.log('💾 Saving file:', activeTab.filePath);
    const content = activeTab.editor.getContent();
    const newTimestamp = await invoke('write_file_content', { filePath: activeTab.filePath, content: content });
    
    // If a new timestamp was returned, update just that line in the editor
    if (newTimestamp && activeTab.editor) {
      const currentContent = activeTab.editor.getContent();
      const lines = currentContent.split('\n');
      
      // Find and update the updated_at line in frontmatter
      let inFrontmatter = false;
      let frontmatterCount = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] === '---') {
          frontmatterCount++;
          if (frontmatterCount === 1) {
            inFrontmatter = true;
          } else if (frontmatterCount === 2) {
            break; // End of frontmatter
          }
        } else if (inFrontmatter && lines[i].startsWith('updated_at:')) {
          // Update just this line
          lines[i] = `updated_at: ${newTimestamp}`;
          
          // Update the editor content efficiently
          const newContent = lines.join('\n');
          const view = activeTab.editor.view;
          if (view) {
            // Get current cursor position
            const cursorPos = view.state.selection.main.head;
            
            // Create a transaction to update the content
            const transaction = view.state.update({
              changes: {
                from: 0,
                to: view.state.doc.length,
                insert: newContent
              }
            });
            
            // Dispatch the content change first
            view.dispatch(transaction);
            
            // Then set the cursor position if it's valid
            const newDocLength = view.state.doc.length;
            const validCursorPos = Math.min(cursorPos, newDocLength);
            
            if (validCursorPos >= 0) {
              view.dispatch({
                selection: { anchor: validCursorPos, head: validCursorPos }
              });
            }
            
            console.log('📝 Updated timestamp in editor to:', newTimestamp);
          }
          break;
        }
      }
    }
    
    activeTab.editor.hasUnsavedChanges = false;
    tabManager.setTabDirty(activeTab.id, false);
    
    // Update TabBar through the active pane
    const activePane = paneManager.panes.get(paneManager.activePaneId);
    if (activePane && activePane.tabBar) {
      activePane.tabBar.updateTabDirtyState(activeTab.id, false);
    }
    
    console.log('✅ File saved successfully');
  } catch (error) {
    console.error('❌ Failed to save file:', error);
    showError('Failed to save file: ' + error);
  }
}

function showError(message) {
  console.error('🚨 Showing error:', message);
  
  if (currentEditor) {
    const errorContent = `# ❌ Error

${message}

*Please check the console for more details.*`;
    currentEditor.setContent(errorContent, false, null, false);
  }
}

// Sidebar resize functionality
function setupSidebarResize() {
  const sidebar = document.querySelector('.sidebar');
  const resizeHandle = document.getElementById('sidebar-resize-handle');

  if (!sidebar || !resizeHandle) {
    console.warn('Sidebar resize: elements not found');
    return;
  }

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;
  const minWidth = 180;
  const maxWidth = 400;

  const handleResizeStart = (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.classList.add('resizing-sidebar');

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    e.preventDefault();
  };

  const handleResizeMove = (e) => {
    if (!isResizing) return;

    const deltaX = e.clientX - startX;
    const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));

    sidebar.style.width = `${newWidth}px`;
  };

  const handleResizeEnd = () => {
    isResizing = false;
    resizeHandle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.classList.remove('resizing-sidebar');

    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);

    // Persist the width for this vault
    const newWidth = sidebar.offsetWidth;
    if (window.currentVaultPath) {
      localStorage.setItem(`sidebar-width-${window.currentVaultPath}`, newWidth);
    }
  };

  resizeHandle.addEventListener('mousedown', handleResizeStart);

  // Restore saved width for current vault
  if (window.currentVaultPath) {
    const savedWidth = localStorage.getItem(`sidebar-width-${window.currentVaultPath}`);
    if (savedWidth) {
      const width = parseInt(savedWidth, 10);
      if (width >= minWidth && width <= maxWidth) {
        sidebar.style.width = `${width}px`;
      }
    }
  }
}

// Initialize everything
async function initializeApp() {
  if (appInitialized) {
    console.log('⚠️ App already initialized, skipping...');
    return;
  }
  
  console.log('🎯 Starting app initialization...');
  appInitialized = true;
  
  await initTauri();
  
  const appElement = document.querySelector('#app');
  
  if (appElement) {
    console.log('📝 Setting innerHTML...');
    appElement.innerHTML = `
      <div class="app-container">
        <div class="sidebar">
          <div class="sidebar-ribbon" id="vault-actions" data-tauri-drag-region style="display: none;">
            <button class="ribbon-button" onclick="showCreateFileModal('')" title="New File">
              ${icons.fileText()}
            </button>
            <button class="ribbon-button" onclick="showCreateFolderModal()" title="New Folder">
              ${icons.folderOpen()}
            </button>
            <button class="ribbon-button" onclick="refreshFileTree()" title="Refresh files">
              ${icons.refresh()}
            </button>
            <div class="sort-menu-container">
              <button id="sort-menu" class="ribbon-button" title="Sort files" onclick="toggleSortMenu()">
                ${icons.arrowDown()}
              </button>
              <div id="sort-dropdown" class="sort-dropdown hidden">
                <div class="dropdown-item" onclick="setSortOption('alphabetical')">
                  <span class="dropdown-icon">${icons.aArrowDown({ size: 14 })}</span>
                  <span class="dropdown-label">Alphabetical</span>
                </div>
                <div class="dropdown-item" onclick="setSortOption('created')">
                  <span class="dropdown-icon">${icons.calendar({ size: 14 })}</span>
                  <span class="dropdown-label">Date Created</span>
                </div>
                <div class="dropdown-item" onclick="setSortOption('modified')">
                  <span class="dropdown-icon">${icons.clock({ size: 14 })}</span>
                  <span class="dropdown-label">Date Modified</span>
                </div>
              </div>
            </div>
          </div>
          <div class="sidebar-header">
            <div id="vault-picker-container"></div>
            <div class="header-actions">
              <!-- Header actions will be populated dynamically -->
            </div>
          </div>
          <div class="file-tree" id="file-tree">
            <div class="empty-state">
              <p>No vault open</p>
              <button id="open-vault" class="primary-button" onclick="window.openVault()">Open Vault</button>
              <button id="create-vault" class="secondary-button" onclick="window.createVault()">Create Vault</button>
            </div>
          </div>
          <div class="sidebar-resize-handle" id="sidebar-resize-handle"></div>
        </div>
        <div class="editor-container">
          <div class="editor-header" id="editor-header" data-tauri-drag-region>
            <div class="editor-left-controls">
              <button id="sidebar-toggle" class="editor-control-btn" onclick="toggleSidebar()" title="Toggle Sidebar">
                ${icons.panelLeft()}
              </button>
              <button id="zen-mode-btn" class="editor-control-btn" onclick="toggleZenMode()" title="Zen Mode (Cmd+Option+Z)">
                ${icons.yinYang()}
              </button>
            </div>
            <span class="file-name">Welcome to Gamplan</span>
            <div class="editor-controls">
              <button class="chat-toggle-btn editor-control-btn${window.chatPanel?.isVisible ? ' active' : ''}" onclick="toggleChatPanel()" title="AI Chat (Cmd+Shift+C)">
                ${icons.messageSquare()}
              </button>
              <button id="split-view-btn" class="editor-control-btn${paneManager?.isSplit ? ' active' : ''}" onclick="toggleSplitView()" title="Split View">
                ${icons.columns2()}
              </button>
              <div class="editor-menu-container">
                <button id="editor-menu-btn" class="editor-control-btn" onclick="toggleEditorMenu()" title="Editor Menu">
                  ${icons.menu()}
                </button>
                <div id="editor-dropdown" class="editor-dropdown hidden">
                  <div class="editor-dropdown-item" onclick="toggleZenMode()">
                    <span id="zen-mode-text">Enter zen mode</span>
                  </div>
                  <div class="editor-dropdown-divider"></div>
                  <div class="editor-dropdown-item" onclick="generateHighlightsSummary()">
                    <span>Generate Highlights Summary</span>
                  </div>
                  <div class="editor-dropdown-divider"></div>
                  <div class="editor-dropdown-item" onclick="exportToPDF()">
                    <span>Export as PDF</span>
                  </div>
                  <div class="editor-dropdown-item" onclick="exportToHTML()">
                    <span>Export as HTML</span>
                  </div>
                  <div class="editor-dropdown-item" onclick="exportToWord()">
                    <span>Export as Word (.doc)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div id="editor-wrapper" class="editor-wrapper">
            <div id="editor-container" class="editor"></div>
          </div>
          <div class="editor-status-bar" id="editor-status-bar">
            <span id="word-count">0 words</span>
            <span id="char-count">0 characters</span>
          </div>
        </div>
        
        <!-- Right Sidebar for Chat -->
        <div class="right-sidebar" id="right-sidebar">
          <div class="chat-resize-handle" id="chat-resize-handle"></div>
          <div id="chat-panel-container"></div>
        </div>
        
        <!-- Context Menu: File -->
        <div id="file-context-menu" class="context-menu hidden">
          <div class="context-menu-item" data-action="delete">
            Delete
          </div>
          <div class="context-menu-item" data-action="move">
            Move file to...
          </div>
          <div class="context-menu-item" data-action="rename">
            Rename
          </div>
          <div class="context-menu-separator"></div>
          <div class="context-menu-item" data-action="reveal">
            View in Finder
          </div>
          <div class="context-menu-separator"></div>
          <div class="context-menu-item" data-action="inspect">
            Inspect
          </div>
        </div>

        <!-- Context Menu: Folder -->
        <div id="folder-context-menu" class="context-menu hidden">
          <div class="context-menu-item" data-action="delete">
            Delete
          </div>
          <div class="context-menu-item" data-action="move">
            Move folder to...
          </div>
          <div class="context-menu-item" data-action="rename">
            Rename
          </div>
          <div class="context-menu-separator"></div>
          <div class="context-menu-item" data-action="reveal">
            View in Finder
          </div>
          <div class="context-menu-separator"></div>
          <div class="context-menu-item" data-action="inspect">
            Inspect
          </div>
        </div>
        
        <!-- Rename Modal -->
        <div id="rename-modal" class="modal hidden">
          <div class="modal-backdrop" onclick="closeRenameModal()"></div>
          <div class="modal-content">
            <h3>Rename</h3>
            <input type="text" id="rename-input" class="modal-input" />
            <div class="modal-buttons">
              <button onclick="confirmRename()">Rename</button>
              <button onclick="closeRenameModal()">Cancel</button>
            </div>
          </div>
        </div>
        
        <!-- Move Modal -->
        <div id="move-modal" class="modal hidden">
          <div class="modal-backdrop" onclick="closeMoveModal()"></div>
          <div class="modal-content modal-move">
            <input type="text" id="move-filter" class="modal-input" placeholder="Type a folder" />
            <div id="move-folder-list" class="move-folder-list">
              <!-- Folders will be populated here -->
            </div>
            <div class="move-shortcuts">
              <span>↑↓ to navigate</span>
              <span>↵ to move</span>
              <span>shift ↵ to create</span>
              <span>esc to dismiss</span>
            </div>
          </div>
        </div>
      </div>
    `;
    
    console.log('✅ UI HTML set successfully');
    
    // Initialize CodeMirror editor
    await initializeEditor();
    
    // Initialize Enhanced Chat Panel
    await initializeChatPanel();
    
    // Initialize MCP Settings Panel
    await initializeMCPSettings();
    
    // Check for last opened vault - now handled by WindowContext
    // WindowContext will check URL params and saved state
    if (!windowContext.hasVault) {
      try {
        const lastVault = await invoke('get_last_vault');
        if (lastVault) {
          console.log('🔄 Found last vault:', lastVault);
          // Let WindowContext handle opening
          await windowContext.openVault(lastVault);
        } else {
          // No last vault, show welcome screen
          showWelcomeScreen();
        }
      } catch (error) {
        console.error('⚠️ Failed to load last vault:', error);
        // Show welcome screen as fallback
        showWelcomeScreen();
      }
    }
    
    // Add keyboard support for rename modal
    const renameInput = document.getElementById('rename-input');
    if (renameInput) {
      renameInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          window.confirmRename();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          window.closeRenameModal();
        }
      });
    }
    
    // Add keyboard support for move modal
    const moveFilter = document.getElementById('move-filter');
    if (moveFilter) {
      // Handle filter input changes
      moveFilter.addEventListener('input', function(e) {
        displayFolders(e.target.value);
      });
      
      // Handle keyboard navigation
      moveFilter.addEventListener('keydown', function(e) {
        const filtered = moveFilter.value ? 
          availableFolders.filter(f => 
            f.display.toLowerCase().includes(moveFilter.value.toLowerCase())
          ) : availableFolders;
        
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedFolderIndex = Math.min(selectedFolderIndex + 1, filtered.length - 1);
          displayFolders(moveFilter.value);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedFolderIndex = Math.max(selectedFolderIndex - 1, 0);
          displayFolders(moveFilter.value);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) {
            // Shift+Enter to create new folder
            const newFolderName = moveFilter.value.trim();
            if (newFolderName) {
              createAndMoveToFolder(newFolderName);
            }
          } else {
            // Enter to move to selected folder
            if (filtered[selectedFolderIndex]) {
              confirmMove(filtered[selectedFolderIndex].path);
            }
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          window.closeMoveModal();
        }
      });
    }
    
    // Set up context menu handling for file and folder items
    document.addEventListener('contextmenu', function(e) {
      // Files
      const fileItem = e.target.closest('.tree-item.file');
      if (fileItem) {
        e.preventDefault();
        const filePath = fileItem.getAttribute('data-path');
        if (filePath) {
          window.showFileContextMenu(e, filePath);
        }
        return false;
      }
      // Folders
      const folderItem = e.target.closest('.tree-item.folder');
      if (folderItem) {
        e.preventDefault();
        const folderPath = folderItem.getAttribute('data-path');
        if (folderPath) {
          window.showFolderContextMenu(e, folderPath);
        }
        return false;
      }
      // Otherwise, allow default
    }, true);
    
    // Set up click handling for context menu items
    const contextMenu = document.getElementById('file-context-menu');
    if (contextMenu) {
      contextMenu.addEventListener('click', function(e) {
        e.stopPropagation(); // Stop event from bubbling
        
        const menuItem = e.target.closest('.context-menu-item');
        if (menuItem && !menuItem.dataset.handled) {
          // Mark as handled to prevent duplicate calls
          menuItem.dataset.handled = 'true';
          
          const action = menuItem.getAttribute('data-action');
          console.log('Context menu action clicked:', action);
          
          switch(action) {
            case 'delete':
              window.deleteFile();
              break;
            case 'move':
              window.moveFile();
              break;
            case 'rename':
              window.renameFile();
              break;
            case 'reveal':
              window.revealInFinder();
              break;
            case 'inspect':
              (async () => { try { await invoke('toggle_devtools'); } catch (e) { console.error(e); } })();
              break;
          }
          
          // Reset the handled flag after a short delay
          setTimeout(() => {
            delete menuItem.dataset.handled;
          }, 100);
        }
      });
    }

    // Set up delegated drag-and-drop listeners on the file tree container
    (function setupFileTreeDnDDelegates() {
      const tree = document.getElementById('file-tree');
      if (!tree || tree.__dndDelegatesSetup) return;
      tree.__dndDelegatesSetup = true;
      dndLog('delegates: attaching on #file-tree');

      tree.addEventListener('dragenter', (e) => {
        const folder = e.target.closest?.('.tree-item.folder');
        if (!folder) return;
        e.preventDefault();
        e.stopPropagation();
        folder.classList.add('drag-over');
        dndLog('tree dragenter', { dest: folder.getAttribute('data-path') });
      }, true);

      tree.addEventListener('dragover', (e) => {
        const folder = e.target.closest?.('.tree-item.folder');
        if (!folder) return;
        e.preventDefault();
        e.stopPropagation();
        try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
        if (!folder.classList.contains('drag-over')) folder.classList.add('drag-over');
        dndLog('tree dragover', { dest: folder.getAttribute('data-path') });
      }, true);

      tree.addEventListener('dragleave', (e) => {
        const folder = e.target.closest?.('.tree-item.folder');
        if (!folder) return;
        e.stopPropagation();
        folder.classList.remove('drag-over');
        dndLog('tree dragleave', { dest: folder.getAttribute('data-path') });
      }, true);

      tree.addEventListener('drop', async (e) => {
        const folder = e.target.closest?.('.tree-item.folder');
        if (!folder) return;
        e.preventDefault();
        e.stopPropagation();
        folder.classList.remove('drag-over');
        const destinationPath = folder.getAttribute('data-path') || '';
        const sourcePath = e.dataTransfer?.getData('text/plain') || window.__dragSourcePath || '';
        dndLog('tree drop', { destinationPath, sourcePath });
        if (!sourcePath) return;
        window.__dndDropProcessed = true;
        await performMoveToFolder(sourcePath, destinationPath);
      }, true);
    })();

    // Global capture fallback for WebKit: use hit-testing to detect folder under pointer
    (function setupGlobalDnDFallback() {
      if (document.__globalDnDSetup) return;
      document.__globalDnDSetup = true;
      let lastHoverEl = null;

      const findFolderAtPoint = (x, y) => {
        const els = document.elementsFromPoint(x, y) || [];
        for (const el of els) {
          const folder = el.closest?.('.tree-item.folder');
          if (folder) return folder;
        }
        return null;
      };

      document.addEventListener('dragover', (e) => {
        // CRITICAL: Always preventDefault to enable drop events in WKWebView
        e.preventDefault();
        e.stopPropagation();
        
        try { 
          e.dataTransfer.dropEffect = 'move';
        } catch (_) {}
        
        if (window.__dragSourcePath) {
          const folder = findFolderAtPoint(e.clientX, e.clientY);
          if (folder !== lastHoverEl) {
            if (lastHoverEl) lastHoverEl.classList.remove('drag-over');
            if (folder) folder.classList.add('drag-over');
            lastHoverEl = folder;
          }
          dndLog('doc dragover (fallback)', { dest: folder?.getAttribute('data-path'), clientX: e.clientX, clientY: e.clientY });
        }
      }, true);

      document.addEventListener('drop', async (e) => {
        // Always preventDefault to handle the drop
        e.preventDefault();
        e.stopPropagation();
        
        const sourcePath = window.__dragSourcePath || e.dataTransfer?.getData('text/plain') || e.dataTransfer?.getData('application/x-vault-file') || '';
        if (!sourcePath) {
          dndLog('doc drop - no source path');
          return;
        }
        
        const folder = findFolderAtPoint(e.clientX, e.clientY);
        const destinationPath = folder?.getAttribute('data-path') || '';
        
        if (lastHoverEl) { 
          lastHoverEl.classList.remove('drag-over'); 
          lastHoverEl = null; 
        }
        
        dndLog('doc drop (fallback)', { destinationPath, sourcePath, clientX: e.clientX, clientY: e.clientY });
        
        if (!destinationPath) {
          dndLog('doc drop - no destination folder');
          return;
        }
        
        window.__dndDropProcessed = true;
        await performMoveToFolder(sourcePath, destinationPath);
      }, true);

      document.addEventListener('dragend', () => {
        if (lastHoverEl) lastHoverEl.classList.remove('drag-over');
        lastHoverEl = null;
      }, true);
    })();
    
    // CRITICAL: Unconditional window-level capture for WKWebView
    (function setupUnconditionalWindowCapture() {
      if (window.__unconditionalCaptureSetup) return;
      window.__unconditionalCaptureSetup = true;
      
      // Force accept ALL dragover events at window level
      window.addEventListener('dragover', (e) => {
        e.preventDefault(); // MUST prevent default to enable drop
        try {
          e.dataTransfer.dropEffect = 'move';
        } catch (_) {}
        dndLog('window dragover (unconditional)', { 
          x: e.clientX, 
          y: e.clientY,
          types: e.dataTransfer ? Array.from(e.dataTransfer.types) : []
        });
      }, true);
      
      // Capture window-level drop as last resort
      window.addEventListener('drop', (e) => {
        e.preventDefault();
        dndLog('window drop (unconditional)', {
          x: e.clientX,
          y: e.clientY,
          types: e.dataTransfer ? Array.from(e.dataTransfer.types) : [],
          hasSource: !!window.__dragSourcePath
        });
      }, true);
    })();
    
    // Additional mousemove tracking during drag for WKWebView
    (function setupDragMouseTracking() {
      let isDragging = false;
      
      document.addEventListener('dragstart', () => {
        isDragging = true;
        dndLog('drag mouse tracking started');
      }, true);
      
      document.addEventListener('dragend', () => {
        isDragging = false;
        dndLog('drag mouse tracking stopped');
      }, true);
      
      document.addEventListener('mousemove', (e) => {
        if (isDragging && e.clientX && e.clientY) {
          window.__dragLastPt = { x: e.clientX, y: e.clientY };
          // Don't log every mousemove to avoid spam
        }
      }, true);
    })();

    // Folder context menu actions
    const folderMenu = document.getElementById('folder-context-menu');
    if (folderMenu) {
      folderMenu.addEventListener('click', function(e) {
        e.stopPropagation();
        const menuItem = e.target.closest('.context-menu-item');
        if (menuItem && !menuItem.dataset.handled) {
          menuItem.dataset.handled = 'true';
          const action = menuItem.getAttribute('data-action');
          console.log('Folder context menu action:', action);
          switch (action) {
            case 'delete':
              window.deleteFolder();
              break;
            case 'move':
              window.moveFolder();
              break;
            case 'rename':
              window.renameFile(); // Reuse rename flow
              break;
            case 'reveal':
              window.revealInFinder();
              break;
            case 'inspect':
              (async () => { try { await invoke('toggle_devtools'); } catch (e) { console.error(e); } })();
              break;
          }
          setTimeout(() => { delete menuItem.dataset.handled; }, 100);
        }
      });
    }
    
    // Add click-outside-to-close functionality for dropdowns
    document.addEventListener('click', function(event) {
      // Vault dropdown
      const vaultDropdown = document.getElementById('vault-dropdown');
      const vaultMenuContainer = document.querySelector('.vault-menu-container');
      
      if (vaultDropdown && !vaultDropdown.classList.contains('hidden')) {
        if (!vaultMenuContainer?.contains(event.target)) {
          vaultDropdown.classList.add('hidden');
        }
      }
      
      // Editor dropdown
      const editorDropdown = document.getElementById('editor-dropdown');
      const editorMenuContainer = document.querySelector('.editor-menu-container');
      
      if (editorDropdown && !editorDropdown.classList.contains('hidden')) {
        if (!editorMenuContainer?.contains(event.target)) {
          editorDropdown.classList.add('hidden');
        }
      }
    });
    
    // Set up auto-save on window before unload
    window.addEventListener('beforeunload', async (e) => {
      if (currentEditor && currentEditor.hasUnsavedChanges && currentFile) {
        e.preventDefault();
        await saveCurrentFile();
      }

      // Stop vault sync
      if (vaultSync) {
        vaultSync.stop();
      }
    });

    // Set up sidebar resize functionality
    setupSidebarResize();

  } else {
    console.error('❌ No #app element found');
  }
}

// Context Menu Functions
let contextMenuTarget = null;

window.showFileContextMenu = function(event, filePath) {
  const contextMenu = document.getElementById('file-context-menu');
  if (!contextMenu) return;
  
  // Hide any existing context menu first
  window.hideContextMenu();
  
  contextMenuTarget = filePath;
  
  // Position the menu at the mouse location
  contextMenu.style.left = event.clientX + 'px';
  contextMenu.style.top = event.clientY + 'px';
  contextMenu.classList.remove('hidden');
  
  // Prevent immediate closing by stopping propagation on the menu itself
  const stopProp = function(e) {
    e.stopPropagation();
  };
  contextMenu.addEventListener('mousedown', stopProp);
  contextMenu.addEventListener('mouseup', stopProp);
  contextMenu.addEventListener('click', stopProp);
  
  // Add listener to hide menu when clicking elsewhere
  // Small delay to ensure menu is fully rendered
  requestAnimationFrame(() => {
    const hideOnClick = function(e) {
      if (!contextMenu.contains(e.target)) {
        window.hideContextMenu();
        document.removeEventListener('mousedown', hideOnClick, true);
      }
    };
    document.addEventListener('mousedown', hideOnClick, true);
  });
}

window.hideContextMenu = function() {
  const fileMenu = document.getElementById('file-context-menu');
  if (fileMenu) fileMenu.classList.add('hidden');
  const folderMenu = document.getElementById('folder-context-menu');
  if (folderMenu) folderMenu.classList.add('hidden');
  // Don't clear contextMenuTarget here - let the action handlers do it
}

// Folder Context Menu
window.showFolderContextMenu = function(event, folderPath) {
  const menu = document.getElementById('folder-context-menu');
  if (!menu) return;
  
  // Hide any existing menus first
  window.hideContextMenu();
  
  contextMenuTarget = folderPath;
  menu.style.left = event.clientX + 'px';
  menu.style.top = event.clientY + 'px';
  menu.classList.remove('hidden');
  
  const stopProp = function(e) { e.stopPropagation(); };
  menu.addEventListener('mousedown', stopProp);
  menu.addEventListener('mouseup', stopProp);
  menu.addEventListener('click', stopProp);
  
  requestAnimationFrame(() => {
    const hideOnClick = function(e) {
      if (!menu.contains(e.target)) {
        window.hideContextMenu();
        document.removeEventListener('mousedown', hideOnClick, true);
      }
    };
    document.addEventListener('mousedown', hideOnClick, true);
  });
}

window.deleteFile = async function() {
  if (!contextMenuTarget) return;
  
  const targetPath = contextMenuTarget; // Capture the path before async operation
  const fileName = targetPath.split('/').pop();
  
  // Use Tauri's dialog API for confirmation
  const confirmed = await ask(`Are you sure you want to delete "${fileName}"?`, {
    title: 'Delete File',
    type: 'warning'
  });
  
  if (confirmed) {
    invoke('delete_file', { filePath: targetPath })
      .then(async () => {
        console.log('File deleted successfully');
        
        // Close any tabs that have this file open
        if (tabManager) {
          console.log('Looking for tab with path:', targetPath);
          console.log('Current tabs:', Array.from(tabManager.tabs.values()).map(t => ({ id: t.id, path: t.filePath, title: t.title })));
          
          const tabToClose = tabManager.findTabByPath(targetPath);
          if (tabToClose) {
            console.log('Found tab to close:', tabToClose.id, tabToClose.filePath);
            tabManager.closeTab(tabToClose.id, true); // Force close without save prompt
          } else {
            console.log('No tab found for deleted file path:', targetPath);
          }
        }
        
        // Refresh file tree
        try {
          const fileTree = await invoke('get_file_tree');
          displayFileTree(fileTree);
        } catch (error) {
          console.error('Error refreshing file tree:', error);
        }
      })
      .catch(error => {
        console.error('Error deleting file:', error);
        alert('Error deleting file: ' + error);
      });
  }
  
  window.hideContextMenu();
  contextMenuTarget = null; // Clear after action completes
}

// Folder actions
window.deleteFolder = async function() {
  if (!contextMenuTarget) return;
  
  const targetPath = contextMenuTarget;
  const folderName = targetPath.split('/').pop() || targetPath;
  
  const confirmed = await ask(`Delete folder "${folderName}" and all contents?`, {
    title: 'Delete Folder',
    type: 'warning'
  });
  
  if (confirmed) {
    invoke('delete_folder', { folderPath: targetPath })
      .then(async () => {
        console.log('Folder deleted successfully');
        try {
          const fileTree = await invoke('get_file_tree');
          displayFileTree(fileTree);
        } catch (error) {
          console.error('Error refreshing file tree:', error);
        }
      })
      .catch(error => {
        console.error('Error deleting folder:', error);
        alert('Error deleting folder: ' + error);
      });
  }
  
  window.hideContextMenu();
  contextMenuTarget = null;
}

window.moveFolder = function() {
  if (!contextMenuTarget) return;
  const folderName = contextMenuTarget.split('/').pop() || contextMenuTarget;
  moveContext = {
    targetPath: contextMenuTarget,
    fileName: folderName,
    isFolder: true
  };
  window.hideContextMenu();
  contextMenuTarget = null;
  const modal = document.getElementById('move-modal');
  const filter = document.getElementById('move-filter');
  if (modal && filter) {
    loadFoldersForMove();
    modal.classList.remove('hidden');
    setTimeout(() => { filter.focus(); }, 50);
  }
}

// Store move context globally
let moveContext = null;
let selectedFolderIndex = 0;
let availableFolders = [];

window.moveFile = function() {
  if (!contextMenuTarget) return;
  
  const fileName = contextMenuTarget.split('/').pop();
  
  moveContext = {
    targetPath: contextMenuTarget,
    fileName: fileName
  };
  
  // Hide the context menu
  window.hideContextMenu();
  contextMenuTarget = null;
  
  // Show the move modal
  const modal = document.getElementById('move-modal');
  const filter = document.getElementById('move-filter');
  
  if (modal && filter) {
    // Load folders and show modal
    loadFoldersForMove();
    modal.classList.remove('hidden');
    
    // Focus the filter input
    setTimeout(() => {
      filter.focus();
    }, 50);
  }
}

async function loadFoldersForMove() {
  try {
    // Get the file tree
    const fileTree = await invoke('get_file_tree');
    
    // Extract folders from the file tree
    availableFolders = [{
      path: '/',
      name: '/',
      display: '/'
    }];
    
    // Get unique folders
    const folderSet = new Set();
    fileTree.files.forEach(file => {
      if (file.is_dir) {
        folderSet.add(file.path);
      }
      // Also add parent directories
      if (file.parent_path) {
        folderSet.add(file.parent_path);
      }
    });
    
    // Convert to array and sort
    const folders = Array.from(folderSet).sort();
    folders.forEach(folder => {
      availableFolders.push({
        path: folder,
        name: folder.split('/').pop() || folder,
        display: folder
      });
    });
    
    // Display the folders
    displayFolders('');
    
  } catch (error) {
    console.error('Error loading folders:', error);
  }
}

function displayFolders(filterText) {
  const listEl = document.getElementById('move-folder-list');
  if (!listEl) return;
  
  // Filter folders based on search text
  let filtered = filterText ? 
    availableFolders.filter(f => 
      f.display.toLowerCase().includes(filterText.toLowerCase())
    ) : availableFolders;

  // If moving a folder, prevent selecting the folder itself or its descendants
  if (moveContext && moveContext.isFolder && moveContext.targetPath) {
    const base = moveContext.targetPath.replace(/\/$/, '');
    filtered = filtered.filter(f => {
      const p = f.path.replace(/\/$/, '');
      if (p === base) return false; // same folder
      if (p.startsWith(base + '/')) return false; // descendant of folder being moved
      return true;
    });
  }
  
  // Reset selection if needed
  if (selectedFolderIndex >= filtered.length) {
    selectedFolderIndex = 0;
  }
  
  // Build HTML
  let html = '';
  filtered.forEach((folder, index) => {
    const selected = index === selectedFolderIndex ? 'selected' : '';
    html += `
      <div class="move-folder-item ${selected}" data-path="${folder.path}" data-index="${index}">
        <span>${folder.display}</span>
      </div>
    `;
  });
  
  listEl.innerHTML = html;
  
  // Add click handlers
  listEl.querySelectorAll('.move-folder-item').forEach(item => {
    item.addEventListener('click', function() {
      const path = this.getAttribute('data-path');
      confirmMove(path);
    });
  });
}

window.closeMoveModal = function() {
  const modal = document.getElementById('move-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  moveContext = null;
  selectedFolderIndex = 0;
}

function confirmMove(destinationPath) {
  if (!moveContext) return;
  
  // Construct the new path
  const newPath = destinationPath === '/' ? 
    moveContext.fileName : 
    `${destinationPath}/${moveContext.fileName}`;
  
  console.log('Moving file:', moveContext.targetPath, '->', newPath);
  
  invoke('move_file', { 
    oldPath: moveContext.targetPath, 
    newPath: newPath 
  })
    .then(async () => {
      console.log('File moved successfully');
      // Refresh file tree
      try {
        const fileTree = await invoke('get_file_tree');
        displayFileTree(fileTree);
      } catch (error) {
        console.error('Error refreshing file tree:', error);
      }
    })
    .catch(error => {
      console.error('Error moving file:', error);
      alert('Error moving file: ' + error);
    });
  
  window.closeMoveModal();
}

async function createAndMoveToFolder(folderName) {
  if (!moveContext) return;
  
  try {
    // Create the new folder
    await invoke('create_new_folder', { folderName: folderName });
    
    // Move the file to the new folder
    confirmMove(folderName);
    
  } catch (error) {
    console.error('Error creating folder:', error);
    alert('Error creating folder: ' + error);
  }
}

// Store rename context globally
let renameContext = null;

window.renameFile = function() {
  console.log('renameFile called, contextMenuTarget:', contextMenuTarget);
  if (!contextMenuTarget) {
    console.error('No contextMenuTarget set');
    return;
  }
  
  // Store the rename context
  const pathParts = contextMenuTarget.split('/');
  const fileName = pathParts.pop();
  const directory = pathParts.join('/');
  
  renameContext = {
    targetPath: contextMenuTarget,
    fileName: fileName,
    directory: directory
  };
  
  // Hide the menu
  window.hideContextMenu();
  contextMenuTarget = null;
  
  // Show the rename modal
  const modal = document.getElementById('rename-modal');
  const input = document.getElementById('rename-input');
  
  if (modal && input) {
    input.value = fileName;
    modal.classList.remove('hidden');
    
    // Focus and select the filename (without extension)
    setTimeout(() => {
      input.focus();
      const lastDot = fileName.lastIndexOf('.');
      if (lastDot > 0) {
        input.setSelectionRange(0, lastDot);
      } else {
        input.select();
      }
    }, 50);
  }
}

window.closeRenameModal = function() {
  const modal = document.getElementById('rename-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  renameContext = null;
}

window.confirmRename = function() {
  if (!renameContext) return;
  
  const input = document.getElementById('rename-input');
  const newName = input.value.trim();
  
  if (newName && newName !== renameContext.fileName) {
    // Construct the new path properly
    const newPath = renameContext.directory ? 
      `${renameContext.directory}/${newName}` : newName;
    
    console.log('Renaming file:', renameContext.targetPath, '->', newPath);
    
    invoke('rename_file', { 
      oldPath: renameContext.targetPath, 
      newPath: newPath 
    })
      .then(async () => {
        console.log('File renamed successfully');
        // Refresh file tree
        try {
          const fileTree = await invoke('get_file_tree');
          displayFileTree(fileTree);
        } catch (error) {
          console.error('Error refreshing file tree:', error);
        }
      })
      .catch(error => {
        console.error('Error renaming file:', error);
        alert('Error renaming file: ' + error);
      });
  }
  
  window.closeRenameModal();
}

// Open Task Dashboard
let taskDashboard = null;
window.openTaskDashboard = async function() {
  console.log('📋 Opening Task Dashboard...');
  
  try {
    if (!taskDashboard) {
      taskDashboard = new TaskDashboard();
    }
    await taskDashboard.open();
  } catch (error) {
    console.error('Failed to open Task Dashboard:', error);
  }
};

// Toggle AI Chat Panel
// Prevent multiple concurrent toggle attempts
let isToggling = false;

window.toggleChatPanel = function() {
  console.log('💬 Toggling AI Chat Panel...');
  
  // Prevent race conditions
  if (isToggling) {
    console.warn('⚠️ Chat panel toggle already in progress, skipping...');
    return;
  }
  
  // Track performance
  const startTime = Date.now();
  if (window.perfMonitor) {
    window.perfMonitor.trackChatMetrics('toggle_start', { timestamp: startTime });
  }
  
  isToggling = true;
  
  // Enhanced debugging
  const chatBtn = document.querySelector('.chat-toggle-btn');
  const rightSidebar = document.getElementById('right-sidebar');
  console.log('🔍 Chat button found:', !!chatBtn);
  console.log('🔍 Right sidebar found:', !!rightSidebar);
  console.log('🔍 Chat panel initialized:', !!chatPanel);
  
  if (!chatPanel) {
    console.error('❌ Chat panel not initialized');
    // Try to initialize it
    initializeChatPanel().then(() => {
      if (chatPanel) {
        console.log('✅ Chat panel initialized successfully, toggling...');
        try {
          chatPanel.toggle();
          console.log('✅ Chat panel toggled successfully');
        } catch (error) {
          console.error('❌ Error toggling chat panel after initialization:', error);
        }
      } else {
        console.error('❌ Failed to initialize chat panel');
      }
      isToggling = false;
      
      // Track performance
      if (window.perfMonitor) {
        window.perfMonitor.trackChatMetrics('toggle_complete', { 
          timestamp: Date.now(),
          duration: Date.now() - startTime,
          success: !!chatPanel
        });
      }
    }).catch(error => {
      console.error('❌ Error initializing chat panel:', error);
      isToggling = false;
      
      // Track performance
      if (window.perfMonitor) {
        window.perfMonitor.trackChatMetrics('toggle_error', { 
          timestamp: Date.now(),
          duration: Date.now() - startTime,
          error: error.message
        });
      }
    });
    return;
  }
  
  try {
    chatPanel.toggle();
    console.log('✅ Chat panel toggled successfully');
  } catch (error) {
    console.error('❌ Error toggling chat panel:', error);
  } finally {
    isToggling = false;
    
    // Track performance
    if (window.perfMonitor) {
      window.perfMonitor.trackChatMetrics('toggle_complete', { 
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        success: true
      });
    }
  }
};

// ======== Widget Sidebar Toggle ========
window.toggleWidgetSidebar = function() {
  console.log('📊 Toggling Widget Sidebar...');
  
  if (!window.widgetSidebar) {
    console.log('🔧 Widget sidebar not initialized, initializing now...');
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) {
      console.error('❌ App container not found');
      return;
    }
    
    // Create and initialize widget sidebar
    window.widgetSidebar = new WidgetSidebar();
    window.widgetSidebar.mount(appContainer);

    // Ensure the active editor (if any) is wired to the sidebar immediately
    try {
      if (typeof currentEditor !== 'undefined' && currentEditor) {
        window.widgetSidebar.updateActiveEditor(currentEditor);
      }
    } catch (e) {
      console.warn('⚠️ Failed to set active editor on widget sidebar init:', e);
    }
  }
  
  try {
    window.widgetSidebar.toggle();
    console.log('✅ Widget sidebar toggled successfully');
  } catch (error) {
    console.error('❌ Error toggling widget sidebar:', error);
  }
};

// Add a manual test function
window.testChatPanel = function() {
  console.log('🧪 Testing chat panel...');
  const rightSidebar = document.getElementById('right-sidebar');
  const chatBtn = document.querySelector('.chat-toggle-btn');
  
  console.log('🔍 Elements found:');
  console.log('- Right sidebar:', !!rightSidebar);
  console.log('- Chat button:', !!chatBtn);
  console.log('- Chat panel:', !!window.chatPanel);
  
  if (chatBtn) {
    chatBtn.style.backgroundColor = 'red';
    chatBtn.style.color = 'white';
    setTimeout(() => {
      chatBtn.style.backgroundColor = '';
      chatBtn.style.color = '';
    }, 2000);
    console.log('🔴 Chat button should flash red for 2 seconds');
  }
  
  if (rightSidebar) {
    console.log('✅ Right sidebar found, toggling...');
    rightSidebar.classList.toggle('visible');
    console.log('🔄 Toggled right sidebar visibility');
  } else {
    console.error('❌ Right sidebar not found');
  }
};

// Toggle split view
window.toggleSplitView = function() {
  console.log('🔀 Toggling split view');
  if (!paneManager) {
    console.error('❌ PaneManager not initialized');
    return;
  }
  
  if (paneManager.isSplit) {
    paneManager.unsplit();
    // Update button appearance
    const splitBtn = document.getElementById('split-view-btn');
    if (splitBtn) {
      splitBtn.classList.remove('active');
    }
  } else {
    paneManager.split();
    // Update button appearance
    const splitBtn = document.getElementById('split-view-btn');
    if (splitBtn) {
      splitBtn.classList.add('active');
    }
  }
};

// Sidebar toggle function
window.toggleSidebar = function() {
  console.log('🔽 Toggling sidebar...');
  const sidebar = document.querySelector('.sidebar');
  const editorContainer = document.querySelector('.editor-container');

  if (sidebar && editorContainer) {
    const isHidden = sidebar.style.display === 'none';

    if (isHidden) {
      // Show sidebar
      sidebar.style.display = 'flex';
      editorContainer.style.marginLeft = '0';
      editorContainer.classList.remove('sidebar-hidden');
      console.log('📋 Sidebar shown');
    } else {
      // Hide sidebar
      sidebar.style.display = 'none';
      editorContainer.style.marginLeft = '0';
      editorContainer.classList.add('sidebar-hidden');
      console.log('📋 Sidebar hidden');
    }
  }
};

// Editor menu toggle function
window.toggleEditorMenu = function() {
  console.log('🔽 Toggling editor menu...');
  const dropdown = document.getElementById('editor-dropdown');
  if (dropdown) {
    dropdown.classList.toggle('hidden');
    console.log('📋 Editor menu visibility:', !dropdown.classList.contains('hidden'));
  }
};

// Show copy notification function
function showCopyNotification(message) {
  // Remove any existing notification
  const existingNotification = document.getElementById('copy-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'copy-notification';
  notification.className = 'copy-notification';
  notification.textContent = message;
  
  // Add to document
  document.body.appendChild(notification);
  
  // Position it near the copy button
  const copyBtn = document.getElementById('copy-all-btn');
  if (copyBtn) {
    const btnRect = copyBtn.getBoundingClientRect();
    notification.style.position = 'fixed';
    notification.style.top = (btnRect.bottom + 8) + 'px';
    notification.style.right = '24px';
    notification.style.zIndex = '10000';
  }
  
  // Animate in
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Remove after delay
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 2000);
}

// Update word and character count
window.updateWordCount = function() {
  if (currentEditor) {
    const content = currentEditor.getContent();
    
    // Strip common markdown syntax to get plain text
    let plainText = content
      // Remove headers (# ## ### etc)
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold/italic markers
      .replace(/(\*{1,3}|_{1,3})([^\*_]+)\1/g, '$2')
      // Remove inline code
      .replace(/`([^`]+)`/g, '$1')
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      // Remove links but keep text
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      // Remove images
      .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '')
      // Remove horizontal rules
      .replace(/^(\*{3,}|-{3,}|_{3,})$/gm, '')
      // Remove blockquotes
      .replace(/^>\s+/gm, '')
      // Remove list markers
      .replace(/^[\*\-\+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      // Remove HTML tags
      .replace(/<[^>]+>/g, '')
      // Clean up extra whitespace
      .replace(/\s+/g, ' ')
      .trim();
    
    // Count words (split by whitespace and filter out empty strings)
    const words = plainText === '' ? 0 : plainText.split(/\s+/).filter(w => w.length > 0).length;
    
    // Count characters (only actual content, no markdown)
    const characters = plainText.length;
    
    // Update the UI
    const wordCountEl = document.getElementById('word-count');
    const charCountEl = document.getElementById('char-count');
    
    if (wordCountEl) {
      wordCountEl.textContent = `${words.toLocaleString()} word${words === 1 ? '' : 's'}`;
    }
    
    if (charCountEl) {
      charCountEl.textContent = `${characters.toLocaleString()} character${characters === 1 ? '' : 's'}`;
    }
  }
}

// Copy all text function
window.copyAllText = function() {
  if (currentEditor) {
    try {
      // Get all text from the editor
      const allText = currentEditor.getContent();
      
      // Use the Clipboard API to copy text
      navigator.clipboard.writeText(allText).then(() => {
        console.log('✅ All text copied to clipboard');
        
        // Show success notification
        showCopyNotification('Copy successful');
        
        // Visual feedback - briefly change button appearance
        const copyBtn = document.getElementById('copy-all-btn');
        if (copyBtn) {
          copyBtn.classList.add('active');
          setTimeout(() => {
            copyBtn.classList.remove('active');
          }, 200);
        }
      }).catch(err => {
        console.error('❌ Failed to copy text:', err);
        
        // Fallback: select all text in editor for manual copy
        const view = currentEditor.view;
        view.dispatch({
          selection: { anchor: 0, head: view.state.doc.length }
        });
        view.focus();
      });
    } catch (error) {
      console.error('❌ Error copying text:', error);
    }
  } else {
    console.log('⚠️ No editor available to copy from');
  }
};

// Status bar toggle function
window.toggleStatusBar = function() {
  const statusBar = document.getElementById('editor-status-bar');
  const menuText = document.getElementById('status-bar-text');
  
  if (statusBar) {
    // Toggle global state
    statusBarVisible = !statusBarVisible;
    
    // Apply visibility
    statusBar.style.display = statusBarVisible ? 'flex' : 'none';
    
    // Update menu text
    if (menuText) {
      menuText.textContent = statusBarVisible ? 'Hide status bar' : 'Show status bar';
    }
    
    console.log('📊 Status bar', statusBarVisible ? 'shown' : 'hidden');
    
    // Hide dropdown after selection
    const dropdown = document.getElementById('editor-dropdown');
    if (dropdown) {
      dropdown.classList.add('hidden');
    }
  }
};

// Export to PDF function
window.exportToPDF = async function() {
  console.log('📄 Exporting to PDF...');
  
  // Hide dropdown
  const dropdown = document.getElementById('editor-dropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
  }
  
  if (!currentEditor || !currentFile) {
    console.error('❌ No editor or file available for export');
    showNotification('Please open a file before exporting', 'error');
    return;
  }
  
  try {
    // Ensure editor is initialized before getting content
    if (!currentEditor.view || !currentEditor.view.state) {
      console.warn('Editor view not ready, waiting...');
      // Wait a bit for editor to initialize
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check again
      if (!currentEditor.view || !currentEditor.view.state) {
        console.error('❌ Editor still not initialized');
        showNotification('Editor not ready yet, please try again', 'error');
        return;
      }
    }
    
    // Get the markdown content
    const markdownContent = currentEditor.getContent();
    
    // Extract filename without extension for default export name
    const fileName = currentFile.split('/').pop().replace('.md', '');
    
    // Show save dialog
    const outputPath = await invoke('select_export_location', {
      fileName: fileName,
      extension: 'pdf'
    });
    
    if (!outputPath) {
      console.log('❌ Export cancelled by user');
      return;
    }
    
    console.log('📍 Export location selected:', outputPath);
    
    // Export to PDF
    await invoke('export_to_pdf', {
      markdownContent: markdownContent,
      outputPath: outputPath,
      options: {
        theme: 'light',
        include_styles: true,
        paper_size: 'A4'
      }
    });
    
    console.log('✅ PDF export completed successfully');
    showSuccess('PDF exported successfully');
    
  } catch (error) {
    console.error('❌ Failed to export PDF:', error);
    showNotification('Failed to export PDF: ' + error, 'error');
  }
};

// Export to HTML function
window.exportToHTML = async function() {
  console.log('📄 Exporting to HTML...');
  
  // Hide dropdown
  const dropdown = document.getElementById('editor-dropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
  }
  
  if (!currentEditor || !currentFile) {
    console.error('❌ No editor or file available for export');
    showNotification('Please open a file before exporting', 'error');
    return;
  }
  
  try {
    // Ensure editor is initialized before getting content
    if (!currentEditor.view || !currentEditor.view.state) {
      console.warn('Editor view not ready, waiting...');
      // Wait a bit for editor to initialize
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check again
      if (!currentEditor.view || !currentEditor.view.state) {
        console.error('❌ Editor still not initialized');
        showNotification('Editor not ready yet, please try again', 'error');
        return;
      }
    }
    
    // Get the markdown content
    const markdownContent = currentEditor.getContent();
    
    // Extract filename without extension for default export name
    const fileName = currentFile.split('/').pop().replace('.md', '');
    
    // Show save dialog
    const outputPath = await invoke('select_export_location', {
      fileName: fileName,
      extension: 'html'
    });
    
    if (!outputPath) {
      console.log('❌ Export cancelled by user');
      return;
    }
    
    console.log('📍 Export location selected:', outputPath);
    
    // Export to HTML
    await invoke('export_to_html', {
      markdownContent: markdownContent,
      outputPath: outputPath,
      options: {
        theme: 'light',
        include_styles: true,
        paper_size: null  // Not needed for HTML export
      }
    });
    
    console.log('✅ HTML export completed successfully');
    showSuccess('HTML exported successfully');
    
  } catch (error) {
    console.error('❌ Failed to export HTML:', error);
    showNotification('Failed to export HTML: ' + error, 'error');
  }
};

// Sync Vault to Knowledge Graph function
window.syncVaultToGraph = async function() {
  console.log('🔄 Syncing vault to knowledge graph...');
  
  // Hide dropdown
  const dropdown = document.getElementById('editor-dropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
  }
  
  // Show notification that sync is starting
  showNotification('Starting vault sync to knowledge graph...', 'info');
  
  try {
    console.log('Invoking sync_vault_to_graph...');
    const result = await invoke('sync_vault_to_graph').catch(err => {
      console.error('Invoke error:', err);
      throw err;
    });
    console.log('Graph sync result:', result);
    
    // Show success notification
    showNotification(result || 'Graph sync completed successfully', 'success');
    
  } catch (error) {
    console.error('Graph sync failed:', error);
    // Show error notification
    showNotification(error.message || 'Graph sync failed', 'error');
  }
};

// Export to Word function
window.exportToWord = async function() {
  console.log('📄 Exporting to Word...');
  
  // Hide dropdown
  const dropdown = document.getElementById('editor-dropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
  }
  
  if (!currentEditor || !currentFile) {
    console.error('❌ No editor or file available for export');
    showNotification('Please open a file before exporting', 'error');
    return;
  }
  
  try {
    // Ensure editor is initialized before getting content
    if (!currentEditor.view || !currentEditor.view.state) {
      console.warn('Editor view not ready, waiting...');
      // Wait a bit for editor to initialize
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check again
      if (!currentEditor.view || !currentEditor.view.state) {
        console.error('❌ Editor still not initialized');
        showNotification('Editor not ready yet, please try again', 'error');
        return;
      }
    }
    
    // Get the markdown content
    const markdownContent = currentEditor.getContent();
    
    // Extract filename without extension for default export name
    const fileName = currentFile.split('/').pop().replace('.md', '');
    
    // Show save dialog
    const outputPath = await invoke('select_export_location', {
      fileName: fileName,
      extension: 'doc'
    });
    
    if (!outputPath) {
      console.log('❌ Export cancelled by user');
      return;
    }
    
    console.log('📍 Export location selected:', outputPath);
    
    // Export to Word
    await invoke('export_to_word', {
      markdownContent: markdownContent,
      outputPath: outputPath,
      options: {
        theme: 'light',
        include_styles: true,
        paper_size: null  // Not needed for Word export
      }
    });
    
    console.log('✅ Word export completed successfully');
    showSuccess('Word document exported successfully');
    
  } catch (error) {
    console.error('❌ Failed to export Word document:', error);
    showNotification('Failed to export Word document: ' + error, 'error');
  }
};

// Show success notification
function showSuccess(message) {
  showNotification(message, 'success');
}

// Generic notification function
function showNotification(message, type = 'info') {
  // Remove any existing notification
  const existingNotification = document.getElementById('export-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'export-notification';
  notification.className = `export-notification ${type}`;
  notification.textContent = message;
  
  // Add to document
  document.body.appendChild(notification);
  
  // Position it at the top center
  notification.style.position = 'fixed';
  notification.style.top = '20px';
  notification.style.left = '50%';
  notification.style.transform = 'translateX(-50%)';
  notification.style.zIndex = '10000';
  
  // Animate in
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Remove after delay
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

// Show editor settings function
window.showEditorSettings = function() {
  console.log('⚙️ Showing editor settings...');
  
  // Hide dropdown
  const dropdown = document.getElementById('editor-dropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
  }
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'settings-overlay';
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(overlay);
      }, 300);
    }
  };
  
  // Create container for settings panel
  const container = document.createElement('div');
  overlay.appendChild(container);
  
  // Mount settings panel
  userSettingsPanel.mount(container, {
    onSave: async (settings) => {
      console.log('Settings saved, applying changes...');
      // Apply settings to all editors
      applySettingsToAllEditors(settings.editor);
      
      // Apply line numbers and line wrapping to current editor
      if (currentEditor) {
        if (currentEditor.setLineNumbers) {
          currentEditor.setLineNumbers(settings.editor.lineNumbers);
        }
        if (currentEditor.setLineWrapping) {
          currentEditor.setLineWrapping(settings.editor.lineWrapping);
        }
      }
      
      // Apply status bar visibility
      const statusBar = document.getElementById('status-bar');
      if (statusBar) {
        statusBar.style.display = settings.editor.showStatusBar ? 'flex' : 'none';
        statusBarVisible = settings.editor.showStatusBar;
      }
      
      // Update global image save location
      if (settings.files.imageLocation) {
        window.imageSaveLocation = settings.files.imageLocation;
      }
    },
    onClose: () => {
      overlay.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(overlay);
      }, 300);
    }
  });
  
  // Add to DOM and show
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add('show');
  });
}

// Generate highlights summary function
window.generateHighlightsSummary = function() {
  console.log('📝 Generating highlights summary...');
  
  // Hide dropdown
  const dropdown = document.getElementById('editor-dropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
  }
  
  if (!currentEditor) {
    console.error('❌ No editor available');
    showNotification('Please open a file before generating highlights', 'error');
    return;
  }
  
  // Call the summarizeHighlightsCommand through the editor's view
  if (currentEditor.view) {
    currentEditor.view.dispatch({
      effects: [] // Trigger a no-op to ensure view is current
    });
    
    // Import and call the command
    import('./editor/highlights-extension.js').then(module => {
      const result = module.summarizeHighlights(currentEditor.view);
      
      // Show notification based on result
      if (result.success) {
        showNotification(result.message, 'success');
      } else {
        showNotification(result.message, 'info');
      }
    }).catch(error => {
      console.error('❌ Failed to load highlights extension:', error);
      showNotification('Failed to generate highlights summary', 'error');
    });
  } else {
    console.error('❌ Editor view not available');
    showNotification('Editor not ready, please try again', 'error');
  }
};

// Make showNotification available globally for the highlights extension
window.showNotification = showNotification;

// Navigation functions
window.navigateBack = async function() {
  if (!paneManager) return;
  
  // Get the currently active pane's tab manager
  const activePaneId = paneManager.activePaneId;
  const tabManager = paneManager.getTabManager(activePaneId);
  if (!tabManager) return;
  
  const activeTab = tabManager.getActiveTab();
  if (!activeTab) return;
  
  const filePath = await tabManager.goBack(activeTab.id);
  if (filePath) {
    console.log('📍 Navigated back to:', filePath, 'in pane:', activePaneId);
  }
};

window.navigateForward = async function() {
  if (!paneManager) return;
  
  // Get the currently active pane's tab manager
  const activePaneId = paneManager.activePaneId;
  const tabManager = paneManager.getTabManager(activePaneId);
  if (!tabManager) return;
  
  const activeTab = tabManager.getActiveTab();
  if (!activeTab) return;
  
  const filePath = await tabManager.goForward(activeTab.id);
  if (filePath) {
    console.log('📍 Navigated forward to:', filePath, 'in pane:', activePaneId);
  }
};

window.updateNavigationButtons = function() {
  const backBtn = document.getElementById('nav-back-btn');
  const forwardBtn = document.getElementById('nav-forward-btn');
  
  if (!backBtn || !forwardBtn || !paneManager) return;
  
  // Get the currently active pane's tab manager
  const activePaneId = paneManager.activePaneId;
  const tabManager = paneManager.getTabManager(activePaneId);
  
  // Hide navigation buttons if no tabs are open
  if (!tabManager || tabManager.tabs.size === 0) {
    backBtn.style.display = 'none';
    forwardBtn.style.display = 'none';
    return;
  }
  
  const activeTab = tabManager.getActiveTab();
  if (!activeTab) {
    backBtn.style.display = 'none';
    forwardBtn.style.display = 'none';
    return;
  }
  
  // Show buttons and update their states
  backBtn.style.display = '';  // Use default display value
  forwardBtn.style.display = '';  // Use default display value
  backBtn.disabled = !tabManager.canGoBack(activeTab.id);
  forwardBtn.disabled = !tabManager.canGoForward(activeTab.id);
};

// Zen mode state
let isZenMode = false;
let zenModeState = {
  wasRightSidebarVisible: false,
  previousEditorState: null
};

// Zen mode toggle function
window.toggleZenMode = function() {
  console.log('🧘 Toggling zen mode...');
  
  const appContainer = document.querySelector('.app-container');
  const sidebar = document.querySelector('.sidebar');
  const rightSidebar = document.getElementById('right-sidebar');
  const editorHeader = document.getElementById('editor-header');
  const statusBar = document.getElementById('editor-status-bar');
  const editorContainer = document.querySelector('.editor-container');
  const menuText = document.getElementById('zen-mode-text');
  const dropdown = document.getElementById('editor-dropdown');
  
  isZenMode = !isZenMode;
  
  if (isZenMode) {
    // Enter zen mode
    console.log('🧘 Entering zen mode');
    
    // Save current state before hiding
    zenModeState.wasRightSidebarVisible = rightSidebar && rightSidebar.classList.contains('visible');
    
    // Hide UI elements with proper cleanup
    if (sidebar) {
      sidebar.style.display = 'none';
    }
    if (rightSidebar) {
      rightSidebar.classList.remove('visible');
      rightSidebar.style.display = 'none';
    }
    if (editorHeader) {
      editorHeader.style.display = 'none';
    }
    if (statusBar) {
      statusBar.style.display = 'none';
    }
    
    // Expand editor to full screen
    if (editorContainer) {
      editorContainer.style.margin = '0';
      editorContainer.style.height = '100vh';
      editorContainer.style.width = '100vw';
      editorContainer.style.maxWidth = 'none';
      editorContainer.style.flex = 'none';
    }
    
    // Add zen mode class for additional styling
    if (appContainer) {
      appContainer.classList.add('zen-mode');
    }
    
    // Update menu text
    if (menuText) {
      menuText.textContent = 'Exit zen mode';
    }
    
    // Focus the editor and ensure it's properly sized
    setTimeout(() => {
      if (currentEditor && currentEditor.view) {
        currentEditor.view.focus();
        // Force a resize to ensure proper rendering
        currentEditor.view.requestMeasure();
      }
    }, 100);
  } else {
    // Exit zen mode
    console.log('🧘 Exiting zen mode');
    
    // Restore UI elements
    if (sidebar) {
      sidebar.style.display = '';  // Use default display
    }
    if (editorHeader) {
      editorHeader.style.display = '';  // Use default display
    }
    
    // Restore status bar based on global state
    if (statusBar && statusBarVisible) {
      statusBar.style.display = '';  // Use default display
    }
    
    // Restore right sidebar if it was visible before zen mode
    if (rightSidebar) {
      // Always clear inline display style to allow CSS classes to work
      rightSidebar.style.display = '';

      // Add or remove visible class based on saved state
      if (zenModeState.wasRightSidebarVisible || (chatPanel && chatPanel.isVisible)) {
        rightSidebar.classList.add('visible');
      } else {
        rightSidebar.classList.remove('visible');
      }
    }
    
    // Reset editor container styles
    if (editorContainer) {
      // Remove all inline styles
      editorContainer.style.margin = '';
      editorContainer.style.height = '';
      editorContainer.style.width = '';
      editorContainer.style.maxWidth = '';
      editorContainer.style.flex = '';
    }
    
    // Remove zen mode class
    if (appContainer) {
      appContainer.classList.remove('zen-mode');
    }
    
    // Update menu text
    if (menuText) {
      menuText.textContent = 'Enter zen mode';
    }
    
    // Force layout recalculation and editor resize
    setTimeout(() => {
      // Force browser to recalculate layout
      if (editorContainer) {
        void editorContainer.offsetHeight;
      }
      
      // Ensure pane manager recalculates sizes
      if (window.paneManager) {
        window.paneManager.updateLayout();
      }
      
      // Request editor to remeasure
      if (currentEditor && currentEditor.view) {
        currentEditor.view.requestMeasure();
      }
    }, 100);
  }
  
  // Hide dropdown after selection
  if (dropdown) {
    dropdown.classList.add('hidden');
  }
};

// Apply settings to all open editors
function applySettingsToAllEditors(editorSettings) {
  console.log('Applying settings to all editors:', editorSettings);
  
  // Update CSS variables for immediate visual changes
  const root = document.documentElement;
  if (editorSettings.fontSize) {
    root.style.setProperty('--editor-font-size', `${editorSettings.fontSize}px`);
  }
  if (editorSettings.fontFamily) {
    root.style.setProperty('--editor-font-family', editorSettings.fontFamily);
  }
  if (editorSettings.fontColor) {
    root.style.setProperty('--editor-text-color', editorSettings.fontColor);
    // Also update markdown heading color for consistency
    root.style.setProperty('--md-heading-color', editorSettings.fontColor);
  }
  
  // Apply theme globally
  // Create ThemeManager early if needed - it works without an editor for CSS variable application
  if (editorSettings.theme) {
    if (!currentThemeManager) {
      currentThemeManager = new ThemeManager(null);
      window.themeManager = currentThemeManager;
    }
    currentThemeManager.applyTheme(editorSettings.theme);
  }
  
  // Apply to all editors in all panes
  if (paneManager && paneManager.panes) {
    // panes is a Map, so we need to iterate over its values
    for (const pane of paneManager.panes.values()) {
      const tabManager = pane.tabManager;
      if (tabManager && tabManager.tabs) {
        // tabs is also a Map
        for (const tab of tabManager.tabs.values()) {
          if (tab.editor && tab.type === 'markdown') {
            console.log('Applying settings to editor');
            
            // Apply font size
            if (editorSettings.fontSize && tab.editor.setFontSize) {
              try {
                tab.editor.setFontSize(editorSettings.fontSize);
              } catch (error) {
                console.error('Error applying font size:', error);
              }
            }
            // Scope font color variables on editor root for immediate application
            if (editorSettings.fontColor && tab.editor.view && tab.editor.view.dom) {
              try {
                tab.editor.view.dom.style.setProperty('--editor-text-color', editorSettings.fontColor);
                tab.editor.view.dom.style.setProperty('--text-primary', editorSettings.fontColor);
              } catch (e) {
                console.warn('Failed to scope color vars on editor root:', e);
              }
            }
            
            // Apply line numbers
            if (editorSettings.lineNumbers !== undefined && tab.editor.setLineNumbers) {
              tab.editor.setLineNumbers(editorSettings.lineNumbers);
            }
            
            // Apply line wrapping
            if (editorSettings.lineWrapping !== undefined && tab.editor.setLineWrapping) {
              tab.editor.setLineWrapping(editorSettings.lineWrapping);
            }

            // Apply WYSIWYG mode
            if (editorSettings.wysiwygMode !== undefined && tab.editor.setWysiwygMode) {
              tab.editor.setWysiwygMode(editorSettings.wysiwygMode);
            }

            // Always refresh theme to ensure font color is applied
            // This ensures the editor picks up the CSS variables that were just set
            // Use a small delay to ensure CSS variables have propagated
            if (tab.editor.refreshTheme) {
              setTimeout(() => {
                console.log('Refreshing theme to apply font color');
                tab.editor.refreshTheme();
              }, 50);
            }
            
          }
        }
      }
    }
  }
  
  // Apply status bar visibility
  if (editorSettings.showStatusBar !== undefined) {
    const statusBar = document.getElementById('status-bar');
    if (statusBar) {
      statusBar.style.display = editorSettings.showStatusBar ? 'flex' : 'none';
      statusBarVisible = editorSettings.showStatusBar;
    }
  }
  
  // Save preferences
  if (currentThemeManager) {
    currentThemeManager.saveEditorPreference('font_size', editorSettings.fontSize?.toString() || '16');
    currentThemeManager.saveEditorPreference('font_family', editorSettings.fontFamily || 'Inter');
    currentThemeManager.saveEditorPreference('theme', editorSettings.theme || 'default');
  }
}

// Line numbers toggle function
window.toggleLineNumbers = function() {
  if (currentEditor && currentEditor.toggleLineNumbers) {
    const isEnabled = currentEditor.toggleLineNumbers();
    
    // Update menu text
    const menuText = document.getElementById('line-numbers-text');
    if (menuText) {
      menuText.textContent = isEnabled ? 'Hide lines' : 'Show lines';
    }
    
    // Hide dropdown after selection
    const dropdown = document.getElementById('editor-dropdown');
    if (dropdown) {
      dropdown.classList.add('hidden');
    }
    
    console.log('Line numbers toggled:', isEnabled ? 'on' : 'off');
  }
}

// Global test function for debugging message serialization
window.testMessageSerialization = async function() {
  console.log('🧪 Testing message serialization...');
  
  try {
    // Test 1: Simple array of messages
    const testMessages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' }
    ];
    
    console.log('📤 Sending test messages:', testMessages);
    console.log('📊 Messages JSON:', JSON.stringify(testMessages));
    
    const result = await invoke('test_messages', {
      messages: testMessages
    });
    
    console.log('✅ Test result:', result);
    return result;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return error;
  }
}

// Debug test for send_ai_chat
window.debugSendAIChat = async function() {
  console.log('🐛 Testing debug_send_ai_chat...');
  
  try {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Test message' }
    ];
    
    console.log('📤 Sending to debug command:', messages);
    
    const result = await invoke('debug_send_ai_chat', {
      messages: messages
    });
    
    console.log('✅ Debug result:', result);
    return result;
  } catch (error) {
    console.error('❌ Debug failed:', error);
    return error;
  }
}

// Another test function that uses the actual send_ai_chat command
window.testAIChat = async function() {
  console.log('🤖 Testing AI chat command...');
  
  try {
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful AI assistant.'
      },
      {
        role: 'user',
        content: 'Hello, this is a test message.'
      }
    ];
    
    console.log('📤 Sending messages to AI:', messages);
    console.log('📊 Stringified:', JSON.stringify(messages));
    
    const response = await invoke('send_ai_chat', {
      messages: messages
    });
    
    console.log('✅ AI response:', response);
    return response;
  } catch (error) {
    console.error('❌ AI chat test failed:', error);
    throw error;
  }
}

// Test with different serialization approaches
window.testAIChatAlternative = async function() {
  console.log('🧪 Testing alternative serialization...');
  
  try {
    // Try 1: Direct array construction
    const messages = [];
    messages.push({
      role: 'system',
      content: 'You are a helpful AI assistant.'
    });
    messages.push({
      role: 'user', 
      content: 'Hello, this is a test message.'
    });
    
    console.log('📤 Method 1 - Direct array:', messages);
    
    // Try 2: JSON parse/stringify roundtrip
    const messagesJson = JSON.stringify(messages);
    const messagesParsed = JSON.parse(messagesJson);
    
    console.log('📤 Method 2 - JSON roundtrip:', messagesParsed);
    
    // Try 3: Spread operator
    const messagesSpread = [...messages];
    
    console.log('📤 Method 3 - Spread:', messagesSpread);
    
    // Test each method
    console.log('Testing method 1...');
    try {
      const r1 = await invoke('send_ai_chat', { messages: messages });
      console.log('✅ Method 1 worked:', r1);
    } catch (e) {
      console.error('❌ Method 1 failed:', e);
    }
    
    console.log('Testing method 2...');
    try {
      const r2 = await invoke('send_ai_chat', { messages: messagesParsed });
      console.log('✅ Method 2 worked:', r2);
    } catch (e) {
      console.error('❌ Method 2 failed:', e);
    }
    
    console.log('Testing method 3...');
    try {
      const r3 = await invoke('send_ai_chat', { messages: messagesSpread });
      console.log('✅ Method 3 worked:', r3);
    } catch (e) {
      console.error('❌ Method 3 failed:', e);
    }
    
  } catch (error) {
    console.error('❌ Alternative test failed:', error);
    throw error;
  }
}

// Initialize chat resize functionality
function initializeChatResize() {
  const resizeHandle = document.getElementById('chat-resize-handle');
  const rightSidebar = document.getElementById('right-sidebar');
  
  if (!resizeHandle || !rightSidebar) {
    console.log('❌ Chat resize elements not found');
    return;
  }
  
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;
  
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = rightSidebar.offsetWidth;
    resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.classList.add('resizing-chat');
    
    // Prevent text selection while dragging
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    // Calculate new width (dragging left makes it wider)
    const deltaX = startX - e.clientX;
    const newWidth = Math.min(Math.max(startWidth + deltaX, 250), 600);
    
    // Apply the new width
    rightSidebar.style.width = newWidth + 'px';
    
    // Store the width preference
    if (rightSidebar.classList.contains('visible')) {
      localStorage.setItem('chatPanelWidth', newWidth);
    }
  });
  
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.classList.remove('resizing-chat');
    }
  });
  
  // Restore saved width if available
  const savedWidth = localStorage.getItem('chatPanelWidth');
  if (savedWidth && rightSidebar.classList.contains('visible')) {
    rightSidebar.style.width = savedWidth + 'px';
  }
}

// Initialize window-specific components after vault is opened
async function initializeWindowComponents() {
  console.log('🔧 Initializing window-specific components...');
  
  // Register components with window context
  if (paneManager) {
    // Create a wrapper with cleanup that resets global variables
    const paneManagerWrapper = {
      ...paneManager,
      cleanup: async function() {
        if (paneManager.cleanup) {
          await paneManager.cleanup();
        }
        paneManager = null;
        window.paneManager = null;
        window.tabManager = null;
      }
    };
    windowContext.registerComponent('paneManager', paneManagerWrapper);
  }
  
  if (window.tabManager) {
    windowContext.registerComponent('tabManager', window.tabManager);
  }
  
  // Re-initialize components that need vault context
  if (windowContext.hasVault) {
    // Get vault info
    const vaultInfo = await windowContext.getVaultInfo();
    
    // Show vault actions (sidebar ribbon)
    const vaultActions = document.getElementById('vault-actions');
    if (vaultActions) {
      vaultActions.style.display = 'flex';
    }
    
    // Refresh file tree
    await refreshFileTree();
    
    // Start file system watcher for this vault
    try {
      console.log('👁️ Starting file system watcher...');
      await invoke('start_file_watcher', { vaultPath: vaultInfo.path });
      console.log('✅ File system watcher started');
    } catch (error) {
      console.error('❌ Failed to start file watcher:', error);
    }
    
    // Initialize editor if needed (or reinitialize after cleanup)
    const editorWrapper = document.getElementById('editor-wrapper');
    if (editorWrapper) {
      console.log('🔄 Checking editor state:', { 
        paneManager: !!paneManager, 
        tabManager: !!window.tabManager,
        paneManagerContainer: paneManager?.container 
      });
      
      // Check if paneManager needs to be initialized/reinitialized
      // Also check if the paneManager has been cleaned up (no container)
      const needsInit = !paneManager || !window.tabManager || !paneManager.container || paneManager.panes.size === 0;
      
      if (needsInit) {
        console.log('🔄 Re-initializing editor after vault switch...');
        // Clean up globalSearch to ensure it re-mounts properly
        globalSearch.cleanup();
        // Reset the variables to ensure clean state
        paneManager = null;
        window.paneManager = null;
        window.tabManager = null;
        await initializeEditor();
      } else {
        // Ensure tabManager is available globally
        const tabManager = paneManager.getActiveTabManager();
        if (tabManager) {
          window.tabManager = tabManager;
        }
      }
    }
  }
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🎯 DOM loaded - Starting initialization...');

  // Wait for a frame to ensure WebView is attached to display
  // This prevents the "page has no displayID" WebKit error on macOS
  await new Promise(resolve => requestAnimationFrame(() => {
    // Double RAF ensures we're past the first paint
    requestAnimationFrame(resolve);
  }));

  console.log('🖼️ First paint complete, proceeding with initialization...');

  // Start performance monitoring
  perfMonitor.startMeasure('app_initialization');

  // Initialize premium features
  console.log('💎 Initializing premium features...');
  try {
    entitlementManager = new EntitlementManager();
    await entitlementManager.initialize();
    console.log('✅ EntitlementManager initialized');

    pacasdbClient = new PACASDBClient(entitlementManager);
    console.log('✅ PACASDBClient initialized');

    // Auto-connect to PACASDB if premium is enabled
    if (entitlementManager.isPremiumEnabled()) {
      const connected = await pacasdbClient.connect();
      if (connected) {
        console.log('✅ PACASDBClient connected to server');
      } else {
        console.log('⚠️ PACASDBClient could not connect (server may not be running)');
      }
    }

    globalSearchPanel = new GlobalSearchPanel(entitlementManager, pacasdbClient);
    console.log('✅ GlobalSearchPanel initialized');

    vaultSync = new VaultSync(pacasdbClient);
    vaultSync.start();
    console.log('✅ VaultSync initialized and started');

    // Set window globals for GlobalSearch integration
    window.entitlementManager = entitlementManager;
    window.pacasdbClient = pacasdbClient;
    window.vaultSync = vaultSync;
  } catch (error) {
    console.error('❌ Failed to initialize premium features:', error);
  }

  // Initialize window context first
  try {
    console.log('🪟 Initializing WindowContext...');
    await windowContext.initialize();
    
    // Listen for vault opened event
    windowContext.on('vault-opened', async (vaultInfo) => {
      console.log('📁 Vault opened in window:', vaultInfo);
      
      // Update UI with vault info
      const vaultNameElement = document.querySelector('.vault-name');
      if (vaultNameElement) {
        vaultNameElement.textContent = vaultInfo.name;
      }
      
      // Initialize window-specific components
      await initializeWindowComponents();

      // Load vault settings and apply to UI (font size, theme, etc.)
      await updateUIWithVault(vaultInfo);

      // Force refresh of vault picker
      if (window.vaultPicker) {
        window.vaultPicker.currentVault = vaultInfo;
        window.vaultPicker.render();
      }
      
      // Refresh GraphSync status to pick up new vault context
      if (window.graphSyncStatus) {
        console.log('🔄 Refreshing GraphSync status for new vault');
        await window.graphSyncStatus.fetchStatus();
      }
    });
    
    // Now check for initial vault (from URL params or saved state)
    await windowContext.checkInitialVault();
  } catch (error) {
    console.error('❌ Failed to initialize WindowContext:', error);
  }
  
  await initializeApp();

  // Sync chat button active state after all initialization is complete
  // This ensures buttons created by PaneManager also get the correct state
  if (window.chatPanel && window.chatPanel.isVisible) {
    const chatToggleBtns = document.querySelectorAll('.chat-toggle-btn');
    chatToggleBtns.forEach(btn => btn.classList.add('active'));
    console.log('✅ Synced chat button active state for', chatToggleBtns.length, 'buttons');
  }

  // Initialize VaultPicker
  const vaultPickerContainer = document.getElementById('vault-picker-container');
  if (vaultPickerContainer) {
    console.log('🗂️ Initializing VaultPicker...');
    window.vaultPicker = new VaultPicker(vaultPickerContainer);
  }
  
  initializeChatResize();
  
  // Set up graph sync event listeners
  setupGraphSyncListeners();
  
  // Graph sync is now in Editor Settings
  
  // End performance monitoring
  perfMonitor.endMeasure('app_initialization');
  
  // Add performance debugging functions to global scope
  window.perfReport = () => perfMonitor.generateReport();
  window.perfExport = () => perfMonitor.exportMetrics();
  window.perfTest = () => perfTestSuite.runAllTests();
  window.perfToggle = (enabled) => perfMonitor.toggle(enabled);
  
  console.log('📊 Performance monitoring initialized');
  console.log('🧪 Available performance commands: perfReport(), perfExport(), perfTest(), perfToggle()');
  
  // Log initial metrics
  setTimeout(() => {
    const metrics = perfMonitor.getCurrentMetrics();
    console.log('📊 Initial performance metrics:', metrics);
  }, 1000);
  
  // MCP status bar removed for cleaner UI
  
  // Add global click handler to close dropdowns
  document.addEventListener('click', (e) => {
    // Close dropdowns if clicking outside
    const vaultDropdown = document.getElementById('vault-dropdown');
    const sortDropdown = document.getElementById('sort-dropdown');
    const vaultMenu = document.getElementById('vault-menu');
    const sortMenu = document.getElementById('sort-menu');
    
    // Check if click is on menu button or its children
    const clickedVaultMenu = vaultMenu && (vaultMenu.contains(e.target) || e.target === vaultMenu);
    const clickedSortMenu = sortMenu && (sortMenu.contains(e.target) || e.target === sortMenu);
    
    if (vaultDropdown && !vaultDropdown.contains(e.target) && !clickedVaultMenu) {
      vaultDropdown.classList.add('hidden');
    }
    
    if (sortDropdown && !sortDropdown.contains(e.target) && !clickedSortMenu) {
      sortDropdown.classList.add('hidden');
    }
  });
});

// MCP Test Functions
import { mcpManager } from './mcp/MCPManager.js';

// Test MCP Tools Integration
window.testMCPToolsIntegration = async function() {
  console.log('🧪 Testing MCP Tools Integration...');
  
  try {
    const { mcpManager } = await import('./mcp/MCPManager.js');
    const { mcpToolHandler } = await import('./mcp/MCPToolHandler.js');
    
    // 1. Check available tools
    console.log('📋 Getting available tools...');
    const tools = await mcpToolHandler.getAvailableTools();
    console.log(`Found ${tools.length} tools:`, tools);
    
    // 2. Get system prompt additions
    console.log('📝 Getting system prompt additions...');
    const promptAdditions = await mcpToolHandler.getSystemPromptAdditions();
    console.log('System prompt additions:', promptAdditions);
    
    // MCP indicator removed for cleaner UI
    
    // 4. Test a tool execution if tools are available
    if (tools.length > 0) {
      const firstTool = tools[0];
      console.log(`🔨 Testing tool execution: ${firstTool.name}`);
      
      // Example: test echo tool if available
      if (firstTool.name === 'echo') {
        const result = await mcpToolHandler.executeTool(
          `${firstTool.serverId}_${firstTool.name}`,
          { message: 'Hello from MCP test!' }
        );
        console.log('Tool execution result:', result);
      }
    }
    
    console.log('✅ MCP Tools Integration test complete!');
    
  } catch (error) {
    console.error('❌ MCP Tools Integration test failed:', error);
  }
};

window.testMCPConnection = async function() {
  console.log('🧪 Testing MCP Connection...');
  
  try {
    // Initialize MCP manager if not already done
    await mcpManager.initialize();
    
    // Test server configuration
    const testConfig = {
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
    
    // Connect to test server
    console.log('📡 Connecting to test server...');
    await mcpManager.connectServer('test-server', testConfig);
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check status
    await mcpManager.refreshStatuses();
    const status = mcpManager.status.get('test-server');
    console.log('📊 Server status:', status);
    
    // Get server info
    const info = await mcpManager.getServerInfo('test-server');
    console.log('ℹ️ Server info:', info);
    
    // List tools
    console.log('🔧 Listing available tools...');
    const tools = await mcpManager.listTools('test-server');
    console.log('📋 Available tools:', tools);
    
    // Test echo tool
    console.log('🔊 Testing echo tool...');
    const echoResult = await mcpManager.invokeTool('test-server', 'test_echo', {
      message: 'Hello from Gaimplan MCP test!'
    });
    console.log('✅ Echo result:', echoResult);
    
    // Test add tool
    console.log('➕ Testing add tool...');
    const addResult = await mcpManager.invokeTool('test-server', 'test_add', {
      a: 5,
      b: 3
    });
    console.log('✅ Add result:', addResult);
    
    // List resources
    console.log('📚 Listing available resources...');
    const resources = await mcpManager.listResources('test-server');
    console.log('📋 Available resources:', resources);
    
    // Read resource
    console.log('📖 Reading test://status resource...');
    const resourceContent = await mcpManager.readResource('test-server', 'test://status');
    console.log('✅ Resource content:', resourceContent);
    
    console.log('🎉 All MCP tests passed!');
    
    // Disconnect
    console.log('🔌 Disconnecting...');
    await mcpManager.disconnectServer('test-server');
    
  } catch (error) {
    console.error('❌ MCP test failed:', error);
  }
};

window.mcpManager = mcpManager;
console.log('🔧 MCP test functions available:');
console.log('  - window.testMCPConnection() - Run full MCP test suite');
console.log('  - window.mcpManager - Access MCP manager directly');

// Plugin Hub global
window.pluginHub = pluginHub;
console.log('🔌 Plugin Hub initialized and available at window.pluginHub');

// MCP Settings shortcut function
window.showMCPSettings = function() {
  console.log('🔧 showMCPSettings called');
  console.log('mcpSettings exists?', !!window.mcpSettings);
  
  if (window.mcpSettings) {
    console.log('Calling mcpSettings.show()');
    window.mcpSettings.show();
  } else {
    console.error('MCP Settings not initialized');
    console.log('Available globals:', Object.keys(window).filter(k => k.includes('mcp')));
  }
};

// Add keyboard shortcut for MCP settings (Cmd+Shift+M)
// Moved to setupKeyboardShortcuts function to ensure proper initialization

// ======== Calendar Widget Helper Functions ========

// Open a file in the active tab
window.openFile = async function(filePath) {
  console.log('📂 Opening file:', filePath);
  
  if (!paneManager || !paneManager.activePaneId) {
    console.error('No active pane available');
    return;
  }
  
  const activePane = paneManager.panes.get(paneManager.activePaneId);
  if (!activePane) return;
  
  const tabManager = activePane.tabManager;
  const activeTab = tabManager.getActiveTab();
  
  if (activeTab) {
    // Navigate in existing tab
    await tabManager.navigateToFile(activeTab.id, filePath);
  } else {
    // Create new tab
    try {
      const content = await invoke('read_file_content', { filePath });
      const tabId = tabManager.createTab(filePath, content);
      tabManager.activateTab(tabId);
    } catch (error) {
      console.error('Error opening file:', error);
      showError(`Failed to open ${filePath}: ${error}`);
    }
  }
};

// Create and open a new file
window.createAndOpenFile = async function(filePath, content = '') {
  console.log('📝 Creating new file:', filePath);
  
  try {
    // Write the file (backend automatically creates directories)
    await invoke('write_file_content', { filePath, content });
    
    // Open it
    await window.openFile(filePath);
    
    // Refresh file tree
    if (window.refreshFileTree) {
      window.refreshFileTree();
    }
  } catch (error) {
    console.error('Error creating file:', error);
    showError(`Failed to create ${filePath}: ${error}`);
  }
};

// Also try immediate execution in case DOMContentLoaded already fired
if (document.readyState === 'loading') {
  console.log('⏳ DOM still loading, waiting for DOMContentLoaded...');
} else {
  console.log('⚡ DOM already ready, executing immediately...');
  initializeApp();
}

// Reveal in Finder function
window.revealInFinder = async function() {
  if (!contextMenuTarget) return;
  
  const targetPath = contextMenuTarget;
  
  try {
    await invoke('reveal_in_finder', { path: targetPath });
    console.log('File revealed in Finder:', targetPath);
  } catch (error) {
    console.error('Failed to reveal file in Finder:', error);
  }
  
  window.hideContextMenu();
  contextMenuTarget = null; // Clear after use
};
