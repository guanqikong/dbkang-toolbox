// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_NATIVE_LOOK } from '@dbkang/shared'
import { resolveNativeLook } from './navigation-typography'

describe('resolveNativeLook', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    computedStyleStubs.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('falls back to the shared defaults when there is no native menu', () => {
    expect(resolveNativeLook(null)).toEqual(DEFAULT_NATIVE_LOOK)
  })

  it('reads typography from a native menu item link', () => {
    const host = buildMenu('<li><a href="#1">章节一</a></li>')
    const link = host.querySelector('a') as HTMLElement
    stubComputedStyle(link, {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '15px',
      fontWeight: '600',
      lineHeight: '22px',
      color: 'rgb(51, 51, 51)',
    })

    const look = resolveNativeLook(host)

    expect(look.fontFamily).toBe('"Microsoft YaHei", sans-serif')
    expect(look.fontSize).toBe('15px')
    expect(look.fontWeight).toBe('600')
    expect(look.lineHeight).toBe('22px')
    expect(look.color).toBe('rgb(51, 51, 51)')
  })

  it('never samples the toolbox menu item itself', () => {
    const host = buildMenu('<li><a href="#1">章节一</a></li>')
    const toolboxItem = document.createElement('li')
    toolboxItem.dataset.dbkangNavItem = 'true'
    toolboxItem.textContent = '阿康工具箱'
    host.prepend(toolboxItem)

    const look = resolveNativeLook(host)

    expect(look.fontSize).toBe(DEFAULT_NATIVE_LOOK.fontSize)
  })

  it('reads the left inset from the native content container padding', () => {
    const host = buildMenu('<li><a href="#1">章节一</a></li>')
    const wrap = document.createElement('div')
    const frame = document.createElement('iframe')
    wrap.append(frame)
    document.body.append(wrap)
    stubComputedStyle(wrap, { paddingLeft: '24px' })

    expect(resolveNativeLook(host, frame).navInsetLeft).toBe('24px')
  })

  it('caps an implausibly large inset so the menu column stays usable', () => {
    const host = buildMenu('<li><a href="#1">章节一</a></li>')
    const wrap = document.createElement('div')
    const frame = document.createElement('iframe')
    wrap.append(frame)
    document.body.append(wrap)
    stubComputedStyle(wrap, { paddingLeft: '320px' })

    expect(resolveNativeLook(host, frame).navInsetLeft).toBe('40px')
  })

  it('falls back when the container has no left padding', () => {
    const host = buildMenu('<li><a href="#1">章节一</a></li>')
    const wrap = document.createElement('div')
    const frame = document.createElement('iframe')
    wrap.append(frame)
    document.body.append(wrap)
    stubComputedStyle(wrap, { paddingLeft: '0px' })

    expect(resolveNativeLook(host, frame).navInsetLeft).toBe(DEFAULT_NATIVE_LOOK.navInsetLeft)
  })

  it('ignores a font size that is not a usable length', () => {
    const host = buildMenu('<li><a href="#1">章节一</a></li>')
    const link = host.querySelector('a') as HTMLElement
    stubComputedStyle(link, { fontSize: 'normal' })

    expect(resolveNativeLook(host).fontSize).toBe(DEFAULT_NATIVE_LOOK.fontSize)
  })

  it('keeps `normal` line height, which is a legitimate computed value', () => {
    const host = buildMenu('<li><a href="#1">章节一</a></li>')
    const link = host.querySelector('a') as HTMLElement
    stubComputedStyle(link, { lineHeight: 'normal' })

    expect(resolveNativeLook(host).lineHeight).toBe('normal')
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
 */
const computedStyleStubs = new Map<HTMLElement, Record<string, string>>()

function stubComputedStyle(node: HTMLElement, values: Record<string, string>): void {
  computedStyleStubs.set(node, { ...computedStyleStubs.get(node), ...values })
  const original = getComputedStyle
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (element: Element | null, pseudo?: string | null) => {
      const stub = element ? computedStyleStubs.get(element as HTMLElement) : undefined
      if (!stub) return original(element as Element, pseudo ?? undefined)
      return {
        ...stub,
        getPropertyValue: (property: string) => stub[property] ?? '',
      } as unknown as CSSStyleDeclaration
    },
  )
}