// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  bindChaoxingNavigationClose,
  configureToolboxFrame,
  findChaoxingNavigationHost,
  installToolboxFrameStyle,
  setToolboxFrameState,
} from './toolbox-frame'

const FRAME_ID = 'dbkang-toolbox-frame'
const STYLE_ID = 'dbkang-toolbox-style'

describe('persistent toolbox frame', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('keeps the same iframe and source while toggling visibility', () => {
    installToolboxFrameStyle(document, FRAME_ID, STYLE_ID)
    const frame = document.createElement('iframe')
    frame.id = FRAME_ID
    frame.src = 'https://toolbox.example.test/toolbox/?tab=music'
    configureToolboxFrame(frame)
    document.body.append(frame)
    const originalSource = frame.src

    setToolboxFrameState(frame, true)
    expect(getComputedStyle(frame).visibility).toBe('visible')
    setToolboxFrameState(frame, false)

    expect(frame.isConnected).toBe(true)
    expect(frame.src).toBe(originalSource)
    expect(getComputedStyle(frame).display).toBe('block')
    expect(getComputedStyle(frame).visibility).toBe('hidden')
    expect(getComputedStyle(frame).pointerEvents).toBe('none')
  })

  it('closes from native navigation without intercepting its click', () => {
    const navigationHost = document.createElement('ul')
    const nativeNavigation = document.createElement('li')
    const toolboxNavigation = document.createElement('li')
    navigationHost.append(nativeNavigation, toolboxNavigation)
    document.body.append(navigationHost)
    let closeCount = 0
    let nativeClickCount = 0
    nativeNavigation.addEventListener('click', () => { nativeClickCount += 1 })
    bindChaoxingNavigationClose(navigationHost, toolboxNavigation, () => { closeCount += 1 })

    nativeNavigation.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    toolboxNavigation.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))

    expect(closeCount).toBe(1)
    expect(nativeClickCount).toBe(1)
  })

  it.each([
    ['student', 'stuNavigationList'],
    ['teacher', 'tchNavigationList'],
  ])('finds the %s course navigation list', (_role, navigationClass) => {
    document.body.innerHTML = `
      <div class="nav-content ${navigationClass}">
        <ul><li data="sanitized-course-module"></li></ul>
      </div>
    `

    const navigationHost = findChaoxingNavigationHost(document)

    expect(navigationHost).toBe(document.querySelector(`.${navigationClass} > ul`))
  })
})
