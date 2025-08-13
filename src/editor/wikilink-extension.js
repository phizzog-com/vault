import { Decoration, ViewPlugin, EditorView, MatchDecorator } from '@codemirror/view'
import { wikiLinkCache } from './wikilink-cache.js'

// WikiLink pattern: [[Page Name]] - but NOT ![[...]] (which are images)
// Use negative lookbehind to prevent matching image syntax (![[...]]) and triple brackets
const wikiLinkPattern = /(?<!\[)(?<!!)\[\[([^\]]+)\]\](?!\])/g

// Utility function to extract WikiLinks from text
export function extractWikiLinks(text) {
  const links = []
  let match
  const pattern = new RegExp(wikiLinkPattern.source, 'g')
  
  while ((match = pattern.exec(text)) !== null) {
    links.push({
      text: match[1],
      start: match.index,
      end: match.index + match[0].length,
      fullMatch: match[0]
    })
  }
  
  return links
}

// Utility function to normalize WikiLink names for resolution
export function normalizeWikiLinkName(name) {
  return name.trim()
    .replace(/\s+/g, ' ') // Normalize multiple spaces
    .toLowerCase() // Case insensitive matching
}

// Cache for async note existence checks to avoid repeated API calls
const noteExistenceCache = new Map();

// Make it globally accessible for cleanup
window.noteExistenceCache = noteExistenceCache;

// Check if a note exists using the caching system
async function checkNoteExists(noteName) {
  try {
    const result = await wikiLinkCache.checkNoteExists(noteName);
    return result.exists;
  } catch (error) {
    console.error('Error checking note existence:', error);
    return false;
  }
}

// Create decoration for WikiLink with async existence checking
function createWikiLinkDecoration(match, view, pos) {
  const noteName = match[1]
  
  // Check if we have cached existence info
  let exists = false;
  let cssClass = 'cm-wikilink-checking'; // Default state while checking
  
  const cacheKey = wikiLinkCache.normalizeWikiLinkName(noteName);
  
  // Try to get cached result synchronously
  const cachedEntry = noteExistenceCache.get(cacheKey);
  if (cachedEntry && (Date.now() - cachedEntry.timestamp) < 30000) { // 30 second cache
    exists = cachedEntry.exists;
    cssClass = exists ? 'cm-wikilink-exists' : 'cm-wikilink-missing';
  } else {
    // Asynchronously check and update decoration
    checkNoteExistsAsync(noteName, view);
    
    // Use the cached value if available, otherwise assume missing
    if (cachedEntry) {
      exists = cachedEntry.exists;
      cssClass = exists ? 'cm-wikilink-exists' : 'cm-wikilink-missing';
    } else {
      cssClass = 'cm-wikilink-missing'; // Default to missing for new WikiLinks
    }
  }
  
  const decoration = Decoration.mark({
    class: cssClass,
    attributes: {
      'data-wikilink': noteName,
      'data-exists': exists.toString(),
      'data-cache-key': cacheKey,
      title: exists 
        ? `Navigate to "${noteName}"\nClick to open` 
        : cssClass === 'cm-wikilink-checking'
          ? `Checking "${noteName}"...`
          : `"${noteName}" doesn't exist\nClick to create`
    }
  })
  
  return decoration.range(pos, pos + match[0].length)
}

// Async function to check note existence and update view
async function checkNoteExistsAsync(noteName, view) {
  try {
    const result = await wikiLinkCache.checkNoteExists(noteName);
    const cacheKey = wikiLinkCache.normalizeWikiLinkName(noteName);
    
    // Update local cache
    noteExistenceCache.set(cacheKey, {
      exists: result.exists,
      path: result.path,
      timestamp: Date.now()
    });
    
    // Trigger view update to refresh decorations
    // We'll use a small delay to batch updates
    setTimeout(() => {
      if (view && !view.isDestroyed) {
        view.dispatch({
          effects: [], // Empty transaction to trigger decoration update
        });
      }
    }, 10);
    
  } catch (error) {
    console.error('Error in async note existence check:', error);
  }
}

// MatchDecorator for WikiLinks
const wikiLinkMatcher = new MatchDecorator({
  regexp: wikiLinkPattern,
  decoration: (match, view, pos) => {
    console.log('Creating decoration for WikiLink:', match[0])
    return createWikiLinkDecoration(match, view, pos)
  }
})

