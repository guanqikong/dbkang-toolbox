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
    installToolboxFrameStyle(document, FRAME_ID, STYLE_ID, 'dbkang-toolbox-nav')
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

  it('falls back to layout when the menu uses an unknown class name', () => {
    document.body.innerHTML = `
      <aside class="x7Qk2a"><a href="#1">章节一</a><a href="#2">章节二</a><a href="#3">章节三</a></aside>
      <main class="x7Qk9b"><p>课程内容</p></main>
    `
    const menu = document.querySelector('aside') as HTMLElement
    stubRect(menu, { left: 0, width: 220, height: 640 })

    expect(findChaoxingNavigationHost(document)).toBe(menu)
  })

  it('ignores wide content columns that merely sit near the left edge', () => {
    document.body.innerHTML = `
      <div class="panel"><a href="#1">一</a><a href="#2">二</a><a href="#3">三</a><a href="#4">四</a></div>
    `
    const panel = document.querySelector('div') as HTMLElement
    stubRect(panel, { left: 8, width: 960, height: 640 })

    expect(findChaoxingNavigationHost(document)).toBeNull()
  })

  it('ignores a short left rail that has too few menu items', () => {
    document.body.innerHTML = `
      <div class="rail"><a href="#1">返回</a></div>
    `
    const rail = document.querySelector('div') as HTMLElement
    stubRect(rail, { left: 0, width: 200, height: 600 })

    expect(findChaoxingNavigationHost(document)).toBeNull()
  })
})

function stubRect(
  node: HTMLElement,
  rect: { left: number; width: number; height: number },
): void {
  node.getBoundingClientRect = () =>
    ({ ...rect, top: 0, right: rect.left + rect.width, bottom: rect.height, x: rect.left, y: 0, toJSON: () => rect }) as DOMRect
}
