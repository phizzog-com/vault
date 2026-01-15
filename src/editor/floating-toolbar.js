/**
 * Floating Toolbar Extension for CodeMirror 6
 *
 * Provides a floating formatting toolbar that appears when text is selected.
 * Supports toggle behavior for bold, italic, strikethrough, code, and links.
 *
 * Features:
 * - Positioned above selection (or below if near top of editor)
 * - Appears after 100ms delay when selection stabilizes
 * - Disappears on click outside, Escape, or selection cleared
 * - Toggle behavior: clicking Bold on bold text removes the markers
 * - Buttons show "active" state when format is already applied
 */

import { EditorView, ViewPlugin } from '@codemirror/view'
import { keymap } from '@codemirror/view'

// Toolbar buttons configuration
const TOOLBAR_BUTTONS = [
  { id: 'bold', label: 'B', title: 'Bold (Cmd+B)', marker: '**' },
  { id: 'italic', label: 'I', title: 'Italic (Cmd+I)', marker: '*' },
  { id: 'strikethrough', label: 'S', title: 'Strikethrough', marker: '~~' },
  { id: 'code', label: '</>', title: 'Code (Cmd+`)', marker: '`' },
  { id: 'link', label: '\uD83D\uDD17', title: 'Link (Cmd+K)', action: 'link' },
]

/**
 * Check if the selection is wrapped with a specific marker
 */
function isFormatActive(view, marker) {
  const { from, to } = view.state.selection.main
  const markerLen = marker.length
  const before = view.state.sliceDoc(from - markerLen, from)
  const after = view.state.sliceDoc(to, to + markerLen)
  return before === marker && after === marker
}

/**
 * Toggle a formatting marker around the selection
 * If already wrapped, remove the markers; otherwise add them
 */
function toggleMark(view, marker) {
  const { from, to } = view.state.selection.main
  const text = view.state.sliceDoc(from, to)
  const markerLen = marker.length

  // Check if already wrapped
  const before = view.state.sliceDoc(from - markerLen, from)
  const after = view.state.sliceDoc(to, to + markerLen)

  if (before === marker && after === marker) {
    // Remove markers
    view.dispatch({
      changes: [
        { from: from - markerLen, to: from, insert: '' },
        { from: to, to: to + markerLen, insert: '' }
      ],
      selection: { anchor: from - markerLen, head: to - markerLen }
    })
  } else {
    // Add markers, keep selection on the text
    view.dispatch({
      changes: { from, to, insert: marker + text + marker },
      selection: { anchor: from + markerLen, head: to + markerLen }
    })
  }

  view.focus()
}

/**
 * Insert a markdown link around the selection
 * Places cursor between the parentheses for URL entry
 */
function insertLink(view) {
  const { from, to } = view.state.selection.main
  const text = view.state.sliceDoc(from, to)

  // Insert [text](url) with cursor in url position
  const linkText = `[${text}]()`
  view.dispatch({
    changes: { from, to, insert: linkText },
    selection: { anchor: from + text.length + 3 } // cursor between ()
  })

  view.focus()
}

/**
 * Handle button click based on button configuration
 */
function handleButtonClick(view, button) {
  if (button.action === 'link') {
    insertLink(view)
  } else if (button.marker) {
    toggleMark(view, button.marker)
  }
}

/**
 * ViewPlugin to manage the floating toolbar UI
 */
const floatingToolbarPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view
      this.toolbar = null
      this.showTimeout = null
      this.boundHandleDocumentClick = this.handleDocumentClick.bind(this)
      this.boundHandleKeydown = this.handleKeydown.bind(this)
    }

    update(update) {
      const selection = update.view.state.selection.main
      const hasSelection = !selection.empty

      if (hasSelection) {
        // Selection exists, schedule showing toolbar
        this.scheduleShow()
      } else {
        // No selection, hide toolbar
        this.hide()
      }
    }

    scheduleShow() {
      clearTimeout(this.showTimeout)
      this.showTimeout = setTimeout(() => {
        // Verify selection still exists before showing
        const selection = this.view.state.selection.main
        if (!selection.empty) {
          this.show()
        }
      }, 100)
    }

    show() {
      // If toolbar already exists, just update position and active states
      if (this.toolbar) {
        this.positionToolbar()
        this.updateActiveStates()
        return
      }

      // Create toolbar DOM
      this.toolbar = this.createToolbar()
      this.positionToolbar()

      // Add event listeners for closing
      document.addEventListener('mousedown', this.boundHandleDocumentClick, true)
      document.addEventListener('keydown', this.boundHandleKeydown, true)

      // Append to body
      document.body.appendChild(this.toolbar)
    }

    hide() {
      clearTimeout(this.showTimeout)
      this.showTimeout = null

      if (this.toolbar) {
        document.removeEventListener('mousedown', this.boundHandleDocumentClick, true)
        document.removeEventListener('keydown', this.boundHandleKeydown, true)
        this.toolbar.remove()
        this.toolbar = null
      }
    }

    createToolbar() {
      const toolbar = document.createElement('div')
      toolbar.className = 'cm-floating-toolbar'
      toolbar.setAttribute('role', 'toolbar')
      toolbar.setAttribute('aria-label', 'Text formatting')

      for (const button of TOOLBAR_BUTTONS) {
        const btn = document.createElement('button')
        btn.className = 'cm-floating-toolbar-btn'
        btn.setAttribute('type', 'button')
        btn.setAttribute('data-button-id', button.id)
        btn.setAttribute('title', button.title)
        btn.setAttribute('aria-label', button.title)
        btn.textContent = button.label

        // Apply styling classes for specific buttons
        if (button.id === 'bold') {
          btn.classList.add('cm-floating-toolbar-btn-bold')
        } else if (button.id === 'italic') {
          btn.classList.add('cm-floating-toolbar-btn-italic')
        } else if (button.id === 'strikethrough') {
          btn.classList.add('cm-floating-toolbar-btn-strikethrough')
        } else if (button.id === 'code') {
          btn.classList.add('cm-floating-toolbar-btn-code')
        }

        // Check if format is active and add active class
        if (button.marker && isFormatActive(this.view, button.marker)) {
          btn.classList.add('cm-floating-toolbar-btn-active')
        }

        // Handle click
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault() // Prevent losing selection
          e.stopPropagation()
          handleButtonClick(this.view, button)
          // Update active states after toggling
          this.updateActiveStates()
        })

        toolbar.appendChild(btn)
      }

      return toolbar
    }

    updateActiveStates() {
      if (!this.toolbar) return

      const buttons = this.toolbar.querySelectorAll('.cm-floating-toolbar-btn')
      buttons.forEach(btn => {
        const buttonId = btn.getAttribute('data-button-id')
        const buttonConfig = TOOLBAR_BUTTONS.find(b => b.id === buttonId)

        if (buttonConfig && buttonConfig.marker) {
          if (isFormatActive(this.view, buttonConfig.marker)) {
            btn.classList.add('cm-floating-toolbar-btn-active')
          } else {
            btn.classList.remove('cm-floating-toolbar-btn-active')
          }
        }
      })
    }

    positionToolbar() {
      if (!this.toolbar) return

      const selection = this.view.state.selection.main
      const coords = this.view.coordsAtPos(selection.from)

      if (!coords) return

      const editorRect = this.view.dom.getBoundingClientRect()
      const toolbarHeight = 40 // Approximate toolbar height
      const toolbarWidth = 200 // Approximate toolbar width
      const gap = 8

      // Position above selection by default
      let top = coords.top - toolbarHeight - gap
      let left = coords.left

      // If too close to top of viewport, position below selection
      if (top < editorRect.top + 10 || top < 10) {
        const endCoords = this.view.coordsAtPos(selection.to)
        if (endCoords) {
          top = endCoords.bottom + gap
        }
      }

      // Constrain horizontal position to editor bounds
      const minLeft = editorRect.left + 8
      const maxLeft = editorRect.right - toolbarWidth - 8
      left = Math.max(minLeft, Math.min(left, maxLeft))

      // Also constrain to viewport
      left = Math.max(8, Math.min(left, window.innerWidth - toolbarWidth - 8))

      this.toolbar.style.top = `${top}px`
      this.toolbar.style.left = `${left}px`
    }

    handleDocumentClick(e) {
      // If click is outside toolbar, hide it
      if (this.toolbar && !this.toolbar.contains(e.target)) {
        // Don't hide if clicking in the editor (selection might change)
        if (!this.view.dom.contains(e.target)) {
          this.hide()
        }
      }
    }

    handleKeydown(e) {
      // Hide on Escape
      if (e.key === 'Escape') {
        this.hide()
        e.preventDefault()
        e.stopPropagation()
      }
    }

    destroy() {
      this.hide()
    }
  }
)