// Create decorations for WikiLinks using the MatchDecorator approach
function createWikiLinkDecorations(view) {
  const decorations = []
  
  // Use MatchDecorator to efficiently find and decorate WikiLinks
  for (const { from, to } of view.visibleRanges) {
    const result = wikiLinkMatcher.createDeco(view, decorations, from, to)
    console.log(`After createDeco, decorations length: ${decorations.length}`)
  }
  
  console.log(`Created ${decorations.length} WikiLink decorations`)
  
  // If MatchDecorator isn't working, let's do it manually as a fallback
  if (decorations.length === 0) {
    console.log('Using manual decoration approach')
    const text = view.state.doc.toString()
    const regex = new RegExp(wikiLinkPattern.source, 'g')
    let match
    while ((match = regex.exec(text)) !== null) {
      const from = match.index
      const decoration = createWikiLinkDecoration(match, view, from)
      if (decoration) {
        decorations.push(decoration)
      }
    }
    console.log(`Manual approach created ${decorations.length} decorations`)
  }
  
  return Decoration.set(decorations, true)
}

// WikiLink ViewPlugin
export const wikiLinkPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = createWikiLinkDecorations(view)
      this.setupClickHandler(view)
    }

    update(update) {
      // Update decorations when document changes, selection changes, or viewport changes
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        console.log('WikiLink extension updating decorations', {
          docChanged: update.docChanged,
          selectionSet: update.selectionSet,
          viewportChanged: update.viewportChanged
        })
        this.decorations = createWikiLinkDecorations(update.view)
        
        // Re-setup click handlers after decoration update
        setTimeout(() => this.setupClickHandler(update.view), 50)
      }
    }
    
    setupClickHandler(view) {
      // Remove existing handler to avoid duplicates
      if (this.clickHandler) {
        view.dom.removeEventListener('mousedown', this.clickHandler, true)
      }
      
      // Add mousedown handler for WikiLink clicks
      this.clickHandler = (e) => {
        // Handle left click (button 0)
        if (e.button === 0) {
          const wikiLinkElements = view.dom.querySelectorAll('.cm-wikilink-exists, .cm-wikilink-missing')
          
          for (const linkEl of wikiLinkElements) {
            if (linkEl.contains(e.target) || linkEl === e.target) {
              const noteName = linkEl.getAttribute('data-wikilink')
              const exists = linkEl.getAttribute('data-exists') === 'true'
              
              console.log('WikiLink clicked:', noteName, 'exists:', exists)
              
              if (noteName) {
                e.preventDefault()
                e.stopPropagation()
                
                // Small delay to ensure event doesn't interfere with editor
                setTimeout(() => {
                  this.handleWikiLinkClick(noteName, exists)
                }, 10)
                
                return false
              }
            }
          }
        }
      }
      
      view.dom.addEventListener('mousedown', this.clickHandler, true)
    }
    
    async handleWikiLinkClick(noteName, exists) {
      try {
        // Get the latest information from cache
        const result = await wikiLinkCache.checkNoteExists(noteName);
        
        if (result.exists && result.path) {
          console.log(`Opening existing note: ${noteName} at path: ${result.path}`);
          await this.openExistingNote(result.path, noteName);
        } else {
          console.log(`Note "${noteName}" doesn't exist - showing creation dialog`);
          await this.handleNoteCreation(noteName);
        }
      } catch (error) {
        console.error('Error handling WikiLink click:', error);
        // Show user-friendly error message
        this.showErrorMessage(`Failed to navigate to "${noteName}": ${error.message}`);
      }
    }
    
    async openExistingNote(filePath, noteName) {
      try {
        // Get TabManager from global window or windowContext
        const tabManager = window.tabManager || window.windowContext?.getComponent('tabManager');
        
        if (!tabManager) {
          throw new Error('TabManager not available');
        }
        
        console.log(`📂 Opening existing note: ${filePath}`);
        
        // Check if tab already exists for this file
        const existingTab = tabManager.findTabByPath(filePath);
        
        if (existingTab) {
          // Tab already exists, just activate it
          console.log(`🔍 Found existing tab for ${filePath}, activating`);
          tabManager.activateTab(existingTab.id);
        } else {
          // Load file content and create new tab
          console.log(`📖 Loading content for ${filePath}`);
          const { invoke } = await import('@tauri-apps/api/core');
          const content = await invoke('read_file_content', { filePath: filePath });
          
          // Create and activate new tab
          console.log(`📝 Creating new tab for ${filePath}`);
          const tabId = await tabManager.openFile(filePath, content);
          console.log(`✅ Successfully opened ${noteName} in tab ${tabId}`);
        }
      } catch (error) {
        console.error('Error opening existing note:', error);
        throw error;
      }
    }
    
    async handleNoteCreation(noteName) {
      try {
        // Show confirmation dialog
        const shouldCreate = await this.showNoteCreationDialog(noteName);
        
        if (!shouldCreate) {
          console.log(`User cancelled creation of note: ${noteName}`);
          return;
        }
        
        console.log(`🆕 Creating new note: ${noteName}`);
        
        // Create the note using Tauri command
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke('create_note_from_wikilink', { noteName: noteName });
        
        // Open the newly created note
        await this.openExistingNote(result.path, noteName);
        
        console.log(`✅ Successfully created and opened ${noteName}`);
        
        // Invalidate cache to update WikiLink styling
        wikiLinkCache.invalidateAll();
        
        // Also invalidate autocompletion cache
        import('./wikilink-autocompletion.js').then(module => {
          module.invalidateNotesCache();
        }).catch(console.error);
        
      } catch (error) {
        console.error('Error creating note:', error);
        throw error;
      }
    }
    
    async showNoteCreationDialog(noteName) {
      return new Promise((resolve) => {
        // Create modern confirmation dialog
        const dialog = document.createElement('div');
        dialog.className = 'wikilink-creation-dialog-overlay';
        dialog.innerHTML = `
          <div class="wikilink-creation-dialog">
            <div class="dialog-header">
              <h3>Create New Note</h3>
            </div>
            <div class="dialog-content">
              <p>The note "<strong>${this.escapeHtml(noteName)}</strong>" doesn't exist yet.</p>
              <p>Would you like to create it?</p>
            </div>
            <div class="dialog-actions">
              <button class="dialog-cancel-btn" type="button">Cancel</button>
              <button class="dialog-create-btn" type="button">Create Note</button>
            </div>
          </div>
        `;
        
        // Add styles for the dialog
        if (!document.querySelector('#wikilink-dialog-styles')) {
          const styles = document.createElement('style');
          styles.id = 'wikilink-dialog-styles';
          styles.textContent = `
            .wikilink-creation-dialog-overlay {
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
              backdrop-filter: blur(2px);
            }
            
            .wikilink-creation-dialog {
              background: var(--background-color, #ffffff);
              border: 1px solid var(--border-color, #e0e0e0);
              border-radius: 8px;
              box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
              width: 400px;
              max-width: 90vw;
              color: var(--text-color, #333333);
            }
            
            .dialog-header {
              padding: 20px 24px 16px;
              border-bottom: 1px solid var(--border-color, #e0e0e0);
            }
            
            .dialog-header h3 {
              margin: 0;
              font-size: 18px;
              font-weight: 600;
              color: var(--text-color, #333333);
            }
            
            .dialog-content {
              padding: 20px 24px;
            }
            
            .dialog-content p {
              margin: 0 0 12px 0;
              line-height: 1.5;
            }
            
            .dialog-content p:last-child {
              margin-bottom: 0;
            }
            
            .dialog-actions {
              padding: 16px 24px 20px;
              display: flex;
              gap: 12px;
              justify-content: flex-end;
            }
            
            .dialog-cancel-btn, .dialog-create-btn {
              padding: 8px 16px;
              border-radius: 6px;
              border: 1px solid;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
              transition: all 0.2s;
            }
            
            .dialog-cancel-btn {
              background: transparent;
              border-color: var(--border-color, #d0d0d0);
              color: var(--text-color, #666666);
            }
            
            .dialog-cancel-btn:hover {
              background: var(--hover-color, #f5f5f5);
            }
            
            .dialog-create-btn {
              background: var(--primary-color, #2e6da4);
              border-color: var(--primary-color, #2e6da4);
              color: white;
            }
            
            .dialog-create-btn:hover {
              background: var(--primary-hover-color, #1a4d7a);
              border-color: var(--primary-hover-color, #1a4d7a);
            }
          `;
          document.head.appendChild(styles);
        }
        
        // Event handlers
        const handleCancel = () => {
          document.body.removeChild(dialog);
          resolve(false);
        };
        
        const handleCreate = () => {
          document.body.removeChild(dialog);
          resolve(true);
        };
        
        const handleKeyDown = (e) => {
          if (e.key === 'Escape') {
            handleCancel();
          } else if (e.key === 'Enter') {
            handleCreate();
          }
        };
        
        // Attach event listeners
        dialog.querySelector('.dialog-cancel-btn').addEventListener('click', handleCancel);
        dialog.querySelector('.dialog-create-btn').addEventListener('click', handleCreate);
        dialog.addEventListener('keydown', handleKeyDown);
        
        // Close on overlay click
        dialog.addEventListener('click', (e) => {
          if (e.target === dialog) {
            handleCancel();
          }
        });
        
        // Show dialog
        document.body.appendChild(dialog);
        
        // Focus the create button
        setTimeout(() => {
          dialog.querySelector('.dialog-create-btn').focus();
        }, 100);
      });
    }
    
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    showErrorMessage(message) {
      // Create a simple error toast
      const toast = document.createElement('div');
      toast.className = 'wikilink-error-toast';
      toast.textContent = message;
      
      // Add toast styles if not already present
      if (!document.querySelector('#wikilink-toast-styles')) {
        const styles = document.createElement('style');
        styles.id = 'wikilink-toast-styles';
        styles.textContent = `
          .wikilink-error-toast {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #dc3545;
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            z-index: 10001;
            max-width: 400px;
            font-size: 14px;
            animation: slideInRight 0.3s ease-out;
          }
          
          @keyframes slideInRight {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `;
        document.head.appendChild(styles);
      }
      
      document.body.appendChild(toast);
      
      // Remove toast after 5 seconds
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 5000);
    }
    
    destroy() {
      if (this.clickHandler && this.view) {
        this.view.dom.removeEventListener('mousedown', this.clickHandler, true)
      }
    }
  },
  {
    decorations: v => v.decorations
  }
)

