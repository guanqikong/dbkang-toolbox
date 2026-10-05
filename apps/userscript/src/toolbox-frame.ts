import type { NativePanelLook } from './navigation-active'

export const TOOLBOX_FRAME_Z_INDEX = '2147482000'

// 已由真实页面验证的容器选择器。
const KNOWN_NAVIGATION_SELECTORS = [
  '[data-dbkang-nav]',
  '.stuNavigationList > ul',
  '.tchNavigationList > ul',
  '.nav-content > ul',
]

// 新版 fanyav3 的类名不稳定，改用子串匹配覆盖 nav/menu/sidebar/catalog 等常见命名。
const NAVIGATION_CLASS_PATTERN =
  '[class*="nav" i], [class*="menu" i], [class*="sidebar" i], [class*="catalog" i], [class*="chapter" i]'

const NAVIGATION_LAYOUT_SELECTOR = `ul, nav, aside, ${NAVIGATION_CLASS_PATTERN}`

// 左侧菜单的几何特征。阈值留有余量，避免把课程内容区误判成菜单。
const NAVIGATION_EDGE_TOLERANCE = 56
const NAVIGATION_MIN_WIDTH = 56
const NAVIGATION_MAX_WIDTH = 360
const NAVIGATION_MIN_HEIGHT = 120
const NAVIGATION_MIN_ITEMS = 3

export function findChaoxingNavigationHost(document: Document): HTMLElement | null {
  for (const selector of KNOWN_NAVIGATION_SELECTORS) {
    const node = document.querySelector<HTMLElement>(selector)
    if (node) return node
  }
  return findNavigationByLayout(document)
}

/**
 * 学习通的新旧课程页都把菜单放在页面左缘。与其猜测类名，不如按几何特征定位：
 * 贴左、窄、纵向拉得开、并且含有若干可点击条目。
 */
function findNavigationByLayout(document: Document): HTMLElement | null {
  let best: { node: HTMLElement; itemCount: number; area: number } | null = null
  for (const node of document.querySelectorAll<HTMLElement>(NAVIGATION_LAYOUT_SELECTOR)) {
    if (node.closest('[data-dbkang-root]')) continue
    const rect = node.getBoundingClientRect()
    if (rect.width < NAVIGATION_MIN_WIDTH || rect.width > NAVIGATION_MAX_WIDTH) continue
    if (rect.height < NAVIGATION_MIN_HEIGHT) continue
    if (rect.left > NAVIGATION_EDGE_TOLERANCE) continue
    const itemCount = node.querySelectorAll('a, button, li').length
    if (itemCount < NAVIGATION_MIN_ITEMS) continue
    const area = rect.width * rect.height
    if (
      best === null
      || itemCount > best.itemCount
      || (itemCount === best.itemCount && area < best.area)
    ) {
      best = { node, itemCount, area }
    }
  }
  return best?.node ?? null
}

export function installToolboxFrameStyle(
  document: Document,
  frameId: string,
  styleId: string,
  navId: string,
): void {
  if (document.getElementById(styleId)) return
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
#${frameId}[data-dbkang-state="closed"] {
  display: block !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
#${frameId}[data-dbkang-state="open"] {
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}
#${navId}[data-dbkang-nav-item]:hover {
  background-color: rgba(0, 0, 0, 0.04);
}
/* 标记继承相邻菜单项的文字颜色与字号，使其看起来就是原生图标 */
.dbkang-nav-mark {
  display: inline-block;
  margin-right: 6px;
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
  color: inherit;
  opacity: 0.75;
  vertical-align: baseline;
}
.dbkang-nav-label {
  font-weight: inherit;
}
[data-dbkang-nav-item][data-active="true"] .dbkang-nav-mark {
  opacity: 1;
}
.dbkang-nav-fallback {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 14px;
  border: 0;
  color: #334155;
  font: 14px system-ui, sans-serif;
  background: transparent;
  cursor: pointer;
  list-style: none;
}
.dbkang-nav-fallback .dbkang-nav-mark {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  margin-right: 0;
  border-radius: 6px;
  color: #fff;
  font-size: 9px;
  background: #2f6fe4;
  opacity: 1;
}
`
  const styleHost = document.head || document.documentElement
  styleHost.append(style)
}

/**
 * 给工具箱窗口套上与原生页卡一致的视觉：灰底画布 + 白色圆角卡片。
 *
 * 原生课程内容区是「灰色画布 + 白色圆角卡片」，卡片四周有一圈灰色留白。
 * 我们的 iframe 叠在原生 iframe 之上，若用 margin 做留白，透出的是原生 iframe
 * 的白底而非灰底。因此改为：iframe 自身铺灰底画布，白色卡片由内部
 * `.app-shell` 用 margin 内缩，灰底从卡片四周透出来形成留白。
 */
export function applyNativePanelLook(
  frame: HTMLIFrameElement,
  look: NativePanelLook,
): void {
  Object.assign(frame.style, {
    border: '0',
    // 灰底画布：卡片 margin 区域透出的就是这一层
    background: look.canvas,
    borderRadius: look.radius,
    boxSizing: 'border-box',
    overflow: 'hidden',
  })
}

export function configureToolboxFrame(frame: HTMLIFrameElement): void {
  Object.assign(frame.style, {
    border: '0',
    background: '#ffffff',
    zIndex: TOOLBOX_FRAME_Z_INDEX,
  })
  setToolboxFrameState(frame, false)
}

export function setToolboxFrameState(frame: HTMLIFrameElement, open: boolean): void {
  frame.dataset.dbkangState = open ? 'open' : 'closed'
  frame.setAttribute('aria-hidden', String(!open))
}

export function bindChaoxingNavigationClose(
  navigationHost: HTMLElement,
  toolboxNavigation: HTMLElement,
  close: () => void,
): void {
  const closeFromNativeNavigation = (event: Event): void => {
    if (event.composedPath().includes(toolboxNavigation)) return
    close()
  }
  navigationHost.addEventListener('pointerdown', closeFromNativeNavigation, true)
  navigationHost.addEventListener('click', closeFromNativeNavigation, true)
}
