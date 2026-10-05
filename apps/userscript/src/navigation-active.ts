/**
 * 学习通新旧课程页的菜单都用「高亮类名」标记当前选中项，但类名各版本不同
 * （`active` / `on` / `cur` / `selected` …），且高亮通常由 CSS 类驱动，
 * 而非内联样式。因此这里用模式匹配找出「看起来处于选中态」的元素。
 *
 * 工具箱按钮插入在同一个 `<ul>` 里，点击它时必须把原生项的高亮摘掉，
 * 否则会出现两个同时高亮的项；反向点击原生项时也要清掉工具箱自己的高亮。
 */
const ACTIVE_CLASS_PATTERN = /(^|[-_])(active|on|current|selected|cur)([-_]|$)/i

/** 可能承载选中态的元素标签。 */
const ACTIVE_ITEM_SELECTOR = 'li, a, span, div'

/** 原生高亮被临时摘除前的快照，用于关闭工具箱时原样还原。 */
export interface NativeActiveSnapshot {
  node: HTMLElement
  classes: string[]
  attributes: Record<string, string>
  background: string
}

/**
 * 找出导航容器内当前处于高亮状态的原生菜单项。
 *
 * 判定依据（任一命中即视为高亮）：
 * 1. 类名匹配 `active` / `on` / `current` 等常见高亮命名；
 * 2. 带 `aria-current` / `aria-selected` 无障碍属性；
 * 3. 内联样式里写了非透明的背景色。
 *
 * @param navigationHost 左侧菜单容器
 * @param exclude 需要跳过的元素（通常是工具箱自己的菜单项）
 */
export function findActiveNavigationItems(
  navigationHost: HTMLElement,
  exclude?: HTMLElement | null,
): HTMLElement[] {
  const items: HTMLElement[] = []
  for (const node of navigationHost.querySelectorAll<HTMLElement>(ACTIVE_ITEM_SELECTOR)) {
    if (exclude && (node === exclude || node.contains(exclude) || exclude.contains(node))) continue
    if (isMarkedActive(node)) items.push(node)
  }
  return items
}

/** 判断单个元素是否处于高亮状态。 */
function isMarkedActive(node: HTMLElement): boolean {
  for (const name of Array.from(node.classList)) {
    if (ACTIVE_CLASS_PATTERN.test(name)) return true
  }
  if (node.hasAttribute('aria-current') || node.hasAttribute('aria-selected')) return true
  const background = node.style.background || node.style.backgroundColor
  return Boolean(background) && !/transparent|rgba\(0,\s*0,\s*0,\s*0\)|none/i.test(background)
}

/**
 * 清除原生菜单项的高亮，并把高亮的外观复制到工具箱按钮上。
 *
 * 学习通依赖自身 JS 维护选中态，直接删类名可能与其内部状态脱节；
 * 因此这里采用「把原生高亮样式搬到自己身上，再让原生项退回普通态」的做法，
 * 视觉上只有一个高亮项，且不依赖对具体类名的假设。
 *
 * @returns 高亮外观属性，关闭时用于还原工具箱按钮
 */
export function captureNativeActiveLook(
  activeItems: readonly HTMLElement[],
): Record<string, string> | null {
  const source = activeItems[0]
  if (!source) return null
  const computed = getComputedStyle(source)
  const target = source.firstElementChild instanceof HTMLElement
    ? source.firstElementChild
    : source
  const childComputed = target === source ? computed : getComputedStyle(target)
  const look: Record<string, string> = {}
  for (const property of ACTIVE_LOOK_PROPS) {
    const value = childComputed.getPropertyValue(property) || computed.getPropertyValue(property)
    if (value) look[property] = value
  }
  return look
}

/**
 * 清除原生项的高亮，返回被摘除的信息，便于之后原样还原。
 * 内联背景是高亮态的主要来源之一，清掉后回落到样式表的默认背景。
 */
export function clearNativeActiveLook(
  activeItems: readonly HTMLElement[],
): NativeActiveSnapshot[] {
  const snapshots: NativeActiveSnapshot[] = []
  for (const node of activeItems) {
    const classes: string[] = []
    for (const name of Array.from(node.classList)) {
      if (!ACTIVE_CLASS_PATTERN.test(name)) continue
      classes.push(name)
      node.classList.remove(name)
    }
    const attributes: Record<string, string> = {}
    for (const name of ['aria-current', 'aria-selected']) {
      const value = node.getAttribute(name)
      if (value === null) continue
      attributes[name] = value
      node.removeAttribute(name)
    }
    const background = node.style.background || node.style.backgroundColor
    snapshots.push({ node, classes, attributes, background })
    node.style.removeProperty('background')
    node.style.removeProperty('background-color')
  }
  return snapshots
}

