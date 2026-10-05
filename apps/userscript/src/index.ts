import {
  extractAccountIdentity,
  extractChaoxingCoursePage,
  extractCourseContentFrame,
  extractHomeworkDetail,
  extractHomeworkList,
  extractHomeworkSnapshots,
  parseStudentNumber,
  resolveCourseContentFrameLayout,
} from '@dbkang/chaoxing'
import type {
  BridgeContextMessage,
  BridgeLookMessage,
  CourseAccessResponse,
  HomeworkSnapshotInput,
  NativeLook,
  RequestContextMessage,
  ToolboxContext,
} from '@dbkang/shared'
import { createNavigationButton, NAV_ID } from './navigation-button'
import type { NativeActiveSnapshot } from './navigation-active'
import {
  captureNativeActiveLook,
  clearNativeActiveLook,
  findActiveNavigationItems,
  resolveNativePanelLook,
  restoreNativeActiveLook,
} from './navigation-active'
import { resolveNativeLook } from './navigation-typography'
import {
  applyNativePanelLook,
  bindChaoxingNavigationClose,
  configureToolboxFrame,
  findChaoxingNavigationHost,
  installToolboxFrameStyle,
  setToolboxFrameState,
} from './toolbox-frame'

const API_BASE_URL = __DBKANG_API_BASE_URL__
const TOOLBOX_URL = __DBKANG_TOOLBOX_URL__
const FRAME_ID = 'dbkang-toolbox-frame'
const STYLE_ID = 'dbkang-toolbox-style'
const NAV_WAIT_TIMEOUT_MS = 8_000

let installStarted = false

void initialize()

async function initialize(): Promise<void> {
  if (window.top !== window.self) return
  console.log('[DBKang] 开始初始化...')
  console.log('[DBKang] 当前URL:', window.location.href)

  const coursePage = extractChaoxingCoursePage(document, window.location)
  console.log('[DBKang] 课程页面信息:', coursePage)

  if (!coursePage) {
    console.log('[DBKang] 无法解析课程页面信息，退出')
    return
  }
  if (coursePage.courseEnded) {
    console.log('[DBKang] 课程已结课，退出')
    return
  }

  let identity
  try {
    console.log('[DBKang] 正在获取账户信息...')
    const accountHtml = await requestText('https://passport2.chaoxing.com/mooc/accountManage')
    identity = extractAccountIdentity(parseHtml(accountHtml), coursePage.fid)
    console.log('[DBKang] 账户信息:', identity)
  } catch (error) {
    console.log('[DBKang] 获取账户信息失败:', error)
    return
  }
  const classIdentity =
    coursePage.role === 'student' && identity ? parseStudentNumber(identity.studentId) : null
  if (!identity || (coursePage.role === 'student' && !classIdentity)) {
    console.log('[DBKang] 身份验证失败，退出')
    return
  }
  const context: ToolboxContext = {
    role: coursePage.role,
    ...identity,
    grade: classIdentity?.grade ?? null,
    classNumber: classIdentity?.classNumber ?? null,
    classId: coursePage.classId,
    courseId: coursePage.courseId,
    courseName: coursePage.courseName,
    courseEnded: false,
  }

  let access: CourseAccessResponse
  try {
    console.log('[DBKang] 正在检查课程访问权限:', context.courseId)
    access = await requestJson<CourseAccessResponse>(
      `${API_BASE_URL}/api/v1/public/courses/${encodeURIComponent(context.courseId)}`,
    )
    console.log('[DBKang] 课程访问权限:', access)
  } catch (error) {
    console.log('[DBKang] 检查课程访问权限失败:', error)
    return
  }
  if (access.status !== 'available') {
    console.log('[DBKang] 课程未启用，退出')
    return
  }

  console.log('[DBKang] 等待左侧菜单渲染...')
  await waitForNavigationHost()
  if (installStarted) return
  installStarted = true

  console.log('[DBKang] 安装工具箱...')
  const controller = installToolbox(context, coursePage.homeworkListUrl)
  console.log('[DBKang] 工具箱安装完成')
  const requestedTab = new URLSearchParams(window.location.search).get('dbkangTab')
  if (requestedTab) controller.open(requestedTab)
}

// 使用 MutationObserver 等待课程页面左侧菜单渲染完成
function waitForNavigationHost(timeoutMs = NAV_WAIT_TIMEOUT_MS): Promise<void> {
  if (findChaoxingNavigationHost(document)) return Promise.resolve()
  return new Promise((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      observer.disconnect()
      window.clearTimeout(timer)
      resolve()
    }
    const observer = new MutationObserver(() => {
      if (findChaoxingNavigationHost(document)) finish()
    })
    const timer = window.setTimeout(finish, timeoutMs)
    observer.observe(document.documentElement, { childList: true, subtree: true })
  })
}