/**
 * Keyboard shortcuts for formatting
 */
function createFormatCommand(marker) {
  return (view) => {
    const selection = view.state.selection.main
    if (selection.empty) return false
    toggleMark(view, marker)
    return true
  }
}

function createLinkCommand(view) {
  const selection = view.state.selection.main
  if (selection.empty) return false
  insertLink(view)
  return true
}

const floatingToolbarKeymap = keymap.of([
  { key: 'Mod-b', run: createFormatCommand('**') },
  { key: 'Mod-i', run: createFormatCommand('*') },
  { key: 'Mod-`', run: createFormatCommand('`') },
  { key: 'Mod-k', run: createLinkCommand },
])

/**
 * Styles for the floating toolbar
 */
const floatingToolbarStyles = EditorView.theme({
  '.cm-floating-toolbar': {
    position: 'fixed',
    zIndex: '1000',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    backgroundColor: 'var(--bg-primary, #ffffff)',
    border: '1px solid var(--border-color, #e9e9e7)',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
    padding: '4px',
    fontFamily: 'var(--font-family, Inter, -apple-system, BlinkMacSystemFont, sans-serif)'
  },

  '.cm-floating-toolbar-btn': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: 'var(--editor-text-color, #2c3e50)',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background-color 0.1s ease, color 0.1s ease'
  },

  '.cm-floating-toolbar-btn:hover': {
    backgroundColor: 'var(--bg-hover, #f5f5f5)'
  },

  '.cm-floating-toolbar-btn:active': {
    backgroundColor: 'var(--bg-selected, #e8f0fe)'
  },

  '.cm-floating-toolbar-btn-active': {
    backgroundColor: 'var(--bg-selected, #e8f0fe) !important',
    color: 'var(--accent-color, #4572DE) !important'
  },

  '.cm-floating-toolbar-btn-bold': {
    fontWeight: '700'
  },

  '.cm-floating-toolbar-btn-italic': {
    fontStyle: 'italic',
    fontFamily: 'Georgia, "Times New Roman", serif'
  },

  '.cm-floating-toolbar-btn-strikethrough': {
    textDecoration: 'line-through'
  },

  '.cm-floating-toolbar-btn-code': {
    fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
    fontSize: '12px'
  },

  // Dark mode support through CSS variables
  '@media (prefers-color-scheme: dark)': {
    '.cm-floating-toolbar': {
      backgroundColor: 'var(--bg-primary, #1e1e1e)',
      borderColor: 'var(--border-color, #3d3d3d)',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
    }
  }
})

/**
 * Complete floating toolbar extension
 */
export function floatingToolbarExtension() {
  return [
    floatingToolbarPlugin,
    floatingToolbarKeymap,
    floatingToolbarStyles,
  ]
}

// Export individual components for testing
export {
  TOOLBAR_BUTTONS,
  isFormatActive,
  toggleMark,
  insertLink
}
