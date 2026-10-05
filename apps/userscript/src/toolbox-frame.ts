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
}`
  const styleHost = document.head || document.documentElement
  styleHost.append(style)
}

export function configureToolboxFrame(frame: HTMLIFrameElement): void {
  Object.assign(frame.style, {
    border: '0',
    background: '#f6f8fb',
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
