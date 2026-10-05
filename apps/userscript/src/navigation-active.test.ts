// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PANEL_LOOK,
  captureNativeActiveLook,
  clearNativeActiveLook,
  findActiveNavigationItems,
  resolveNativePanelLook,
  restoreNativeActiveLook,
} from './navigation-active'

describe('findActiveNavigationItems', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it.each([
    ['active'],
    ['on'],
    ['nav-item-active'],
    ['current'],
    ['selected'],
  ])('detects %s as the active marker', (className) => {
    const host = buildMenu(`<li class="${className}"><a href="#1">章节一</a></li>`)

    // 只有带高亮标记的 <li> 自身命中，其 <a> 子元素不带标记
    expect(findActiveNavigationItems(host).map((node) => node.tagName)).toEqual(['LI'])
  })

  it('ignores an inactive menu', () => {
    const host = buildMenu('<li><a href="#1">章节一</a></li><li><a href="#2">章节二</a></li>')

    expect(findActiveNavigationItems(host)).toHaveLength(0)
  })

  it('treats aria-current as active', () => {
    const host = buildMenu('<li aria-current="page"><a href="#1">章节一</a></li>')

    expect(findActiveNavigationItems(host).map((node) => node.tagName)).toContain('LI')
  })

  it('treats an inline background as active', () => {
    const host = buildMenu('<li style="background-color: rgb(240, 240, 240)"><a>x</a></li>')

    expect(findActiveNavigationItems(host).length).toBeGreaterThan(0)
  })

  it('does not treat a transparent background as active', () => {
    const host = buildMenu('<li style="background-color: transparent"><a>x</a></li>')

    expect(findActiveNavigationItems(host)).toHaveLength(0)
  })

  it('never reports the toolbox item itself', () => {
    const host = buildMenu('<li><a href="#1">章节一</a></li>')
    const toolboxItem = document.createElement('li')
    toolboxItem.dataset.dbkangNavItem = 'true'
    toolboxItem.dataset.active = 'true'
    toolboxItem.classList.add('dbkang-nav-active')
    host.append(toolboxItem)

    expect(findActiveNavigationItems(host, toolboxItem)).toHaveLength(0)
  })
})

describe('clear and restore native active look', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    computedStyleStubs.clear()
  })

  it('removes the active class and restores it afterwards', () => {
    const host = buildMenu('<li class="active"><a href="#1">章节一</a></li>')
    const item = host.querySelector('li') as HTMLElement

    const snapshots = clearNativeActiveLook(findActiveNavigationItems(host))

    expect(item.classList.contains('active')).toBe(false)
    restoreNativeActiveLook(snapshots)
    expect(item.classList.contains('active')).toBe(true)
  })

  it('removes and restores an inline background', () => {
    const host = buildMenu('<li class="on" style="background: rgb(1, 2, 3)"><a>x</a></li>')
    const item = host.querySelector('li') as HTMLElement

    const snapshots = clearNativeActiveLook(findActiveNavigationItems(host))
    expect(item.style.background).toBe('')

    restoreNativeActiveLook(snapshots)
    expect(item.style.background).toBe('rgb(1, 2, 3)')
  })

  it('removes and restores aria-current', () => {
    const host = buildMenu('<li aria-current="page" class="active"><a>x</a></li>')
    const item = host.querySelector('li') as HTMLElement

    const snapshots = clearNativeActiveLook(findActiveNavigationItems(host))
    expect(item.hasAttribute('aria-current')).toBe(false)

    restoreNativeActiveLook(snapshots)
    expect(item.getAttribute('aria-current')).toBe('page')
  })

  it('keeps unrelated class names intact', () => {
    const host = buildMenu('<li class="menu-item active"><a>x</a></li>')
    const item = host.querySelector('li') as HTMLElement

    clearNativeActiveLook(findActiveNavigationItems(host))

    expect(item.classList.contains('menu-item')).toBe(true)
  })

  it('skips nodes that left the document when restoring', () => {
    const host = buildMenu('<li class="active"><a>x</a></li>')
    const item = host.querySelector('li') as HTMLElement
    const snapshots = clearNativeActiveLook(findActiveNavigationItems(host))

    item.remove()
    expect(() => restoreNativeActiveLook(snapshots)).not.toThrow()
  })

  it('captures the highlight appearance of the active item', () => {
    const host = buildMenu('<li class="active"><a href="#1">章节一</a></li>')
    const link = host.querySelector('a') as HTMLElement
    stubComputedStyle(link, { backgroundColor: 'rgb(47, 111, 228)', color: 'rgb(255, 255, 255)' })

    const look = captureNativeActiveLook(findActiveNavigationItems(host))

    expect(look?.backgroundColor).toBe('rgb(47, 111, 228)')
    expect(look?.color).toBe('rgb(255, 255, 255)')
  })

  it('returns null when no item is active', () => {
    const host = buildMenu('<li><a>x</a></li>')

    expect(captureNativeActiveLook(findActiveNavigationItems(host))).toBeNull()
  })
})

