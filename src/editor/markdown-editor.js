import { EditorView, keymap, drawSelection, highlightActiveLine, 
         lineNumbers, highlightActiveLineGutter, rectangularSelection,
         crosshairCursor, dropCursor, ViewPlugin, Decoration } from '@codemirror/view'
import { EditorState, Compartment, RangeSet, Facet } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { autocompletion, completionKeymap, closeBrackets, 
         closeBracketsKeymap, startCompletion } from '@codemirror/autocomplete'
import { lintKeymap } from '@codemirror/lint'
import { syntaxHighlighting, defaultHighlightStyle, 
         bracketMatching, foldGutter, indentOnInput, foldEffect } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import { invoke } from '@tauri-apps/api/core'
import { search, searchKeymap, highlightSelectionMatches, openSearchPanel, closeSearchPanel } from '@codemirror/search'
import { livePreviewPlugin, livePreviewStyles } from './live-preview.js'
import { inlineFormattingExtension, inlineFormattingStyles, blockWidgetExtension } from './formatting-extension.js'
import { imageEmbedPlugin } from './image-extension.js'
import { linkPlugin, linkStyles } from './link-extension.js'
import { wikiLinkPlugin, wikiLinkStyles } from './wikilink-extension.js'
import { createWikiLinkCompletion } from './wikilink-autocompletion.js'
import { imagePasteExtension } from './image-paste-extension.js'
import { summarizeHighlightsCommand } from './highlights-extension.js'
import { bulletListExtension } from './bullet-list-extension.js'

// Compartments for dynamic configuration
const themeCompartment = new Compartment()
const lineWrappingCompartment = new Compartment()
const fontSizeCompartment = new Compartment()
const lineNumbersCompartment = new Compartment()
const frontmatterCompartment = new Compartment()

