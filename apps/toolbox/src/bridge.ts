import type { RequestContextMessage, ToolboxContext } from '@dbkang/shared'
import { isBridgeContextMessage } from '@dbkang/shared'

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
