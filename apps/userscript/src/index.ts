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
  CourseAccessResponse,
  HomeworkSnapshotInput,
  RequestContextMessage,
  ToolboxContext,
} from '@dbkang/shared'

const API_BASE_URL = __DBKANG_API_BASE_URL__
const TOOLBOX_URL = __DBKANG_TOOLBOX_URL__
const NAV_ID = 'dbkang-toolbox-nav'
const FRAME_ID = 'dbkang-toolbox-frame'

void initialize()

async function initialize(): Promise<void> {
  if (window.top !== window.self) return
  const coursePage = extractChaoxingCoursePage(document, window.location)
  if (!coursePage || coursePage.courseEnded) return

  let identity
  try {
    const accountHtml = await requestText('https://passport2.chaoxing.com/mooc/accountManage')
    identity = extractAccountIdentity(parseHtml(accountHtml), coursePage.fid)
  } catch {
    return
  }
  const classIdentity =
    coursePage.role === 'student' && identity ? parseStudentNumber(identity.studentId) : null
  if (!identity || (coursePage.role === 'student' && !classIdentity)) return
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
    access = await requestJson<CourseAccessResponse>(
      `${API_BASE_URL}/api/v1/public/courses/${encodeURIComponent(context.courseId)}`,
    )
  } catch {
    return
  }
  if (access.status !== 'available') return

  const controller = installToolbox(context, coursePage.homeworkListUrl)
  const requestedTab = new URLSearchParams(window.location.search).get('dbkangTab')
  if (requestedTab) controller.open(requestedTab)
}

function installToolbox(
  context: ToolboxContext,
  homeworkListUrl: string | null,
): { open: (tab?: string) => void } {
  const navButton = createNavigationButton()
  const navigationHost = findNavigationHost()
  navigationHost.append(navButton)

  let frame: HTMLIFrameElement | null = null
  let hiddenNodes: Array<{ node: HTMLElement; display: string }> = []
  let layoutReference: HTMLIFrameElement | null = null
  const layoutObserver = new MutationObserver(() => syncFrameLayout())

  const syncFrameLayout = (): void => {
    if (!frame) return
    Object.assign(frame.style, resolveCourseContentFrameLayout(layoutReference, context.role))
  }

  window.addEventListener('resize', syncFrameLayout)

  const open = (tab = 'achievements'): void => {
    const reference = extractCourseContentFrame(document)
    const contentHost = findContentHost(reference)
    const contentNodes = reference || contentHost === document.body
      ? [...document.querySelectorAll<HTMLElement>('iframe[id^="frame_content-"]')]
      : [...contentHost.children].filter((node): node is HTMLElement => node instanceof HTMLElement)
    const openingFromClosed = !frame || frame.style.display === 'none'

    if (!frame) {
      const newFrame = document.createElement('iframe')
      newFrame.id = FRAME_ID
      newFrame.title = 'DBKang Toolbox'
      newFrame.allow = 'autoplay'
      Object.assign(newFrame.style, {
        display: 'block',
        border: '0',
        background: '#f6f8fb',
      })
      newFrame.addEventListener('load', () => sendContext(newFrame, context))
      contentHost.append(newFrame)
      frame = newFrame
    }
    if (frame.parentElement !== contentHost) contentHost.append(frame)
    layoutReference = reference
    layoutObserver.disconnect()
    if (reference) {
      layoutObserver.observe(reference, {
        attributes: true,
        attributeFilter: ['style', 'width', 'height'],
      })
    }
    syncFrameLayout()

    if (openingFromClosed) {
      hiddenNodes = contentNodes
        .filter((node) => node.id !== FRAME_ID)
        .map((node) => ({ node, display: node.style.display }))
      hiddenNodes.forEach(({ node }) => { node.style.display = 'none' })
    }
    const target = new URL(`${TOOLBOX_URL}/`)
    target.searchParams.set('tab', tab)
    if (frame.src !== target.href) frame.src = target.href
    frame.style.display = 'block'
    navButton.dataset.active = 'true'
    if (context.role === 'student') void syncHomework(context, homeworkListUrl)
  }

  const close = (): void => {
    if (!frame || frame.style.display === 'none') return
    frame.style.display = 'none'
    hiddenNodes.forEach(({ node, display }) => { node.style.display = display })
    navButton.dataset.active = 'false'
  }

  navButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    open()
  })

  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element) || target.closest(`#${NAV_ID}`)) return
    const navHost = findNavigationHost(false)
    if (navHost?.contains(target)) close()
  }, true)

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!frame || event.source !== frame.contentWindow || !event.data || typeof event.data !== 'object') return
    const message = event.data as Partial<RequestContextMessage> & {
      payload?: { tab?: string }
    }
    if (message.source !== 'dbkang-toolbox') return
    if (message.type === 'DBKANG_REQUEST_CONTEXT') {
      sendContext(frame, context)
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

function createNavigationButton(): HTMLElement {
  const item = document.createElement('li')
  item.id = NAV_ID
  const button = document.createElement('button')
  button.type = 'button'
  button.innerHTML = '<span aria-hidden="true">DB</span><strong>阿康工具箱</strong>'
  Object.assign(button.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    minHeight: '40px',
    padding: '0 14px',
    border: '0',
    color: '#334155',
    font: '14px system-ui, sans-serif',
    background: 'transparent',
    cursor: 'pointer',
  })
  const mark = button.querySelector('span')
  if (mark instanceof HTMLElement) {
    Object.assign(mark.style, {
      display: 'grid',
      width: '24px',
      height: '24px',
      placeItems: 'center',
      borderRadius: '6px',
      color: '#fff',
      fontSize: '9px',
      fontWeight: '700',
      background: '#2f6fe4',
    })
  }
  item.append(button)
  return item
}

function findNavigationHost(required = true): HTMLElement {
  const selectors = [
    '[data-dbkang-nav]',
    '.stuNavigationList > ul',
    '.course-nav',
    '.course_nav',
    '.nav-tabs',
    '.nav',
  ]
  for (const selector of selectors) {
    const node = document.querySelector<HTMLElement>(selector)
    if (node) return node
  }
  if (!required) return null as unknown as HTMLElement
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

function findContentHost(reference: HTMLIFrameElement | null = null): HTMLElement {
  if (reference?.parentElement) return reference.parentElement
  const selectors = [
    '[data-dbkang-content]',
    '.course-content',
    '.course_main',
    '#content',
    'main',
  ]
  for (const selector of selectors) {
    const node = document.querySelector<HTMLElement>(selector)
    if (node) return node
  }
  return document.body
}

function sendContext(frame: HTMLIFrameElement, context: ToolboxContext): void {
  const message: BridgeContextMessage = {
    source: 'dbkang-userscript',
    type: 'DBKANG_CONTEXT',
    payload: context,
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
