import type { NativeLook } from '@dbkang/shared'
import { DEFAULT_NATIVE_LOOK } from '@dbkang/shared'

/** 菜单项里可能承载文字的标签，用于挑选排版样本。 */
const TEXT_CANDIDATE_SELECTOR = 'a, span, p, div'

/** 留白上限：超过这个值多半是量到了容器内边距而非菜单列空隙。 */
const MAX_INSET_LEFT_PX = 40

/**
 * 从原生页面实测排版特征，供工具箱顶部菜单列复刻同样的字体与字号。
 *
 * 原生页签所在的 iframe 是跨域的，工具箱读不到它的样式，
 * 因此在可读的外层文档里取一个真实菜单项作为排版样本，
 * 再交给工具箱套用。样本与 `navigation-button.ts` 给菜单按钮排版时同源，
 * 两处看起来才是同一套字体。
 *
 * @param navigationHost 左侧菜单容器
 * @param reference 原生课程内容 iframe，其父容器的左内边距即菜单列空隙
 * @param fallback 读不到时的兜底值
 */
export function resolveNativeLook(
  navigationHost: HTMLElement | null,
  reference: HTMLElement | null = null,
  fallback: NativeLook = DEFAULT_NATIVE_LOOK,
): NativeLook {
  const sample = findTextSample(navigationHost)
  const view = navigationHost?.ownerDocument.defaultView
    ?? reference?.ownerDocument.defaultView
    ?? null
  const computed = sample && view ? view.getComputedStyle(sample) : null
  return {
    fontFamily: pick(computed?.fontFamily, fallback.fontFamily),
    fontSize: pickLength(computed?.fontSize, fallback.fontSize),
    fontWeight: pick(computed?.fontWeight, fallback.fontWeight),
    lineHeight: pick(computed?.lineHeight, fallback.lineHeight),
    color: pick(computed?.color, fallback.color),
    navInsetLeft: resolveInsetLeft(reference, view, fallback.navInsetLeft),
  }
}

/**
 * 找到菜单项里的文字载体。
 * 优先 `<a>`（学习通菜单的常规结构），没有则回退到菜单项本身。
 */
function findTextSample(navigationHost: HTMLElement | null): HTMLElement | null {
  if (!navigationHost) return null
  const item = navigationHost.querySelector<HTMLElement>('li:not([data-dbkang-nav-item])')
  if (!item) return null
  for (const selector of TEXT_CANDIDATE_SELECTOR) {
    const node = item.querySelector<HTMLElement>(selector)
    if (node && node.textContent?.trim()) return node
  }
  return item
}

/**
 * 顶部菜单列左端的空隙取自原生内容容器的左内边距。
 * 容器的内边距正是卡片四周的留白，菜单列会贴着卡片内缘对齐，
 * 因此它就是原生「设置」页卡菜单列左侧那段空隙。
 */
function resolveInsetLeft(
  reference: HTMLElement | null,
  view: Window | null,
  fallback: string,
): string {
  const parent = reference?.parentElement
  if (!parent || !view) return fallback
  const value = view.getComputedStyle(parent).paddingLeft
  const pixels = Number.parseFloat(value)
  if (!Number.isFinite(pixels) || pixels <= 0) return fallback
  // 内边距过大时多半不是菜单列空隙，收敛到一个视觉合理的范围。
  return `${Math.min(pixels, MAX_INSET_LEFT_PX)}px`
}

function pick(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value : fallback
}

function pickLength(value: string | undefined, fallback: string): string {
  return value && /^-?[\d.]+(px|em|rem|%|pt)$/.test(value.trim()) ? value.trim() : fallback
}