import type { NativeLook, RequestContextMessage, ToolboxContext } from '@dbkang/shared'
import { DEFAULT_NATIVE_LOOK, isBridgeContextMessage, isBridgeLookMessage } from '@dbkang/shared'

const fallbackContext: ToolboxContext = {
  role: 'student',
  studentId: '2099000101',
  realName: '测试学生',
  grade: 2099,
  classNumber: 1,
  classId: 'demo-class',
  courseId: 'demo-course',
  courseName: 'DBKang Toolbox 演示课程',
  courseEnded: false,
}

export function requestToolboxContext(timeoutMs = 1800): Promise<ToolboxContext> {
  if (window.parent === window) return Promise.resolve(readDevelopmentContext())
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error('未能从学习通页面获取当前用户与课程信息。'))
    }, timeoutMs)
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent || !isBridgeContextMessage(event.data)) return
      window.clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      resolve(event.data.payload)
    }
    window.addEventListener('message', onMessage)
    const message: RequestContextMessage = {
      source: 'dbkang-toolbox',
      type: 'DBKANG_REQUEST_CONTEXT',
    }
    window.parent.postMessage(message, '*')
  })
}

function readDevelopmentContext(): ToolboxContext {
  const query = new URLSearchParams(window.location.search)
  return {
    ...fallbackContext,
    role: query.get('role') === 'teacher' ? 'teacher' : fallbackContext.role,
    studentId: query.get('studentId') || fallbackContext.studentId,
    realName: query.get('realName') || fallbackContext.realName,
    classId: query.get('classId') || fallbackContext.classId,
    courseId: query.get('courseId') || fallbackContext.courseId,
    courseName: query.get('courseName') || fallbackContext.courseName,
  }
}

export function openToolboxTab(tab: string): void {
  if (window.parent !== window) {
    window.parent.postMessage(
      { source: 'dbkang-toolbox', type: 'DBKANG_OPEN_TOOLBOX_TAB', payload: { tab } },
      '*',
    )
    return
  }
  const target = new URL(window.location.href)
  target.searchParams.set('tab', tab)
  window.open(target, '_blank', 'noopener')
}

/**
 * 接收脚本实测到的原生排版，并写成 CSS 变量供样式表套用。
 *
 * 学习通的页签在跨域 iframe 内，工具箱无法直接读取其样式；由脚本量好后
 * 经消息传入，顶部菜单列才能用同一套字体、字号与左端空隙，
 * 看起来就是原生卡片的一部分。独立打开（开发预览）时用兜底值。
 */
export function applyNativeLook(look: NativeLook): void {
  const root = document.documentElement
  for (const [property, value] of Object.entries(nativeLookVariables(look))) {
    root.style.setProperty(property, value)
  }
}

/** 把实测排版翻译成样式表里使用的 CSS 变量。 */
export function nativeLookVariables(look: NativeLook): Record<string, string> {
  return {
    '--dbk-native-font-family': look.fontFamily,
    '--dbk-native-font-size': look.fontSize,
    '--dbk-native-font-weight': look.fontWeight,
    '--dbk-native-line-height': look.lineHeight,
    '--dbk-native-color': look.color,
    '--dbk-nav-inset-left': look.navInsetLeft,
  }
}

/**
 * 开始监听原生排版消息。必须在请求上下文之前调用，
 * 否则会漏掉脚本对 `DBKANG_REQUEST_CONTEXT` 的应答。
 */
export function bindNativeLook(): void {
  applyNativeLook(DEFAULT_NATIVE_LOOK)
  if (window.parent === window) return
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent || !isBridgeLookMessage(event.data)) return
    applyNativeLook(event.data.payload)
  })
}