function installToolbox(
  context: ToolboxContext,
  homeworkListUrl: string | null,
): { open: (tab?: string) => void } {
  installToolboxFrameStyle(document, FRAME_ID, STYLE_ID, NAV_ID)
  const navigationHost = findNavigationHost()
  const navButton = createNavigationButton(navigationHost)
  navigationHost.append(navButton)

  let frame: HTMLIFrameElement | null = null
  let isOpen = false
  let layoutReference: HTMLIFrameElement | null = null
  const layoutObserver = new MutationObserver(() => syncFrameLayout())

  // 记录当前处于高亮态的原生项，关闭时需要把它们恢复回去。
  // 学习通菜单用类名驱动高亮，若只删不存，关闭工具箱后就再也点不亮原项了。
  let suspendedActiveItems: NativeActiveSnapshot[] = []
  const content = navButton.firstElementChild instanceof HTMLElement
    ? navButton.firstElementChild
    : navButton

  /**
   * 接管原生高亮：把高亮外观搬到自己身上，并让原生项退回普通态，
   * 使界面上任何时刻只有一个高亮项。外观取自真实高亮项，无需猜类名。
   */
  const applyToolboxActiveLook = (): void => {
    const activeItems = findActiveNavigationItems(navigationHost, navButton)
    const look = captureNativeActiveLook(activeItems)
    suspendedActiveItems = clearNativeActiveLook(activeItems)
    navButton.dataset.active = 'true'
    if (!look) return
    for (const [property, value] of Object.entries(look)) {
      try {
        ;(content.style as unknown as Record<string, string>)[property] = value
      } catch {
        // 浏览器不支持该属性时跳过
      }
    }
  }

  /** 归还高亮：先摘掉工具箱的高亮，再把原生项的高亮还原。 */
  const releaseToolboxActiveLook = (): void => {
    navButton.dataset.active = 'false'
    content.removeAttribute('style')
    if (suspendedActiveItems.length === 0) return
    restoreNativeActiveLook(suspendedActiveItems)
    suspendedActiveItems = []
  }

  const syncFrameLayout = (): void => {
    if (!frame) return
    const layout = resolveCourseContentFrameLayout(layoutReference, context.role)
    Object.assign(frame.style, layout)
    // 在原生内容区尺寸基础上内缩出留白，并套上圆角卡片外观，
    // 让工具箱与学习通原生页卡的边距、圆角、底色保持一致。
    applyNativePanelLook(frame, resolveNativePanelLook(layoutReference))
  }

  /**
   * 把当前用户上下文与实测到的原生排版一起推给工具箱。
   * 原生页签位于跨域 iframe 内，工具箱读不到它的样式，只能由这里量好后传过去。
   */
  const pushContext = (): void => {
    if (!frame) return
    sendContext(frame, context)
    sendNativeLook(frame, resolveNativeLook(navigationHost, layoutReference))
  }

  window.addEventListener('resize', syncFrameLayout)

  const open = (tab?: string): void => {
    const reference = extractCourseContentFrame(document)

    if (!frame) {
      const newFrame = document.createElement('iframe')
      newFrame.id = FRAME_ID
      newFrame.title = 'DBKang Toolbox'
      newFrame.allow = 'autoplay'
      configureToolboxFrame(newFrame)
      const target = new URL(`${TOOLBOX_URL}/`)
      target.searchParams.set('tab', tab || 'home')
      newFrame.src = target.href
      newFrame.addEventListener('load', () => pushContext())
      document.body.append(newFrame)
      frame = newFrame
    }
    layoutReference = reference
    layoutObserver.disconnect()
    if (reference) {
      layoutObserver.observe(reference, {
        attributes: true,
        attributeFilter: ['style', 'width', 'height'],
      })
    }
    syncFrameLayout()

    isOpen = true
    setToolboxFrameState(frame, true)
    applyToolboxActiveLook()
    if (context.role === 'student') void syncHomework(context, homeworkListUrl)
  }

  const close = (): void => {
    if (!frame || !isOpen) return
    isOpen = false
    setToolboxFrameState(frame, false)
    layoutObserver.disconnect()
    releaseToolboxActiveLook()
  }

  navButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (isOpen) {
      // 再次点击自己等同于关闭，与原生菜单的行为保持一致
      close()
      return
    }
    open()
  })

  // 点击原生菜单项时关闭工具箱。close() 内会调用 releaseToolboxActiveLook()
  // 把高亮归还给原生项，无需在此另挂监听。
  bindChaoxingNavigationClose(navigationHost, navButton, close)

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!frame || event.source !== frame.contentWindow || !event.data || typeof event.data !== 'object') return
    const message = event.data as Partial<RequestContextMessage> & {
      payload?: { tab?: string }
    }
    if (message.source !== 'dbkang-toolbox') return
    if (message.type === 'DBKANG_REQUEST_CONTEXT') {
      pushContext()
      return
    }
    if (message.type === 'DBKANG_OPEN_TOOLBOX_TAB' && message.payload?.tab) {
      const target = new URL(window.location.href)
      target.searchParams.set('dbkangTab', message.payload.tab)
      window.open(target, '_blank', 'noopener')
    }
  })

  return { open }
}