describe('resolveNativePanelLook', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    computedStyleStubs.clear()
  })

  it('falls back to a neutral panel when there is no native container', () => {
    expect(resolveNativePanelLook(null)).toEqual(DEFAULT_PANEL_LOOK)
  })

  it('reads the canvas, surface and radius from the native container', () => {
    // 真实结构：灰色容器带内边距，iframe 直接放在其中
    document.body.innerHTML = `
      <div id="wrap" style="background-color: rgb(240, 242, 245); padding: 30px;">
        <iframe id="frame_content-1"></iframe>
      </div>
    `
    const wrap = document.getElementById('wrap') as HTMLElement
    const frame = document.getElementById('frame_content-1') as HTMLElement
    stubComputedStyle(wrap, {
      backgroundColor: 'rgb(240, 242, 245)',
      paddingTop: '30px',
      borderTopLeftRadius: '5px',
    })
    stubComputedStyle(frame, { backgroundColor: 'rgb(255, 255, 255)' })

    const look = resolveNativePanelLook(frame)

    expect(look.canvas).toBe('rgb(240, 242, 245)')
    expect(look.surface).toBe('rgb(255, 255, 255)')
    expect(look.radius).toBe('5px')
    expect(look.padding).toBe('30px')
  })

  it('falls back to measured defaults when the container has no padding', () => {
    document.body.innerHTML = '<div><iframe id="f"></iframe></div>'
    const frame = document.getElementById('f') as HTMLElement

    expect(resolveNativePanelLook(frame)).toEqual(DEFAULT_PANEL_LOOK)
  })
})

function buildMenu(inner: string): HTMLElement {
  const host = document.createElement('ul')
  host.innerHTML = inner
  document.body.append(host)
  return host
}

/**
 * jsdom 不做完整层叠，展开后的长属性会返回空串，这里直接桩掉计算样式。
 * 用模块级注册表累计桩值，避免多次 `vi.spyOn` 相互覆盖。
 */
const computedStyleStubs = new Map<HTMLElement, Record<string, string>>()

function stubComputedStyle(node: HTMLElement, values: Record<string, string>): void {
  computedStyleStubs.set(node, { ...computedStyleStubs.get(node), ...values })
  const original = getComputedStyle
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (element: Element | null, pseudo?: string | null) => {
      const stub = element ? computedStyleStubs.get(element as HTMLElement) : undefined
      if (!stub) return original(element as Element, pseudo ?? undefined)
      // 生产代码既用 `style.backgroundColor` 直接取值，也用 `getPropertyValue()`，
      // 桩件两种形式都要支持。
      return {
        ...stub,
        getPropertyValue: (property: string) => stub[property] ?? '',
      } as unknown as CSSStyleDeclaration
    },
  )
}

function stubBoundingRect(node: HTMLElement, size: { width: number; height: number }): void {
  node.getBoundingClientRect = () =>
    ({
      x: 0, y: 0, top: 0, left: 0, right: size.width, bottom: size.height,
      width: size.width, height: size.height, toJSON: () => size,
    }) as DOMRect
}
