import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

import { blockWidgetExtension } from './formatting-extension.js'

describe('formatting-extension code block widgets', () => {
  let pane
  let container
  let view

  beforeEach(() => {
    pane = document.createElement('div')
    container = document.createElement('div')
    pane.appendChild(container)
    document.body.appendChild(pane)

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: jest.fn().mockResolvedValue() },
      configurable: true
    })
  })

  afterEach(() => {
    if (view) {
      view.destroy()
      view = null
    }

    pane.remove()
  })

  test('stops mouse events from bubbling out of rendered code blocks', () => {
    const doc = '```sh\necho hello\n```'
    const state = EditorState.create({
      doc,
      extensions: [blockWidgetExtension]
    })

    view = new EditorView({
      state,
      parent: container
    })

    const codeBlock = container.querySelector('.cm-code-block-formatted')
    expect(codeBlock).toBeTruthy()

    const bubbleSpy = jest.fn()
    pane.addEventListener('mousedown', bubbleSpy)
    pane.addEventListener('mouseup', bubbleSpy)
    pane.addEventListener('click', bubbleSpy)

    codeBlock.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    codeBlock.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    codeBlock.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(bubbleSpy).not.toHaveBeenCalled()
  })

  test('does not rebuild rendered code blocks on pure selection changes', () => {
    const doc = '```js\nconst value = 1\n```'
    const state = EditorState.create({
      doc,
      extensions: [blockWidgetExtension]
    })

    view = new EditorView({
      state,
      parent: container
    })

    const initialCodeBlock = container.querySelector('.cm-code-block-formatted')
    expect(initialCodeBlock).toBeTruthy()

    view.dispatch({
      selection: { anchor: doc.length, head: doc.length }
    })

    const nextCodeBlock = container.querySelector('.cm-code-block-formatted')
    expect(nextCodeBlock).toBe(initialCodeBlock)
  })
})