function findNavigationHost(): HTMLElement {
  const navigationHost = findChaoxingNavigationHost(document)
  if (navigationHost) return navigationHost

  // 尝试查找左侧菜单容器
  const leftMenuSelectors = [
    '.fanya-left-menu',
    '.left-menu',
    '.sidebar',
    '.nav-sidebar',
    '.course-sidebar',
    '.fanya-sidebar',
    '.fanya-nav',
    '.menu-container',
    '.nav-container',
  ]
  for (const selector of leftMenuSelectors) {
    const container = document.querySelector<HTMLElement>(selector)
    if (container) {
      // 创建一个固定的导航项容器
      const navWrapper = document.createElement('div')
      navWrapper.setAttribute('data-dbkang-nav-wrapper', 'true')
      Object.assign(navWrapper.style, {
        position: 'sticky',
        top: '0',
        zIndex: '100',
        background: '#fff',
        borderBottom: '1px solid #e2e7ef',
      })
      container.prepend(navWrapper)
      return navWrapper
    }
  }

  // 最终 fallback：右下角浮动按钮
  const fallback = document.createElement('div')
  Object.assign(fallback.style, {
    position: 'fixed',
    zIndex: '2147483000',
    right: '22px',
    bottom: '22px',
    border: '1px solid #e2e7ef',
    borderRadius: '8px',
    background: '#fff',
    boxShadow: '0 8px 24px rgba(30,54,92,.16)',
  })
  document.body.append(fallback)
  return fallback
}

function sendContext(frame: HTMLIFrameElement, context: ToolboxContext): void {
  const message: BridgeContextMessage = {
    source: 'dbkang-userscript',
    type: 'DBKANG_CONTEXT',
    payload: context,
  }
  frame.contentWindow?.postMessage(message, new URL(TOOLBOX_URL).origin)
}

/** 把实测到的原生排版推给工具箱，供其顶部菜单列套用同样的字体与字号。 */
function sendNativeLook(frame: HTMLIFrameElement, look: NativeLook): void {
  const message: BridgeLookMessage = {
    source: 'dbkang-userscript',
    type: 'DBKANG_NATIVE_LOOK',
    payload: look,
  }
  frame.contentWindow?.postMessage(message, new URL(TOOLBOX_URL).origin)
}

async function syncHomework(context: ToolboxContext, homeworkListUrl: string | null): Promise<void> {
  let assignments: HomeworkSnapshotInput[] = extractHomeworkSnapshots(document)
  let completeSnapshot = false
  try {
    if (homeworkListUrl) {
      const listHtml = await requestText(homeworkListUrl)
      const items = extractHomeworkList(parseHtml(listHtml), homeworkListUrl)
      assignments = await mapWithConcurrency(items, 4, async (item) => {
        if (!item.completed) {
          return {
            assignmentId: item.assignmentId,
            assignmentName: item.assignmentName,
            score: null,
            totalScore: null,
          }
        }
        try {
          const detailHtml = await requestText(item.detailUrl)
          return extractHomeworkDetail(parseHtml(detailHtml), item)
        } catch {
          return {
            assignmentId: item.assignmentId,
            assignmentName: item.assignmentName,
            score: null,
            totalScore: null,
          }
        }
      })
      completeSnapshot = true
    }
    await requestJson(`${API_BASE_URL}/api/v1/student/homework/sync`, {
      method: 'POST',
      body: {
        role: context.role,
        studentId: context.studentId,
        realName: context.realName,
        grade: context.grade,
        classNumber: context.classNumber,
        classId: context.classId,
        courseId: context.courseId,
        assignments,
        completeSnapshot,
      },
    })
  } catch {
    // 作业同步失败不阻塞工具箱；下次打开时会重新扫描。
  }
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++
        results[index] = await mapper(items[index]!)
      }
    }),
  )
  return results
}

function requestJson<T>(
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = options.method || 'GET'
  const data = options.body === undefined ? undefined : JSON.stringify(options.body)
  return requestText(url, {
    method,
    body: data,
    headers: data ? { 'Content-Type': 'application/json' } : undefined,
  }).then((text) => JSON.parse(text) as T)
}

function requestText(
  url: string,
  options: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<string> {
  const method = options.method || 'GET'
  const data = options.body
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    return chrome.runtime.sendMessage({
      type: 'DBKANG_HTTP',
      url,
      method,
      headers: options.headers,
      body: data,
    }).then((response) => {
      if (!response?.ok) throw new Error(response?.error || '阿康浏览器请求失败')
      return response.text
    })
  }
  if (typeof GM_xmlhttpRequest === 'function') {
    return new Promise<string>((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        data,
        headers: options.headers,
        timeout: 8_000,
        onload: (response) => {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`DBKang API ${response.status}`))
            return
          }
          resolve(response.responseText)
        },
        onerror: () => reject(new Error('DBKang API 无法连接')),
        ontimeout: () => reject(new Error('DBKang API 请求超时')),
      })
    })
  }
  return fetch(url, {
    method,
    headers: options.headers,
    body: data,
    credentials: 'include',
  }).then(async (response) => {
    if (!response.ok) throw new Error(`DBKang API ${response.status}`)
    return response.text()
  })
}
