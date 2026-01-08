// PDFViewerWrapper.js - Encapsulates PDF.js PDFViewer setup with virtualization
// Provides page lifecycle events for highlight system integration

import * as pdfjsLib from 'pdfjs-dist'
import { EventBus, PDFViewer } from 'pdfjs-dist/web/pdf_viewer'

// Import PDF.js viewer CSS for proper styling
import 'pdfjs-dist/web/pdf_viewer.css'

// Configure PDF.js worker - use local worker to avoid CDN issues
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.js'

/**
 * Wrapper around PDF.js PDFViewer that provides:
 * - Built-in virtualization (only renders visible pages)
 * - Page lifecycle events for highlight integration
 * - Simple API for zoom and document management
 */
export class PDFViewerWrapper {
  /**
   * Create a new PDFViewerWrapper
   * @param {HTMLElement} containerElement - The container element for the viewer
   */
  constructor(containerElement) {
    this.container = containerElement
    this.eventBus = null
    this.viewer = null
    this.pdfDocument = null
  }

  /**
   * Initialize the PDF viewer
   * Creates the PDFViewer instance with virtualization enabled
   */
  async initialize() {
    // Prevent duplicate initialization
    if (this.viewer) {
      return
    }

    // Create event bus for internal PDF.js communication
    this.eventBus = new EventBus()

    // Create viewer with virtualization enabled
    this.viewer = new PDFViewer({
      container: this.container,
      eventBus: this.eventBus,
      textLayerMode: 2,           // Enable text layer for selection
      annotationMode: 0,          // Disable built-in annotations (we use our own highlights)
      removePageBorders: false    // Keep page shadows for visual separation
    })

    // Hook into page lifecycle events for highlight system
    this.eventBus.on('pagerendered', this._onPageRendered.bind(this))
    this.eventBus.on('pagesdestroy', this._onPagesDestroy.bind(this))
  }

  /**
   * Load a PDF document
   * @param {Object} pdfData - PDF data object (url, data, etc.)
   * @returns {Promise<number>} Number of pages in the document
   */
  async loadDocument(pdfData) {
    const loadingTask = pdfjsLib.getDocument(pdfData)
    this.pdfDocument = await loadingTask.promise
    this.viewer.setDocument(this.pdfDocument)
    return this.pdfDocument.numPages
  }

  /**
   * Set the zoom scale
   * @param {number} scale - New scale value
   */
  setScale(scale) {
    if (this.viewer) {
      this.viewer.currentScale = scale
    }
  }

  /**
   * Get the current zoom scale
   * @returns {number} Current scale
   */
  get currentScale() {
    return this.viewer ? this.viewer.currentScale : 1
  }

  /**
   * Handle page rendered event from PDF.js
   * Dispatches custom event for highlight system to restore highlights
   * @param {Object} evt - PDF.js pagerendered event
   * @private
   */
  _onPageRendered(evt) {
    window.dispatchEvent(new CustomEvent('pdf-page-rendered', {
      detail: {
        pageNumber: evt.pageNumber,
        pageElement: evt.source.div
      }
    }))
  }

  /**
   * Handle pages destroy event from PDF.js
   * Called when pages are being removed from DOM (virtualized out)
   * @private
   */
  _onPagesDestroy() {
    window.dispatchEvent(new CustomEvent('pdf-pages-cleanup'))
  }

  /**
   * Clean up resources
   * Call when closing the PDF tab
   */
  destroy() {
    if (this.viewer) {
      this.viewer.cleanup()
    }
    if (this.pdfDocument) {
      this.pdfDocument.destroy()
    }
  }
}