/** 把 `clearNativeActiveLook` 摘除的高亮还原到原生项上。 */
export function restoreNativeActiveLook(snapshots: readonly NativeActiveSnapshot[]): void {
  for (const { node, classes, attributes, background } of snapshots) {
    if (!node.isConnected) continue
    for (const name of classes) node.classList.add(name)
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value)
    if (background) node.style.background = background
  }
}

/**
 * 读取原生内容容器的视觉特征，用来给工具箱窗口复刻同样的外观。
 *
 * 学习通的课程内容区统一是「浅灰底 + 白色圆角卡片」，卡片四周留出一圈空白。
 * 工具箱若直接铺满内容区，会因为缺少留白和圆角而显得是外来的 iframe。
 */
export interface NativePanelLook {
  /** 内容区背景色（灰底）。 */
  canvas: string
  /** 卡片背景色。 */
  surface: string
  /** 卡片圆角。 */
  radius: string
  /** 卡片与内容区边缘之间的留白。 */
  padding: string
}

/**
 * 从原生内容区推导出卡片外观。
 *
 * 学习通把课程内容 iframe 放在一个带内边距的灰色容器里：
 * 容器的 padding 就是卡片四周的留白，容器的背景就是画布灰底。
 * 圆角优先取容器自身，其次取 iframe（部分版本把圆角做在 iframe 上）。
 *
 * 注意：iframe 的直接父容器可能是白色卡片而非灰色画布，
 * 因此需要向上遍历找到第一个非白色背景作为画布色。
 *
 * @param reference 原生课程内容 iframe
 * @param fallback 找不到容器时使用的近似值
 */
export function resolveNativePanelLook(
  reference: HTMLElement | null,
  fallback: NativePanelLook = DEFAULT_PANEL_LOOK,
): NativePanelLook {
  if (!reference) return fallback
  const view = reference.ownerDocument.defaultView
  if (!view) return fallback
  const parent = reference.parentElement
  const parentStyle = parent ? view.getComputedStyle(parent) : null
  const frameStyle = view.getComputedStyle(reference)
  return {
    canvas: pickCanvasColor(reference, view, fallback.canvas),
    surface: pickColor(frameStyle.backgroundColor, fallback.surface),
    radius: pickLength(
      parentStyle?.borderTopLeftRadius,
      pickLength(frameStyle.borderTopLeftRadius, fallback.radius),
    ),
    padding: pickLength(parentStyle?.paddingTop, fallback.padding),
  }
}

/**
 * 向上遍历 DOM 树，找到第一个非白色背景作为画布色。
 * 原生页面中 iframe 可能被白色卡片包裹，灰色画布在更上层。
 */
function pickCanvasColor(
  reference: HTMLElement,
  view: Window,
  fallback: string,
): string {
  let current: HTMLElement | null = reference.parentElement
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
    const color = view.getComputedStyle(current).backgroundColor
    if (color && !/transparent|rgba\(0,\s*0,\s*0,\s*0\)|rgb\(255,\s*255,\s*255\)|#fff\b|#ffffff\b/i.test(color)) {
      return color
    }
  }
  return fallback
}

function pickColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  return /transparent|rgba\(0,\s*0,\s*0,\s*0\)/i.test(value) ? fallback : value
}

function pickLength(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  return /^\d/.test(value) ? value : fallback
}

/**
 * 学习通内容区的典型外观，作为找不到原生容器时的兜底。
 * 数值取自真实页面截图的逐像素测量：留白 30px、圆角 5px、画布 #f0f2f5。
 */
export const DEFAULT_PANEL_LOOK: NativePanelLook = {
  canvas: '#f0f2f5',
  surface: '#ffffff',
  radius: '5px',
  padding: '30px',
}

/** 高亮态需要搬运的视觉属性。 */
const ACTIVE_LOOK_PROPS = [
  'backgroundColor', 'color', 'fontWeight', 'borderRadius',
  'boxShadow', 'borderLeft', 'borderTop', 'borderRight', 'borderBottom',
] as const
