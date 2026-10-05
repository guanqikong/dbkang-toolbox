// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavigationButton } from './navigation-button'

describe('createNavigationButton', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('copies padding, border and layout from the sibling menu item', () => {
    const host = buildMenu()
    stubComputedStyle(host.querySelector('li') as HTMLElement, {
      display: 'flex',
      alignItems: 'center',
      paddingTop: '10px',
      paddingRight: '16px',
      paddingBottom: '10px',
      paddingLeft: '16px',
      borderBottom: '1px solid rgb(238, 238, 238)',
    })

    const item = createNavigationButton(host)

    expect(item.style.display).toBe('flex')
    expect(item.style.alignItems).toBe('center')
    expect(item.style.paddingTop).toBe('10px')
    expect(item.style.paddingRight).toBe('16px')
    expect(item.style.paddingBottom).toBe('10px')
    expect(item.style.paddingLeft).toBe('16px')
    expect(item.style.borderBottomWidth).toBe('1px')
    expect(item.style.borderBottomStyle).toBe('solid')
    expect(item.style.borderBottomColor).toBe('rgb(238, 238, 238)')
  })

  it('copies typography from the sibling link rather than the list item', () => {
    const host = buildMenu()
    const link = host.querySelector('a') as HTMLElement
    stubComputedStyle(link, {
      fontSize: '15px',
      fontWeight: '600',
      color: 'rgb(51, 51, 51)',
      lineHeight: '20px',
      textDecoration: 'none',
    })

    const content = createNavigationButton(host).querySelector('a') as HTMLElement

    expect(content.style.fontSize).toBe('15px')
    expect(content.style.fontWeight).toBe('600')
    expect(content.style.color).toBe('rgb(51, 51, 51)')
    expect(content.style.lineHeight).toBe('20px')
    expect(content.style.textDecoration).toBe('none')
  })

  it('falls back to the list item typography when the menu has no link', () => {
    const host = buildMenu({ hasLink: false })
    stubComputedStyle(host.querySelector('li') as HTMLElement, { color: 'rgb(68, 68, 68)' })

    const content = createNavigationButton(host).querySelector('span') as HTMLElement

    expect(content.style.color).toBe('rgb(68, 68, 68)')
  })

  it('mirrors the sibling tag so host tag selectors still match', () => {
    expect(createNavigationButton(buildMenu()).firstElementChild?.tagName).toBe('A')
    expect(createNavigationButton(buildMenu({ hasLink: false })).firstElementChild?.tagName)
      .toBe('SPAN')
  })

  it('never renders a list bullet', () => {
    const item = createNavigationButton(buildMenu())
    expect(item.style.listStyle).toBe('none')
  })

  it('never copies overflow or a fixed height, which would clip the label', () => {
    const host = buildMenu()
    stubComputedStyle(host.querySelector('li') as HTMLElement, {
      overflow: 'hidden',
      height: '30px',
      paddingTop: '4px',
      paddingRight: '4px',
      paddingBottom: '4px',
      paddingLeft: '4px',
    })

    const item = createNavigationButton(host)

    expect(item.style.overflow).toBe('')
    expect(item.style.height).toBe('')
  })

  it('marks the inserted item so it is excluded from later sibling lookups', () => {
    const host = buildMenu()
    const item = createNavigationButton(host)
    host.append(item)

    expect(item.getAttribute('data-dbkang-nav-item')).toBe('true')
    expect(host.querySelectorAll('li:not([data-dbkang-nav-item])')).toHaveLength(1)
  })

  it('falls back to its own styles when the menu has no sibling item', () => {
    const host = document.createElement('div')
    document.body.append(host)

    const item = createNavigationButton(host)

    expect(item.querySelector('.dbkang-nav-label')?.textContent).toBe('阿康工具箱')
    expect(item.classList.contains('dbkang-nav-fallback')).toBe(true)
  })

  it('does not add the fallback class inside a native list', () => {
    expect(createNavigationButton(buildMenu()).classList.contains('dbkang-nav-fallback'))
      .toBe(false)
  })
})

/**
 * jsdom 的 `getComputedStyle` 不做完整层叠，展开后的长属性（如 `paddingTop`）
 * 一律返回空字符串。真实浏览器没有这个限制，因此测试直接桩掉计算样式。
 */
function stubComputedStyle(node: HTMLElement, values: Record<string, string>): void {
  const original = getComputedStyle
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (element: Element | null, pseudo?: string | null) => {
      if (element !== node) return original(element as Element, pseudo ?? undefined)
      return {
        getPropertyValue: (property: string) => values[property] ?? '',
      } as CSSStyleDeclaration
    },
  )
}

function buildMenu(options: { hasLink?: boolean } = {}): HTMLElement {
  const host = document.createElement('ul')
  const item = document.createElement('li')
  if (options.hasLink ?? true) {
    const link = document.createElement('a')
    link.href = '#chapter-1'
    link.textContent = '章节一'
    item.append(link)
  } else {
    item.textContent = '章节一'
  }
  host.append(item)
  document.body.append(host)
  return host
}