export class MarkdownEditor {
  constructor(container, initialContent = '') {
    this.container = container
    this.themeCompartment = themeCompartment
    this.lineWrappingCompartment = lineWrappingCompartment
    this.fontSizeCompartment = fontSizeCompartment
    this.lineNumbersCompartment = lineNumbersCompartment
    this.frontmatterCompartment = frontmatterCompartment
    this.editorId = `editor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Initialize with light theme by default
    this.currentTheme = 'default' // This is our light theme
    this.customThemes = new Map()
    this.hasUnsavedChanges = false
    this.currentFile = null
    this.showLineNumbers = false // Default to hiding line numbers
    this.lineWrapping = true // Default to enabling line wrapping
    
    this.setupEditor(initialContent)
    this.setupTauriListeners()
    
    // Track editor creation performance
    if (window.perfMonitor) {
      window.perfMonitor.trackEditorMetrics(this.editorId, 'creation', Date.now() - performance.now());
    }
    
    console.log(`📝 MarkdownEditor created with ID: ${this.editorId}`);
    
    // Apply any pending editor settings from vault
    if (window.pendingEditorSettings) {
      if (window.pendingEditorSettings.lineNumbers !== undefined) {
        this.setLineNumbers(window.pendingEditorSettings.lineNumbers)
      }
      if (window.pendingEditorSettings.lineWrapping !== undefined) {
        this.setLineWrapping(window.pendingEditorSettings.lineWrapping)
      }
      if (window.pendingEditorSettings.fontSize !== undefined) {
        // Apply font size after a short delay to ensure view is ready
        setTimeout(() => {
          this.view.dispatch({
            effects: this.fontSizeCompartment.reconfigure(
              this.createFontSizeTheme(window.pendingEditorSettings.fontSize)
            )
          })
        }, 100)
      }
    }
  }

  createFrontmatterPlugin() {
    // Create an Obsidian-style collapsible frontmatter plugin
    return ViewPlugin.fromClass(class {
      constructor(view) {
        this.collapsed = true // Default to collapsed like Obsidian
        this.decorations = this.buildDecorations(view)
      }
      
      buildDecorations(view) {
        const doc = view.state.doc
        const text = doc.toString()
        
        // Check if document starts with frontmatter
        if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
          return Decoration.none
        }
        
        // Find the end of frontmatter
        const lines = text.split('\n')
        let endLine = -1
        let frontmatterLines = []
        
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim() === '---') {
            endLine = i
            break
          }
          // Include all lines (even empty ones) until closing ---
          frontmatterLines.push(lines[i])
        }
        
        if (endLine === -1) {
          return Decoration.none
        }
        
        // Create the Properties header widget
        const self = this
        class PropertiesHeader {
          constructor() {
            this.collapsed = self.collapsed
          }
          
          toDOM() {
            const container = document.createElement('div')
            container.className = 'frontmatter-properties-container'
            container.style.cssText = `
              margin: 0 0 4px 0;
              background: #f8f9fa;
              border: 1px solid #e1e4e8;
              border-radius: 6px;
              padding: 8px;
            `
            
            // Properties header
            const header = document.createElement('div')
            header.className = 'frontmatter-properties-header'
            header.style.cssText = `
              display: flex;
              align-items: center;
              padding: 4px 0;
              cursor: pointer;
              user-select: none;
              font-weight: 400;
              font-size: 13px;
              color: #6b6b6b;
              background: transparent;
              border: none;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            `
            
            // Arrow icon
            const arrow = document.createElement('span')
            arrow.style.cssText = `
              margin-right: 6px;
              font-size: 10px;
              color: #6b6b6b;
              transition: transform 0.15s ease;
              transform: ${this.collapsed ? 'rotate(0deg)' : 'rotate(90deg)'};
              width: 12px;
              height: 12px;
              display: flex;
              align-items: center;
              justify-content: center;
            `
            arrow.textContent = '▶'
            
            // Properties text
            const label = document.createElement('span')
            label.textContent = 'Properties'
            
            // Add keyboard accessibility
            header.setAttribute('tabindex', '0')
            header.setAttribute('role', 'button')
            header.setAttribute('aria-expanded', this.collapsed ? 'false' : 'true')
            header.setAttribute('aria-label', `${this.collapsed ? 'Expand' : 'Collapse'} properties section`)
            
            // Keyboard navigation
            header.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                header.click()
              }
            })
            
            header.appendChild(arrow)
            header.appendChild(label)
            container.appendChild(header)
            
            // If expanded, show the frontmatter content
            if (!this.collapsed) {
              const content = document.createElement('div')
              content.className = 'frontmatter-properties-content'
              content.style.cssText = `
                padding: 8px 0 8px 18px;
                background: transparent;
                border: none;
                font-size: 13px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              `
              
              // Parse frontmatter properties into a map
              const properties = new Map()
              frontmatterLines.forEach(line => {
                if (line.trim()) {
                  const colonIndex = line.indexOf(':')
                  if (colonIndex > -1) {
                    const key = line.substring(0, colonIndex).trim()
                    let value = line.substring(colonIndex + 1).trim()
                    
                    // Remove quotes from value if present
                    if ((value.startsWith('"') && value.endsWith('"')) || 
                        (value.startsWith("'") && value.endsWith("'"))) {
                      value = value.slice(1, -1)
                    }
                    
                    properties.set(key, value)
                  }
                }
              })
              
              // Define the desired order: id first, then created_at, then updated_at, then others
              const orderedKeys = ['id', 'created_at', 'updated_at']
              const otherKeys = Array.from(properties.keys())
                .filter(key => !orderedKeys.includes(key))
                .sort()
              
              // Display properties in the desired order
              const allKeys = [...orderedKeys.filter(key => properties.has(key)), ...otherKeys]
              
              allKeys.forEach(key => {
                const value = properties.get(key)
                const propDiv = document.createElement('div')
                propDiv.style.cssText = `
                  padding: 1px 0;
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                  font-size: 13px;
                  color: #37352f;
                  display: flex;
                  align-items: center;
                  min-height: 20px;
                `
                
                const keySpan = document.createElement('span')
                keySpan.style.cssText = 'font-weight: 400; color: #6b6b6b; min-width: 80px; margin-right: 8px;'
                keySpan.textContent = key
                
                const valueSpan = document.createElement('span')
                valueSpan.style.cssText = 'color: #37352f; flex: 1;'
                valueSpan.textContent = value
                
                propDiv.appendChild(keySpan)
                propDiv.appendChild(valueSpan)
                content.appendChild(propDiv)
              })
              
              container.appendChild(content)
            }
            
            // Hover effects
            header.addEventListener('mouseenter', () => {
              header.style.color = '#37352f'
              arrow.style.color = '#37352f'
            })
            
            header.addEventListener('mouseleave', () => {
              header.style.color = '#6b6b6b'
              arrow.style.color = '#6b6b6b'
            })
            
            // Click handler to toggle collapse
            header.addEventListener('click', (e) => {
              e.preventDefault()
              e.stopPropagation()
              self.collapsed = !self.collapsed
              
              // Update arrow rotation immediately for smooth animation
              arrow.style.transform = self.collapsed ? 'rotate(0deg)' : 'rotate(90deg)'
              
              // Update accessibility attributes
              header.setAttribute('aria-expanded', self.collapsed ? 'false' : 'true')
              header.setAttribute('aria-label', `${self.collapsed ? 'Expand' : 'Collapse'} properties section`)
              
              self.decorations = self.buildDecorations(view)
              view.dispatch({
                effects: []
              })
              view.requestMeasure()
            })
            
            return container
          }
          
          ignoreEvent() { return false }
          
          destroy(dom) {
            // Clean up any event listeners if needed
            // CodeMirror calls this when the widget is removed
          }
          
          coordsAt(dom, pos, side) {
            // Required method for CodeMirror widget positioning
            return null
          }
          
          compare(other) {
            // Compare widget state to determine if re-rendering is needed
            return other instanceof PropertiesHeader && 
                   this.collapsed === other.collapsed
          }
        }
        
        const decorations = []
        
        // Add Properties widget and hide ALL frontmatter including newlines
        try {
          // Add Properties widget at the start
          decorations.push(
            Decoration.widget({
              widget: new PropertiesHeader(),
              side: -1
            }).range(0)
          )
          
          // Find end of frontmatter INCLUDING the newline after closing ---
          const closingPattern = text.includes('\r\n') ? '\r\n---\r\n' : '\n---\n'
          const searchStart = 4 // After opening "---\n"
          const closingPos = text.indexOf(closingPattern, searchStart)
          
          if (closingPos !== -1) {
            const endPos = closingPos + closingPattern.length
            
            // Hide the ENTIRE frontmatter block INCLUDING all newlines
            decorations.push(
              Decoration.mark({
                attributes: {
                  class: 'cm-frontmatter-hidden'
                }
              }).range(0, endPos)
            )
          }
        } catch (error) {
          console.warn('Error creating frontmatter decorations:', error)
        }
        
        // Filter and sort decorations for CodeMirror
        const validDecorations = decorations.filter(dec => {
          if (!dec) return false
          
          // Widget decorations
          if (dec.value?.widget) return true
          
          // Mark decorations with valid range
          if (dec.value?.spec?.attributes && typeof dec.from === 'number' && typeof dec.to === 'number') {
            return dec.to > dec.from
          }
          
          return false
        }).sort((a, b) => (a.from || 0) - (b.from || 0))
        
        try {
          return validDecorations.length > 0 ? Decoration.set(validDecorations) : Decoration.none
        } catch (error) {
          console.error('Error creating decoration set:', error)
          return Decoration.none
        }
      }
      
      update(update) {
        if (update.docChanged || update.viewportChanged) {
          console.log('Frontmatter plugin update triggered:', { docChanged: update.docChanged, viewportChanged: update.viewportChanged })
          this.decorations = this.buildDecorations(update.view)
        }
      }
    }, {
      decorations: v => v.decorations
    })
  }

  setupEditor(content) {
    // Create a shared state object for highlight tracking
    const highlightState = { 
      waitingForSecondEqual: false,
      selectedText: '',
      from: 0,
      to: 0
    }
    
    // Create a shared state object for underline tracking (_text_)
    const italicState = {
      waitingForSecondUnderscore: false,
      selectedText: '',
      from: 0,
      to: 0
    }
    
    // Create a shared state object for italic tracking (ii)
    const italicIIState = {
      waitingForSecondI: false,
      selectedText: '',
      from: 0,
      to: 0
    }
    
    // Create a shared state object for bold tracking (**)
    const boldState = {
      waitingForSecondStar: false,
      selectedText: '',
      from: 0,
      to: 0
    }
    
    const extensions = [
      // Manual basicSetup configuration with all essential functionality including double-click word selection
      this.lineNumbersCompartment.of(this.showLineNumbers ? [lineNumbers(), highlightActiveLineGutter(), foldGutter()] : []),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      // Configure closeBrackets to exclude square brackets for WikiLinks
      closeBrackets({
        // Only include opening brackets we want to auto-close (exclude [ ])
        brackets: ["(", "{", '"', "'", "`"],
        before: ")]}\"'`"
      }),
      
      // WikiLink completion with autocompletion
      createWikiLinkCompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      
      // Bullet list continuation on Enter (must come before default keymaps)
      bulletListExtension(),
      
      // Custom keymap to override Cmd+F for GlobalSearch
      keymap.of([
        {
          key: "Mod-f",
          run: () => {
            // Prevent CodeMirror's search from opening
            // GlobalSearch will be handled by the global keyboard handler
            return true; // Return true to indicate we handled it
          }
        }
      ]),
      
      // Default keymaps
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...completionKeymap,
        ...lintKeymap
      ]),
      
      // Markdown specific
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
        addKeymap: false // Disable markdown keymap to prevent selection expansion
      }),
      
      // Enhanced live preview - both plugin and styles
      livePreviewPlugin,
      livePreviewStyles,
      
      // Search functionality
      search({
        top: true, // Show search panel at the top
        caseSensitive: false,
        literal: false,
        wholeWord: false
      }),
      highlightSelectionMatches(),
      
      // Extension to handle all inline formatting (bold, italic, underline, headings)
      inlineFormattingExtension,
      inlineFormattingStyles,
      
      // StateField for block widgets (tables, code blocks)
      blockWidgetExtension,
      
      // Image embedding with ![](URL) syntax
      imageEmbedPlugin,
      
      // Markdown links with [text](url) syntax
      linkPlugin,
      linkStyles,
      
      // WikiLinks with [[Page Name]] syntax
      wikiLinkPlugin,
      wikiLinkStyles,
      
      // Add a view plugin to detect WikiLink completions
      ViewPlugin.fromClass(class {
        constructor(view) {
          this.view = view
        }
        
        update(update) {
          // Check if this is a completion transaction
          if (update.transactions.some(tr => tr.isUserEvent("input.complete"))) {
            console.log("WikiLink completion applied, forcing decoration update")
            // Schedule an update to refresh WikiLink decorations
            setTimeout(() => {
              if (!this.view.isDestroyed) {
                this.view.dispatch({
                  effects: []
                })
              }
            }, 50)
          }
        }
      }),
      
      // Image paste handler
      imagePasteExtension(),
      
      // Additional custom keybindings
      keymap.of([
        indentWithTab,
        ...this.customKeymap()
      ]),
      
      // Enhanced double-click word selection and triple-click paragraph selection
      EditorView.domEventHandlers({
        dblclick: (event, view) => {
          console.log('🖱️ Double-click detected at:', event.clientX, event.clientY)
          
          // Get the position where the click occurred
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
          if (pos === null) {
            console.log('❌ Could not get position from click coordinates')
            return false
          }
          
          console.log('📍 Click position:', pos)
          
          // Use CodeMirror's built-in word selection logic
          const doc = view.state.doc
          const line = doc.lineAt(pos)
          const lineText = line.text
          const linePos = pos - line.from
          
          console.log('📝 Line text:', lineText)
          console.log('📍 Position in line:', linePos)
          
          // Find word boundaries using better logic
          let start = linePos
          let end = linePos
          
          // More comprehensive word boundary detection
          const isWordChar = (char) => /[a-zA-Z0-9_\u00C0-\u017F\u0100-\u024F]/.test(char)
          
          // Expand left to find word start
          while (start > 0 && isWordChar(lineText[start - 1])) {
            start--
          }
          
          // Expand right to find word end
          while (end < lineText.length && isWordChar(lineText[end])) {
            end++
          }
          
          // If we found a word, select it
          if (start < end) {
            const from = line.from + start
            const to = line.from + end
            const selectedText = lineText.slice(start, end)
            
            console.log('✅ Selecting word:', selectedText, 'from', from, 'to', to)
            
            // Create the selection and update the view
            view.dispatch({
              selection: { anchor: from, head: to },
              scrollIntoView: true
            })
            
            // Verify the selection was set
            setTimeout(() => {
              const currentSelection = view.state.selection.main
              if (!currentSelection.empty) {
                const actualSelected = view.state.doc.sliceString(currentSelection.from, currentSelection.to)
                console.log('✅ Final selection:', actualSelected)
              } else {
                console.log('❌ Selection appears to be empty')
              }
            }, 10)
            
            return true // We handled the event
          }
          
          console.log('❌ No word found at click position')
          return false
        },
        
        // Triple-click paragraph selection 
        click: (event, view) => {
          // Check if this is a triple-click
          if (event.detail === 3) {
            console.log('🖱️ Triple-click detected - selecting paragraph')
            
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
            if (pos === null) {
              console.log('❌ Could not get position from click coordinates')
              return false
            }
            
            const doc = view.state.doc
            const clickLine = doc.lineAt(pos)
            
            // Find paragraph boundaries
            let startLine = clickLine.number
            let endLine = clickLine.number
            
            // Helper function to check if a line is a paragraph boundary
            const isParagraphBoundary = (line) => {
              const text = line.text.trim()
              if (text === '') return true // Empty line
              if (text.startsWith('#')) return true // Header
              if (text.startsWith('- ') || text.startsWith('* ') || text.startsWith('+ ')) return true // List items
              if (text.startsWith('> ')) return true // Blockquote
              if (text.match(/^\d+\. /)) return true // Numbered list
              if (text.startsWith('```')) return true // Code block
              if (text.startsWith('---') || text.startsWith('***')) return true // Horizontal rule
              return false
            }
            
            // Look backwards to find paragraph start
            while (startLine > 1) {
              const prevLine = doc.line(startLine - 1)
              if (isParagraphBoundary(prevLine)) {
                // Found paragraph boundary - stop here
                break
              }
              startLine--
            }
            
            // Look forwards to find paragraph end
            while (endLine < doc.lines) {
              const nextLine = doc.line(endLine + 1)
              if (isParagraphBoundary(nextLine)) {
                // Found paragraph boundary - stop here
                break
              }
              endLine++
            }
            
            // Select from start of first line to end of last line (excluding newline)
            const from = doc.line(startLine).from
            const to = doc.line(endLine).to
            
            console.log(`✅ Selecting paragraph from line ${startLine} to ${endLine}`, 'from', from, 'to', to)
            
            view.dispatch({
              selection: { anchor: from, head: to },
              scrollIntoView: true
            })
            
            // Verify the selection
            setTimeout(() => {
              const currentSelection = view.state.selection.main
              if (!currentSelection.empty) {
                const actualSelected = view.state.doc.sliceString(currentSelection.from, currentSelection.to)
                console.log('✅ Final paragraph selection:', actualSelected)
              }
            }, 10)
            
            return true // We handled the event
          }
          
          return false // Not a triple-click, let CodeMirror handle it
        }
      }),
      
      // Dynamic compartments - default to light theme
      this.themeCompartment.of(this.createTheme('default')),
      this.lineWrappingCompartment.of(EditorView.lineWrapping),
      this.fontSizeCompartment.of(this.createFontSizeTheme(window.pendingEditorSettings?.fontSize || 16)),
      this.frontmatterCompartment.of(this.createFrontmatterPlugin()),
      
      // Input handler for == and ** wrapping
      EditorView.inputHandler.of((view, from, to, text) => {
        // Removed automatic trigger on [[ since we want to wait for user to start typing
        
        // Check if typing '=' with selected text for highlighting
        if (text === '=' && from !== to) {
          const selectedText = view.state.doc.sliceString(from, to)
          
          // Check if we should start highlight wrapping
          if (!highlightState.waitingForSecondEqual) {
            highlightState.waitingForSecondEqual = true
            highlightState.selectedText = selectedText
            highlightState.from = from
            highlightState.to = to
            
            // Insert just the first '=' for now
            view.dispatch({
              changes: { from, to, insert: '=' },
              selection: { anchor: from + 1 }
            })
            return true
          }
        }
        // Check if typing second '=' after first one
        else if (text === '=' && highlightState.waitingForSecondEqual) {
          const state = highlightState
          highlightState.waitingForSecondEqual = false
          
          // Insert the wrapped text
          view.dispatch({
            changes: { 
              from: state.from, 
              to: view.state.selection.main.from,
              insert: `==${state.selectedText}==` 
            },
            selection: { anchor: state.from + 2 + state.selectedText.length + 2 }
          })
          return true
        }
        // Check if typing 'i' with selected text for italic
        else if (text === 'i' && from !== to) {
          const selectedText = view.state.doc.sliceString(from, to)
          
          // Check if we should start italic tracking
          if (!italicIIState.waitingForSecondI) {
            italicIIState.waitingForSecondI = true
            italicIIState.selectedText = selectedText
            italicIIState.from = from
            italicIIState.to = to  // Store the original end position
            
            // Insert just the first 'i' for now, but don't change the text boundaries
            view.dispatch({
              changes: { from, to, insert: 'i' },
              selection: { anchor: from + 1 }
            })
            return true
          }
        }
        // Check if typing second 'i' after first one
        else if (text === 'i' && italicIIState.waitingForSecondI) {
          const state = italicIIState
          italicIIState.waitingForSecondI = false
          
          // We want to replace the "i" that's currently there, plus the "i" we're about to type
          // with "*originalText*"
          view.dispatch({
            changes: { 
              from: state.from, 
              to: state.from + 1, // Remove just the existing "i"
              insert: `*${state.selectedText}*` 
            },
            selection: { anchor: state.from + 1 + state.selectedText.length + 1 }
          })
          return true
        }
        // Check if typing '*' with selected text for bold
        else if (text === '*' && from !== to) {
          const selectedText = view.state.doc.sliceString(from, to)
          
          // Check if we should start bold tracking
          if (!boldState.waitingForSecondStar) {
            boldState.waitingForSecondStar = true
            boldState.selectedText = selectedText
            boldState.from = from
            boldState.to = to
            
            // Insert just the first '*' for now
            view.dispatch({
              changes: { from, to, insert: '*' },
              selection: { anchor: from + 1 }
            })
            return true
          }
        }
        // Check if typing second '*' after first one
        else if (text === '*' && boldState.waitingForSecondStar) {
          const state = boldState
          boldState.waitingForSecondStar = false
          
          // Insert the wrapped text with double asterisks for bold
          view.dispatch({
            changes: { 
              from: state.from, 
              to: view.state.selection.main.from,
              insert: `**${state.selectedText}**` 
            },
            selection: { anchor: state.from + 2 + state.selectedText.length + 2 }
          })
          return true
        }
        // Check if typing '_' with selected text for italic
        else if (text === '_' && from !== to) {
          const selectedText = view.state.doc.sliceString(from, to)
          
          // Check if we should start italic wrapping
          if (!italicState.waitingForSecondUnderscore) {
            italicState.waitingForSecondUnderscore = true
            italicState.selectedText = selectedText
            italicState.from = from
            italicState.to = to
            
            // Insert just the first '_' for now
            view.dispatch({
              changes: { from, to, insert: '_' },
              selection: { anchor: from + 1 }
            })
            return true
          }
        }
        // Check if typing second '_' after first one
        else if (text === '_' && italicState.waitingForSecondUnderscore) {
          const state = italicState
          italicState.waitingForSecondUnderscore = false
          
          // Insert the wrapped text
          view.dispatch({
            changes: { 
              from: state.from, 
              to: view.state.selection.main.from,
              insert: `_${state.selectedText}_` 
            },
            selection: { anchor: state.from + 1 + state.selectedText.length + 1 }
          })
          return true
        }
        // Clear states if typing something else
        else {
          if (highlightState.waitingForSecondEqual && text !== '=') {
            highlightState.waitingForSecondEqual = false
          }
          if (italicState.waitingForSecondUnderscore && text !== '_') {
            italicState.waitingForSecondUnderscore = false
          }
          if (italicIIState.waitingForSecondI && text !== 'i') {
            italicIIState.waitingForSecondI = false
          }
          if (boldState.waitingForSecondStar && text !== '*') {
            boldState.waitingForSecondStar = false
          }
        }
        
        return false
      }),
      
      // Update listener for Rust backend
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          this.handleContentChange(update)
        }
        
        // Debug selection changes
        if (update.selectionSet) {
          console.log('📝 Selection changed:', update.state.selection.main)
          const selection = update.state.selection.main
          if (!selection.empty) {
            const selectedText = update.state.doc.sliceString(selection.from, selection.to)
            console.log('✅ Selected text:', `"${selectedText}"`)
          }
        }
      })
    ]

    this.state = EditorState.create({
      doc: content,
      extensions
    })

    this.view = new EditorView({
      state: this.state,
      parent: this.container
    })
    
    
    // Clear selection on initial load to avoid showing raw markdown
    this.clearInitialSelection()
  }

  customKeymap() {
    return [
      { key: "Mod-s", run: () => { this.save(); return true }},
      // Formatting shortcuts are handled at document level in main.js
      // to ensure they work even when editor doesn't have focus
      { key: "Mod-Shift-k", run: () => { this.togglePreview(); return true }},
      { key: "Mod-Shift-h", run: (view) => summarizeHighlightsCommand(view) },
      // Reset editor to fix performance issues
      { key: "Mod-Shift-r", run: () => { this.reset(); return true }}
      // Cmd+Shift+F is handled at document level in main.js to ensure it works
    ]
  }

  createTheme(type) {
    if (type === 'dark') {
      return oneDark
    }
    
    // Light theme with CSS variables for customization (default is light)
    return EditorView.theme({
      "&": {
        color: "var(--editor-text-color, #2c3e50)",
        backgroundColor: "var(--editor-bg-color, #ffffff)",
        fontFamily: "var(--editor-font-family, 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
        fontSize: "var(--editor-font-size, 16px)",
        lineHeight: "var(--editor-line-height, 1.7)"
      },
      ".cm-content": {
        caretColor: "var(--editor-caret-color, #5b47e0)",
        padding: "var(--editor-padding, 24px 32px)"
      },
      "&.cm-focused .cm-cursor": {
        borderLeftColor: "var(--editor-caret-color, #007acc)"
      },
      "&.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: "#00ff00 !important"
      },
      ".cm-selectionBackground": {
        backgroundColor: "#00ff00 !important",
        borderRadius: "2px",
        border: "2px solid #00cc00 !important"
      },
      "&:not(.cm-focused) .cm-selectionBackground": {
        backgroundColor: "#00ff00 !important",
        border: "2px solid #00cc00 !important"
      },
      ".cm-gutters": {
        backgroundColor: "var(--editor-gutter-bg, #f8f9fa)",
        color: "var(--editor-gutter-color, #6e7681)",
        border: "none",
        borderRight: "1px solid var(--editor-gutter-border, #e1e4e8)"
      },
      ".cm-activeLineGutter": {
        backgroundColor: "var(--editor-active-line-gutter-bg, #f0f1f3)"
      },
      ".cm-activeLine": {
        backgroundColor: "var(--editor-active-line-bg, #f8f9fa)"
      },
      ".cm-line": {
        paddingLeft: "var(--editor-line-padding, 4px)",
        paddingRight: "var(--editor-line-padding, 4px)"
      },
      // Force selection to be visible everywhere
      ".cm-selectionBackground, .cm-content .cm-selectionBackground, .cm-line .cm-selectionBackground": {
        backgroundColor: "#00ff00 !important",
        color: "#000000 !important",
        border: "2px solid #00cc00 !important",
        borderRadius: "2px !important",
        opacity: "1 !important",
        zIndex: "1000 !important"
      }
    }, (type === 'light' || type === 'default') ? { dark: false } : { dark: true })
  }

  createFontSizeTheme(size) {
    console.log('Creating font size theme with size:', size);
    return EditorView.theme({
      "&": { fontSize: `${size}px` },
      ".cm-content": { fontSize: `${size}px` },
      ".cm-line": { fontSize: `${size}px` },
      ".cm-editor": { fontSize: `${size}px` }
    })
  }

  handleContentChange(update) {
    this.hasUnsavedChanges = true
    
    // Update word count immediately
    if (window.updateWordCount) {
      window.updateWordCount()
    }
    
    // Check if we're in the middle of a WikiLink completion
    const currentContent = this.view?.state?.doc?.toString() || '';
    const cursorPos = this.view?.state?.selection?.main?.head;
    const textBeforeCursor = currentContent.slice(Math.max(0, cursorPos - 10), cursorPos);
    
    // Check for WikiLink pattern - look for [[ without closing ]]
    const hasOpenWikiLink = textBeforeCursor.includes('[[') && 
                            !textBeforeCursor.includes(']]') &&
                            textBeforeCursor.lastIndexOf('[[') > textBeforeCursor.lastIndexOf(']]');
    
    // Debounce auto-save (extend delay if WikiLink is active)
    clearTimeout(this.autoSaveTimeout)
    const saveDelay = hasOpenWikiLink ? 10000 : 2000; // 10 seconds if WikiLink active, 2 seconds otherwise
    
    if (hasOpenWikiLink) {
      console.log('WikiLink detected - extending auto-save delay to 10 seconds');
    }
    
    this.autoSaveTimeout = setTimeout(() => {
      this.autoSave()
    }, saveDelay)
  }

  async setupTauriListeners() {
    // Any Tauri-specific setup can go here
  }

  clearInitialSelection() {
    // Position cursor after first line to show live preview instead of raw markdown
    setTimeout(() => {
      if (!this.view || !this.view.state) return;
      
      const doc = this.view.state.doc
      if (doc.lines >= 2) {
        // Move cursor to start of second line so first line shows formatted
        const secondLine = doc.line(2)
        this.view.dispatch({
          selection: { anchor: secondLine.from, head: secondLine.from }
        })
      } else if (doc.length > 0) {
        // If only one line, move to end of first line
        this.view.dispatch({
          selection: { anchor: doc.length, head: doc.length }
        })
      }
      console.log('🔍 Editor initialized, double-click word selection should work now')
    }, 100)
  }

  // Content manipulation methods
  setContent(content, preserveScroll = false) {
    const startTime = Date.now();
    
    // Track performance for large content
    if (window.perfMonitor) {
      window.perfMonitor.trackEditorMetrics(this.editorId, 'set_content_start', startTime);
    }
    
    if (!this.view || !this.view.state) {
      console.error('[MarkdownEditor] Cannot set content - view not initialized');
      return;
    }
    
    // Preserve scroll position if requested
    let scrollTop = 0;
    let scrollLeft = 0;
    if (preserveScroll) {
      scrollTop = this.view.scrollDOM.scrollTop;
      scrollLeft = this.view.scrollDOM.scrollLeft;
    }
    
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: content
      }
    });
    
    // Restore scroll position if it was preserved
    if (preserveScroll) {
      requestAnimationFrame(() => {
        this.view.scrollDOM.scrollTop = scrollTop;
        this.view.scrollDOM.scrollLeft = scrollLeft;
      });
    }
    
    // Track completion time
    if (window.perfMonitor) {
      window.perfMonitor.trackEditorMetrics(this.editorId, 'set_content_complete', startTime);
    }
    
    // Position cursor after first line to show live preview instead of raw markdown
    setTimeout(() => {
      if (!this.view || !this.view.state) return;
      
      const doc = this.view.state.doc
      if (doc.lines >= 2) {
        // Move cursor to start of second line
        const secondLine = doc.line(2)
        this.view.dispatch({
          selection: { anchor: secondLine.from, head: secondLine.from }
        })
      } else if (doc.length > 0) {
        // If only one line, move to end of first line
        this.view.dispatch({
          selection: { anchor: doc.length, head: doc.length }
        })
      }
    }, 50)
    
    this.hasUnsavedChanges = false
  }

  getContent() {
    if (!this.view || !this.view.state) {
      console.warn('[MarkdownEditor] View not initialized yet');
      return '';
    }
    return this.view.state.doc.toString()
  }

  // Formatting methods
  toggleBold() {
    this.wrapSelection('**', '**')
  }

  toggleItalic() {
    this.wrapSelection('*', '*')
  }

  toggleHighlight() {
    this.wrapSelection('==', '==')
  }

  toggleUnderline() {
    this.wrapSelection('_', '_')
  }

  toggleStrikethrough() {
    this.wrapSelection('~~', '~~')
  }

  insertLink() {
    const selection = this.view.state.selection.main
    const selectedText = this.view.state.doc.sliceString(selection.from, selection.to)
    
    // Show link input dialog
    this.showLinkDialog(selectedText, selection)
  }
  
  showLinkDialog(selectedText, selection) {
    // Create modal overlay
    const overlay = document.createElement('div')
    overlay.className = 'link-dialog-overlay'
    overlay.innerHTML = `
      <div class="link-dialog">
        <h3>Insert Link</h3>
        <div class="link-dialog-field">
          <label>Link Text:</label>
          <input type="text" id="link-text" value="${selectedText}" placeholder="Enter link text">
        </div>
        <div class="link-dialog-field">
          <label>URL:</label>
          <input type="text" id="link-url" placeholder="Enter URL (e.g., https://example.com)">
        </div>
        <div class="link-dialog-buttons">
          <button id="link-cancel">Cancel</button>
          <button id="link-insert" class="primary">Insert Link</button>
        </div>
      </div>
    `
    
    // Add styles
    const style = document.createElement('style')
    style.textContent = `
      .link-dialog-overlay {
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
      }
      
      .link-dialog {
        background: var(--bg-primary, #ffffff);
        border-radius: 8px;
        padding: 24px;
        width: 400px;
        max-width: 90vw;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        border: 1px solid var(--border-color, #e9e9e7);
      }
      
      .link-dialog h3 {
        margin: 0 0 20px 0;
        color: var(--text-primary, #1a1a1a);
        font-size: 18px;
        font-weight: 600;
      }
      
      .link-dialog-field {
        margin-bottom: 16px;
      }
      
      .link-dialog-field label {
        display: block;
        margin-bottom: 6px;
        color: var(--text-secondary, #6b6b6b);
        font-size: 14px;
        font-weight: 500;
      }
      
      .link-dialog-field input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--border-color, #e9e9e7);
        border-radius: 6px;
        font-size: 14px;
        color: var(--text-primary, #1a1a1a);
        background: var(--bg-primary, #ffffff);
        box-sizing: border-box;
      }
      
      .link-dialog-field input:focus {
        outline: none;
        border-color: var(--accent-color, #4572DE);
        box-shadow: 0 0 0 2px rgba(69, 114, 222, 0.1);
      }
      
      .link-dialog-buttons {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        margin-top: 24px;
      }
      
      .link-dialog-buttons button {
        padding: 8px 16px;
        border: 1px solid var(--border-color, #e9e9e7);
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        background: var(--bg-primary, #ffffff);
        color: var(--text-primary, #1a1a1a);
      }
      
      .link-dialog-buttons button.primary {
        background: var(--accent-color, #4572DE);
        color: white;
        border-color: var(--accent-color, #4572DE);
      }
      
      .link-dialog-buttons button:hover {
        opacity: 0.8;
      }
    `
    
    document.head.appendChild(style)
    document.body.appendChild(overlay)
    
    // Focus the appropriate input
    setTimeout(() => {
      const textInput = document.getElementById('link-text')
      const urlInput = document.getElementById('link-url')
      
      if (selectedText) {
        urlInput.focus()
      } else {
        textInput.focus()
        textInput.select()
      }
    }, 50)
    
    // Handle button clicks
    document.getElementById('link-cancel').onclick = () => {
      document.body.removeChild(overlay)
      document.head.removeChild(style)
      this.view.focus()
    }
    
    document.getElementById('link-insert').onclick = () => {
      const linkText = document.getElementById('link-text').value.trim()
      const linkUrl = document.getElementById('link-url').value.trim()
      
      if (linkText && linkUrl) {
        // Insert the markdown link
        this.view.dispatch({
          changes: {
            from: selection.from,
            to: selection.to,
            insert: `[${linkText}](${linkUrl})`
          },
          selection: {
            anchor: selection.from + linkText.length + linkUrl.length + 4, // Position after the link
            head: selection.from + linkText.length + linkUrl.length + 4
          }
        })
        
        document.body.removeChild(overlay)
        document.head.removeChild(style)
        this.view.focus()
        
        // Trigger content change for auto-save
        this.handleContentChange()
      }
    }
    
    // Handle Enter key in URL input
    document.getElementById('link-url').onkeydown = (e) => {
      if (e.key === 'Enter') {
        document.getElementById('link-insert').click()
      }
    }
    
    // Handle Escape key
    overlay.onkeydown = (e) => {
      if (e.key === 'Escape') {
        document.getElementById('link-cancel').click()
      }
    }
    
    // Close on overlay click
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        document.getElementById('link-cancel').click()
      }
    }
  }

  wrapSelection(before, after) {
    if (!this.view) {
      console.error('No editor view available');
      return;
    }
    
    // Ensure editor has focus
    this.view.focus();
    
    const selection = this.view.state.selection.main
    const selectedText = this.view.state.doc.sliceString(selection.from, selection.to)
    
    this.view.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert: before + selectedText + after
      },
      selection: {
        anchor: selection.from + before.length,
        head: selection.to + before.length
      }
    })
  }

  insertText(text) {
    const selection = this.view.state.selection.main
    this.view.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert: text
      }
    })
  }

  // Line numbers toggle
  toggleLineNumbers() {
    this.showLineNumbers = !this.showLineNumbers
    this.view.dispatch({
      effects: this.lineNumbersCompartment.reconfigure(
        this.showLineNumbers ? [lineNumbers(), highlightActiveLineGutter(), foldGutter()] : []
      )
    })
    return this.showLineNumbers
  }
  
  // Set line numbers state
  setLineNumbers(enabled) {
    if (this.showLineNumbers !== enabled) {
      this.toggleLineNumbers()
    }
  }
  
  // Toggle line wrapping
  toggleLineWrapping() {
    this.lineWrapping = !this.lineWrapping
    this.view.dispatch({
      effects: this.lineWrappingCompartment.reconfigure(
        this.lineWrapping ? EditorView.lineWrapping : []
      )
    })
    return this.lineWrapping
  }
  
  // Set line wrapping state
  setLineWrapping(enabled) {
    if (this.lineWrapping !== enabled) {
      this.toggleLineWrapping()
    }
  }
  
  
  // Set font size
  setFontSize(size) {
    console.log('MarkdownEditor.setFontSize called with size:', size);
    if (this.view) {
      console.log('Dispatching font size change to editor view');
      try {
        this.view.dispatch({
          effects: this.fontSizeCompartment.reconfigure(
            this.createFontSizeTheme(size)
          )
        })
        console.log('Font size change dispatched successfully');
      } catch (error) {
        console.error('Error dispatching font size change:', error);
      }
    } else {
      console.warn('Editor view not available for font size change');
    }
  }

  // Save methods
  async save() {
    if (this.currentFile) {
      try {
        // Capture scroll position at the very start of save
        const initialScrollTop = this.view?.scrollDOM?.scrollTop || 0
        const initialScrollLeft = this.view?.scrollDOM?.scrollLeft || 0
        console.log(`💾 Saving file: ${this.currentFile} (scroll: top=${initialScrollTop}, left=${initialScrollLeft})`)
        const content = this.getContent()
        const newTimestamp = await invoke('write_file_content', {
          filePath: this.currentFile,
          content: content
        })
        
        // If a new timestamp was returned, update just that line in the editor
        if (newTimestamp) {
          const lines = content.split('\n')
          
          // Find and update the updated_at line in frontmatter
          let inFrontmatter = false
          let frontmatterCount = 0
          for (let i = 0; i < lines.length; i++) {
            if (lines[i] === '---') {
              frontmatterCount++
              if (frontmatterCount === 1) {
                inFrontmatter = true
              } else if (frontmatterCount === 2) {
                break // End of frontmatter
              }
            } else if (inFrontmatter && lines[i].startsWith('updated_at:')) {
              // Update just this line
              lines[i] = `updated_at: ${newTimestamp}`
              
              // Update the editor content efficiently
              const newContent = lines.join('\n')
              const view = this.view
              if (view) {
                // Get current cursor and scroll positions BEFORE making changes
                const cursorPos = view.state.selection.main.head
                const scrollTop = view.scrollDOM.scrollTop
                const scrollLeft = view.scrollDOM.scrollLeft
                
                // Create a transaction to update the content
                const transaction = view.state.update({
                  changes: {
                    from: 0,
                    to: view.state.doc.length,
                    insert: newContent
                  }
                })
                
                // Dispatch the content change first
                view.dispatch(transaction)
                
                // Then set the cursor position if it's valid
                const newDocLength = view.state.doc.length
                const validCursorPos = Math.min(cursorPos, newDocLength)
                
                if (validCursorPos >= 0) {
                  view.dispatch({
                    selection: { anchor: validCursorPos, head: validCursorPos }
                  })
                }
                
                // IMPORTANT: Restore scroll position after content update
                // Use requestAnimationFrame to ensure DOM has been updated
                requestAnimationFrame(() => {
                  view.scrollDOM.scrollTop = scrollTop
                  view.scrollDOM.scrollLeft = scrollLeft
                  console.log(`📍 Restored scroll position: top=${scrollTop}, left=${scrollLeft}`)
                })
                
                console.log('📝 Updated timestamp in editor to:', newTimestamp)
              }
              break
            }
          }
        }
        
        // Fallback: If no timestamp update was done, still ensure scroll position is preserved
        // This handles cases where the backend might not return a timestamp
        if (!newTimestamp && this.view) {
          const currentScrollTop = this.view.scrollDOM.scrollTop
          const currentScrollLeft = this.view.scrollDOM.scrollLeft
          if (currentScrollTop !== initialScrollTop || currentScrollLeft !== initialScrollLeft) {
            console.log(`⚠️ Scroll position changed during save without timestamp update. Restoring...`)
            this.view.scrollDOM.scrollTop = initialScrollTop
            this.view.scrollDOM.scrollLeft = initialScrollLeft
          }
        }
        
        this.hasUnsavedChanges = false
        console.log('✅ File saved successfully')
        
        // Notify tab system that file is saved (clear dirty state)
        if (window.onFileSaved) {
          window.onFileSaved(this.currentFile)
        }
      } catch (error) {
        console.error('❌ Failed to save file:', error)
      }
    }
  }

  async autoSave() {
    // Additional check - don't save if WikiLink is still open
    const currentContent = this.view?.state?.doc?.toString() || '';
    const cursorPos = this.view?.state?.selection?.main?.head;
    const textBeforeCursor = currentContent.slice(Math.max(0, cursorPos - 10), cursorPos);
    
    const hasOpenWikiLink = textBeforeCursor.includes('[[') && 
                            !textBeforeCursor.includes(']]') &&
                            textBeforeCursor.lastIndexOf('[[') > textBeforeCursor.lastIndexOf(']]');
    
    if (hasOpenWikiLink) {
      console.log('Skipping auto-save - WikiLink still open');
      // Reschedule for later
      clearTimeout(this.autoSaveTimeout)
      this.autoSaveTimeout = setTimeout(() => {
        this.autoSave()
      }, 5000)
      return;
    }
    
    if (this.hasUnsavedChanges && this.currentFile) {
      await this.save()
    }
  }

  togglePreview() {
    // Preview functionality can be implemented later
    console.log('Preview toggle not implemented yet')
  }

  // Open search panel
  openSearch() {
    if (this.view) {
      openSearchPanel(this.view);
    }
  }
  
  // Close search panel
  closeSearch() {
    if (this.view) {
      closeSearchPanel(this.view);
    }
  }

  // Utility methods
  focus() {
    this.view.focus()
  }
  
  async reset() {
    console.log('🔄 Resetting CodeMirror editor instance');
    
    // Check if user wants to save unsaved changes
    if (this.hasUnsavedChanges && this.currentFile) {
      const shouldSave = confirm('You have unsaved changes. Save before resetting?');
      if (shouldSave) {
        await this.save();
      }
    }
    
    // Save current content and cursor position
    const content = this.getContent();
    const cursorPos = this.view?.state.selection.main.head || 0;
    const scrollPos = this.view?.scrollDOM.scrollTop || 0;
    
    // Clear all timeouts
    if (this.autoSaveTimeout) clearTimeout(this.autoSaveTimeout);
    if (this.settingsTimeout) clearTimeout(this.settingsTimeout);
    
    // Clear caches
    if (window.wikiLinkCache) {
      window.wikiLinkCache.invalidateAll();
    }
    
    // Clear note existence cache from wikilink extension
    if (window.noteExistenceCache) {
      window.noteExistenceCache.clear();
    }
    
    // Destroy current view
    if (this.view) {
      this.view.destroy();
      this.view = null;
    }
    
    // Clear container
    this.container.innerHTML = '';
    
    // Small delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Recreate editor with same content
    this.setupEditor(content);
    
    // Restore cursor position and scroll
    setTimeout(() => {
      if (this.view) {
        this.view.dispatch({
          selection: { anchor: cursorPos, head: cursorPos },
          scrollIntoView: true
        });
        this.view.scrollDOM.scrollTop = scrollPos;
      }
    }, 50);
    
    // Show notification
    this.showNotification('Editor reset successfully');
    
    console.log('✅ Editor reset complete');
  }
  
  showNotification(message) {
    // Add animation style if not already present
    if (!document.querySelector('#editor-notification-styles')) {
      const style = document.createElement('style');
      style.id = 'editor-notification-styles';
      style.textContent = `
        @keyframes slideIn {
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
      document.head.appendChild(style);
    }
    
    const notification = document.createElement('div');
    notification.className = 'editor-notification';
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4a90e2;
      color: white;
      padding: 10px 20px;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  destroy() {
    console.log(`🧹 Destroying MarkdownEditor instance: ${this.editorId}`);
    
    // Track destruction performance
    const startTime = Date.now();
    if (window.perfMonitor) {
      window.perfMonitor.trackEditorMetrics(this.editorId, 'destruction', startTime);
    }
    
    // Clear any pending auto-save
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
      this.autoSaveTimeout = null;
    }
    
    // Clear any pending timeouts for settings
    if (this.settingsTimeout) {
      clearTimeout(this.settingsTimeout);
      this.settingsTimeout = null;
    }
    
    // Remove any event listeners that might have been added
    if (this.container) {
      // Remove any custom event listeners from the container
      this.container.removeEventListener('click', this.handleClick);
      this.container.removeEventListener('keydown', this.handleKeyDown);
    }
    
    // Clear references to prevent memory leaks
    this.currentFile = null;
    this.customThemes.clear();
    this.container = null;
    
    // Destroy the CodeMirror view
    if (this.view) {
      this.view.destroy();
      this.view = null;
    }
    
    console.log('✅ MarkdownEditor destroyed');
  }
}