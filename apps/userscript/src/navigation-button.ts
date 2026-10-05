export const NAV_ID = 'dbkang-toolbox-nav'

/**
 * 需要从原生菜单项 `<li>` 复制的盒模型属性。
 * 这些决定菜单项占据的空间与边框，使新增项与相邻项对齐。
 * 注意：不复制 `overflow`，避免裁切新增项内容；也不复制固定 `height`，
 * 以免文字换行时被截断。
 */
const NATIVE_ITEM_BOX_PROPS = [
  'display', 'boxSizing', 'alignItems', 'justifyContent', 'flexDirection', 'gap',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'borderTop', 'borderRight', 'borderBottom', 'borderLeft', 'borderRadius',
  'minHeight', 'width', 'backgroundColor', 'backgroundImage',
  'boxShadow', 'transition',
] as const

/**
 * 需要从原生菜单项文字载体（`<a>` / `<span>`）复制的排版属性。
 * 复制后即使宿主 CSS 只作用于特定标签，也能得到一致外观。
 */
const NATIVE_TEXT_PROPS = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing',
  'color', 'textAlign', 'textDecoration', 'textIndent', 'whiteSpace',
  'cursor', 'opacity', 'visibility',
] as const

/**
 * 复制源元素的计算样式到目标元素。
 * 用于让新增的菜单项自动匹配原生菜单项的外观。
 */
function copyNativeStyles(
  target: HTMLElement,
  source: HTMLElement,
  props: readonly string[],
): void {
  const computed = getComputedStyle(source)
  const targetStyle = target.style as unknown as Record<string, string>
  for (const prop of props) {
    const value = computed.getPropertyValue(prop)
    if (!value) continue
    try {
      targetStyle[prop] = value
    } catch {
      // 浏览器不支持该属性时跳过
    }
  }
}

/**
 * 参照相邻菜单项构建工具箱菜单项，使其在外观与原生项一致。
 *
 * 复制分两层：`<li>` 复制相邻项的盒模型（内边距、边框、布局），
 * 内层文字载体复制相邻 `<a>` 或 `<li>` 的排版（字体、颜色、对齐），
 * 并沿用相邻项的标签名，使宿主只针对 `li > a` 写的 CSS 同样命中。
 */
export function createNavigationButton(navHost: HTMLElement): HTMLElement {
  const item = document.createElement('li')
  item.id = NAV_ID
  item.setAttribute('data-dbkang-nav-item', 'true')

  const sibling = navHost.querySelector<HTMLElement>('li:not([data-dbkang-nav-item])')

  if (sibling) {
    copyNativeStyles(item, sibling, NATIVE_ITEM_BOX_PROPS)
    // 相邻项通常已是 list-style: none，但过滤后的计算值未必带回，
    // 显式关闭项目符号，避免新增项多出一个圆点。
    item.style.listStyle = 'none'
  }

  const siblingLink = sibling?.querySelector('a')
  const childTag = siblingLink ? 'a' : 'span'

  const content = document.createElement(childTag)
  if (childTag === 'a') {
    content.setAttribute('href', 'javascript:void(0)')
    content.setAttribute('role', 'button')
  }

  // 没有 <a> 时回退到相邻 <li>，其排版样式即为菜单项文字样式
  const textSource = siblingLink ?? sibling
  if (textSource) {
    copyNativeStyles(content, textSource, NATIVE_TEXT_PROPS)
  }

  const mark = document.createElement('span')
  mark.setAttribute('aria-hidden', 'true')
  mark.textContent = 'DB'
  mark.className = 'dbkang-nav-mark'

  const label = document.createElement('strong')
  label.textContent = '阿康工具箱'
  label.className = 'dbkang-nav-label'

  content.append(mark, label)
  item.append(content)

  // 非原生菜单容器中，提供基础样式保证可用
  if (!navHost.matches('ul, ol')) {
    item.classList.add('dbkang-nav-fallback')
  }

  return item
}