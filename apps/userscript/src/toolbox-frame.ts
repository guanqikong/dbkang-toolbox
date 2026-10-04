export const TOOLBOX_FRAME_Z_INDEX = '2147482000'

export function findChaoxingNavigationHost(document: Document): HTMLElement | null {
  const selectors = [
    '[data-dbkang-nav]',
    // 旧版页面选择器
    '.stuNavigationList > ul',
    '.tchNavigationList > ul',
    '.nav-content > ul',
    '.course-nav',
    '.course_nav',
    '.nav-tabs',
    // 新版页面选择器 (mooc2-ans-vue)
    '.fanya-nav-list',
    '.fanya-nav > ul',
    '.nav-list',
    '.menu-list',
    '.sidebar-menu',
    '.left-nav',
    '.left-menu',
    '.course-menu',
    '.chapter-list',
    '.chapter-list > ul',
    '.catalog-list',
    '.catalog-list > ul',
    '.unit-list',
    '.unit-list > ul',
    '.section-list',
    '.section-list > ul',
    '.fanya-course-nav',
    '.fanya-course-menu',
    '.fanya-sidebar',
    '.fanya-left-nav',
    // 通用选择器
    '.nav',
    '.menu',
    '.sidebar',
  ]
  for (const selector of selectors) {
    const node = document.querySelector<HTMLElement>(selector)
    if (node) return node
  }
  return null
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