// Styles for WikiLinks
export const wikiLinkStyles = EditorView.theme({
  '.cm-wikilink-exists': {
    color: '#2e6da4',
    textDecoration: 'none',
    cursor: 'pointer',
    borderBottom: '1px solid #2e6da4',
    transition: 'all 0.2s',
    position: 'relative',
    zIndex: 1,
    backgroundColor: 'rgba(46, 109, 164, 0.1)',
    borderRadius: '2px',
    padding: '1px 2px'
  },
  
  '.cm-wikilink-exists:hover': {
    color: '#1a4d7a',
    borderBottomColor: '#1a4d7a',
    backgroundColor: 'rgba(46, 109, 164, 0.2)'
  },
  
  '.cm-wikilink-missing': {
    color: '#dc3545',
    textDecoration: 'none',
    cursor: 'pointer',
    borderBottom: '1px dashed #dc3545',
    transition: 'all 0.2s',
    position: 'relative',
    zIndex: 1,
    backgroundColor: 'rgba(220, 53, 69, 0.1)',
    borderRadius: '2px',
    padding: '1px 2px'
  },
  
  '.cm-wikilink-missing:hover': {
    color: '#a02834',
    borderBottomColor: '#a02834',
    backgroundColor: 'rgba(220, 53, 69, 0.2)'
  },
  
  '.cm-wikilink-checking': {
    color: '#6c757d',
    textDecoration: 'none',
    cursor: 'pointer',
    borderBottom: '1px dotted #6c757d',
    transition: 'all 0.2s',
    position: 'relative',
    zIndex: 1,
    backgroundColor: 'rgba(108, 117, 125, 0.1)',
    borderRadius: '2px',
    padding: '1px 2px',
    opacity: 0.8
  },
  
  '.cm-wikilink-checking:hover': {
    color: '#495057',
    borderBottomColor: '#495057',
    backgroundColor: 'rgba(108, 117, 125, 0.2)',
    opacity: 1
  }
})