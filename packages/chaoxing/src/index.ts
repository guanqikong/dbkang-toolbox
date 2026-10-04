import type {
  ClassIdentity,
  HomeworkSnapshotInput,
  ToolboxContext,
  ToolboxRole,
} from '@dbkang/shared'

const COURSE_ID_KEYS = ['courseId', 'courseid', 'course_id'] as const
const CLASS_ID_KEYS = ['clazzid', 'clazzId', 'classId', 'classid'] as const

export interface ChaoxingCoursePage {
  role: ToolboxRole
  courseId: string
  classId: string
  cpi: string
  fid: string | null
  courseName: string
  realName: string | null
  courseEnded: boolean
  homeworkListUrl: string | null
}

export interface ChaoxingHomeworkListItem {
  assignmentId: string
  assignmentName: string
  detailUrl: string
  completed: boolean
}

export interface ChaoxingContentFrameLayout {
  position: string
  inset: string
  top: string
  right: string
  bottom: string
  left: string
  width: string
  height: string
  minHeight: string
}

function firstText(document: Document, selectors: string[]): string | null {
  for (const selector of selectors) {
    const node = document.querySelector<HTMLElement>(selector)
    const value = node?.getAttribute('title')?.trim() || node?.textContent?.trim()
    if (value) return value
  }
  return null
}

function firstValue(document: Document, selectors: string[]): string | null {
  for (const selector of selectors) {
    const node = document.querySelector<HTMLInputElement>(selector)
    const value = node?.value?.trim() || node?.getAttribute('value')?.trim()
    if (value) return value
  }
  return null
}

function queryValue(location: Location | URL, keys: readonly string[]): string | null {
  const url = location instanceof URL ? location : new URL(location.href)
  for (const key of keys) {
    const value = url.searchParams.get(key)?.trim()
    if (value) return value
  }
  return null
}

export function parseStudentNumber(studentId: string): ClassIdentity | null {
  const matched = /^(\d{4})\d{3}(\d)\d{2}$/.exec(studentId.trim())
  if (!matched?.[1] || !matched[2]) return null
  return { grade: Number(matched[1]), classNumber: Number(matched[2]) }
}

export function extractCourseRole(location: Location | URL): ToolboxRole {
  const url = location instanceof URL ? location : new URL(location.href)
  const path = url.pathname.toLowerCase()
  // 旧版教师页面: /mycourse/tch 或 /mooc2-ans/mycourse/tch
  // 新版教师页面: /mooc2-ans-vue/fanyav3/tch
  if (
    /\/mycourse\/tch(?:\/|$)/.test(path) ||
    /\/mooc2-ans\/mycourse\/tch(?:\/|$)/.test(path) ||
    /\/mooc2-ans-vue\/fanyav3\/tch(?:\/|$)/.test(path)
  ) {
    return 'teacher'
  }
  // 旧版学生页面: /mycourse/stu 或 /mooc2-ans/mycourse/stu
  // 新版学生页面: /mooc2-ans-vue/fanyav3/stu
  if (
    /\/mycourse\/stu(?:\/|$)/.test(path) ||
    /\/mooc2-ans\/mycourse\/stu(?:\/|$)/.test(path) ||
    /\/mooc2-ans-vue\/fanyav3\/stu(?:\/|$)/.test(path)
  ) {
    return 'student'
  }
  return 'student'
}

export function extractCourseContentFrame(document: Document): HTMLIFrameElement | null {
  // 新版页面选择器
  const newFrames = [...document.querySelectorAll<HTMLIFrameElement>('iframe[class*="fanya"], iframe[id*="fanya"], .fanya-content iframe')]
  const newVisible = newFrames.find((frame) => {
    if (frame.hidden || frame.style.display === 'none') return false
    return document.defaultView?.getComputedStyle(frame).display !== 'none'
  })
  if (newVisible) return newVisible

  // 旧版页面选择器
  const frames = [...document.querySelectorAll<HTMLIFrameElement>('iframe[id^="frame_content-"]')]
  const visible = frames.find((frame) => {
    if (frame.hidden || frame.style.display === 'none') return false
    return document.defaultView?.getComputedStyle(frame).display !== 'none'
  })
  return visible || frames[0] || null
}

export function resolveCourseContentFrameLayout(
  reference: HTMLIFrameElement | null,
  role: ToolboxRole,
): ChaoxingContentFrameLayout {
  // 新版页面 fallback 布局
  const newFallback: ChaoxingContentFrameLayout = role === 'teacher'
    ? {
        position: 'absolute',
        inset: '60px 0 0 200px',
        top: '60px',
        right: '0',
        bottom: '0',
        left: '200px',
        width: 'calc(100% - 200px)',
        height: 'calc(100vh - 60px)',
        minHeight: '0',
      }
    : {
        position: '',
        inset: '',
        top: '',
        right: '',
        bottom: '',
        left: '',
        width: '100%',
        height: 'calc(100vh - 80px)',
        minHeight: '680px',
      }
  // 旧版页面 fallback 布局
  const fallback: ChaoxingContentFrameLayout = role === 'teacher'
    ? {
        position: 'absolute',
        inset: '52px 0 0 180px',
        top: '52px',
        right: '0',
        bottom: '0',
        left: '180px',
        width: 'calc(100% - 180px)',
        height: 'calc(100vh - 52px)',
        minHeight: '0',
      }
    : {
        position: '',
        inset: '',
        top: '',
        right: '',
        bottom: '',
        left: '',
        width: '100%',
        height: 'calc(100vh - 72px)',
        minHeight: '680px',
      }
  if (!reference) return newFallback

  const computed = reference.ownerDocument.defaultView?.getComputedStyle(reference)
  const styleValue = (inline: string, resolved: string | undefined, defaultValue: string): string =>
    inline || (resolved && resolved !== 'auto' ? resolved : '') || defaultValue
  const attributeSize = (name: 'width' | 'height'): string => {
    const value = reference.getAttribute(name)?.trim()
    return value && /^\d+(?:\.\d+)?$/.test(value) ? `${value}px` : ''
  }

  return {
    position: styleValue(reference.style.position, computed?.position, fallback.position),
    inset: styleValue(reference.style.inset, computed?.inset, fallback.inset),
    top: styleValue(reference.style.top, computed?.top, fallback.top),
    right: styleValue(reference.style.right, computed?.right, fallback.right),
    bottom: styleValue(reference.style.bottom, computed?.bottom, fallback.bottom),
    left: styleValue(reference.style.left, computed?.left, fallback.left),
    width: styleValue(
      reference.style.width,
      computed?.width,
      attributeSize('width') || fallback.width,
    ),
    height: styleValue(
      reference.style.height,
      computed?.height,
      attributeSize('height') || fallback.height,
    ),
    minHeight: '0',
  }
}

export function extractCourseId(document: Document, location: Location | URL): string | null {
  const fromUrl = queryValue(location, COURSE_ID_KEYS)
  if (fromUrl) return fromUrl

  const url = location instanceof URL ? location : new URL(location.href)
  // 旧版: /mycourse/tch/12345 或 /course/12345
  // 新版: /mooc2-ans-vue/fanyav3/tch (courseId 在 URL 参数中)
  const pathMatch = /\/(?:course|mycourse)\/(\d+)/i.exec(url.pathname)
  if (pathMatch?.[1]) return pathMatch[1]

  return (
    firstValue(document, ['#courseid', '#courseId', 'input[name="courseid"]', 'input[name="courseId"]']) ||
    document.documentElement.dataset.courseId?.trim() ||
    document.querySelector<HTMLElement>('[data-course-id]')?.dataset.courseId?.trim() ||
    null
  )
}

export function extractClassId(document: Document, location: Location | URL): string | null {
  return (
    queryValue(location, CLASS_ID_KEYS) ||
    firstValue(document, ['#clazzid', '#clazzId', '#classId', 'input[name="clazzid"]', 'input[name="classId"]']) ||
    document.querySelector<HTMLElement>('[data-class-id]')?.dataset.classId?.trim() ||
    null
  )
}

export function extractCpi(document: Document, location: Location | URL): string | null {
  const fromUrl = queryValue(location, ['cpi'])
  if (fromUrl) return fromUrl
  const fromPage = firstValue(document, ['#cpi', 'input[name="cpi"]'])
  if (fromPage) return fromPage
  // 新版页面可能没有 cpi 参数，使用 courseId 作为 fallback
  const courseId = extractCourseId(document, location)
  return courseId || null
}

export function extractCourseName(document: Document): string | null {
  const dataName = document.querySelector<HTMLElement>('[data-course-name]')?.dataset.courseName?.trim()
  if (dataName) return dataName
  // 新版页面选择器
  const newName = firstText(document, [
    '.fanya-course-name',
    '.course-header .name',
    '.course-info .name',
    '.header-title',
    '.page-title',
  ])
  if ( newName) return newName
  // 旧版页面选择器
  return firstText(document, ['.classDl dd[title]', '.course-name', '.courseName', '.course-title', 'h1'])
}

export function extractVisibleRealName(document: Document): string | null {
  // 新版页面选择器
  const newName = firstText(document, [
    '.fanya-user-name',
    '.user-info .name',
    '.user-name',
    '.header-user .name',
    '.top-nav .name',
  ])
  if (newName) return newName
  // 旧版页面选择器
  return firstText(document, ['.Header .name > p', '.loginAfter .name > p', '#messageName', '[data-real-name]'])
}

export function extractStudentIdentity(document: Document): { studentId: string; realName: string } | null {
  // 新版页面选择器
  const newIdentityNode = document.querySelector<HTMLElement>('[data-dbkang-student-id]')
  const newStudentId = newIdentityNode?.dataset.dbkangStudentId?.trim()
  const newRealName = newIdentityNode?.dataset.dbkangRealName?.trim()
  if (newStudentId && newRealName) {
    return { studentId: newStudentId, realName: newRealName }
  }

  // 旧版页面选择器
  const identityNode = document.querySelector<HTMLElement>('[data-student-id][data-real-name]')
  const studentId =
    identityNode?.dataset.studentId?.trim() ||
    document.querySelector<HTMLElement>('[data-student-id]')?.dataset.studentId?.trim()
  const realName = identityNode?.dataset.realName?.trim() || extractVisibleRealName(document)

  if (!studentId || !realName) return null
  return { studentId, realName }
}

/** Parse the signed-in account page at passport2.chaoxing.com/mooc/accountManage. */
export function extractAccountIdentity(
  document: Document,
  fid?: string | null,
): { studentId: string; realName: string } | null {
  // 新版页面选择器
  const newRealName = firstText(document, [
    '.fanya-message-name',
    '.fanya-user-name',
    '.account-name',
    '.user-name',
  ])
  if (newRealName) {
    const newEntries = [...document.querySelectorAll<HTMLElement>('li, .account-item, .user-item')]
      .map((node) => {
        const studentId = /学号\/工号\s*[:：]\s*([A-Za-z0-9_-]+)/.exec(node.textContent || '')?.[1]
        const accountAction = node.querySelector<HTMLElement>('[onclick*="deleteAccount"], [data-action="delete"]')?.getAttribute('onclick') || ''
        const entryFid = /deleteAccount\(['"]([^'"]+)/.exec(accountAction)?.[1] || null
        return studentId ? { studentId, fid: entryFid } : null
      })
      .filter((value): value is { studentId: string; fid: string | null } => value !== null)
    const newSelected = (fid ? newEntries.find((entry) => entry.fid === fid) : null) || newEntries[0]
    if (newSelected) {
      return { studentId: newSelected.studentId, realName: newRealName }
    }
  }

  // 旧版页面选择器
  const realName = firstText(document, ['#messageName', '[data-real-name]'])
  const entries = [...document.querySelectorAll<HTMLElement>('li')]
    .map((node) => {
      const studentId = /学号\/工号\s*[:：]\s*([A-Za-z0-9_-]+)/.exec(node.textContent || '')?.[1]
      const accountAction = node.querySelector<HTMLElement>('[onclick*="deleteAccount"]')?.getAttribute('onclick') || ''
      const entryFid = /deleteAccount\(['"]([^'"]+)/.exec(accountAction)?.[1] || null
      return studentId ? { studentId, fid: entryFid } : null
    })
    .filter((value): value is { studentId: string; fid: string | null } => value !== null)
  const selected = (fid ? entries.find((entry) => entry.fid === fid) : null) || entries[0]
  if (!realName || !selected) return null
  return { studentId: selected.studentId, realName }
}

export function extractCourseEnded(document: Document): boolean | null {
  const explicit = document.querySelector<HTMLElement>('[data-course-ended]')?.dataset.courseEnded
  if (explicit === 'true') return true
  if (explicit === 'false') return false

  // 新版页面选择器
  const newEndBanner = firstText(document, [
    '.fanya-warn-txt',
    '.fanya-not-open-tip',
    '.fanya-course-end',
    '.course-end-tip',
  ])
  if (newEndBanner && /本课程已结课|已结课|课程已结束|已结束/.test(newEndBanner)) return true

  const endBanner = firstText(document, ['.warn-txt', '.not-open-tip'])
  if (endBanner && /本课程已结课|已结课|课程已结束/.test(endBanner)) return true

  // 新版页面状态选择器
  const newStateText = firstText(document, [
    '.fanya-course-state',
    '.fanya-course-status',
    '.course-state-text',
  ])
  if (newStateText) {
    if (/已结课|课程已结束|已结束/.test(newStateText)) return true
    if (/进行中|授课中|未开始/.test(newStateText)) return false
  }

  const stateText = firstText(document, ['.course-state', '.course-status', '[data-course-status]'])
  if (!stateText) return null
  if (/已结课|课程已结束/.test(stateText)) return true
  if (/进行中|授课中/.test(stateText)) return false
  return null
}

export function extractChaoxingCoursePage(
  document: Document,
  location: Location | URL,
): ChaoxingCoursePage | null {
  const role = extractCourseRole(location)
  const courseId = extractCourseId(document, location)
  const classId = extractClassId(document, location)
  const cpi = extractCpi(document, location)
  if (!courseId || !classId) return null
  return {
    role,
    courseId,
    classId,
    cpi: cpi || '',
    fid: firstValue(document, ['#fid', 'input[name="fid"]']),
    courseName: extractCourseName(document) || `课程 ${courseId}`,
    realName: extractVisibleRealName(document),
    courseEnded: extractCourseEnded(document) === true,
    homeworkListUrl:
      role === 'student'
        ? buildHomeworkListUrl(document, location, courseId, classId, cpi || '')
        : null,
  }
}

function buildHomeworkListUrl(
  document: Document,
  location: Location | URL,
  courseId: string,
  classId: string,
  cpi: string,
): string | null {
  // 新版页面选择器
  const newExisting = document.querySelector<HTMLIFrameElement>('iframe[class*="fanya-work"], iframe[id*="fanya-work"], .fanya-work-list iframe')?.src
  if (newExisting) return newExisting

  // 旧版页面选择器
  const existing = document.querySelector<HTMLIFrameElement>('iframe[id^="frame_content-zy"]')?.src
  if (existing) return existing

  // 新版页面 enc 选择器
  const newStudentEnc = firstValue(document, ['#enc', 'input[name="enc"]', '.fanya-enc'])
  const newWorkEnc = firstValue(document, ['#workEnc', 'input[name="workEnc"]', '.fanya-work-enc'])
  if (newStudentEnc && newWorkEnc) {
    const base = firstValue(document, ['#moocDomainName', 'input[name="moocDomainName"]']) || 'https://mooc1.chaoxing.com'
    const url = new URL('/mooc2/work/list', base)
    const current = location instanceof URL ? location : new URL(location.href)
    url.searchParams.set('courseId', courseId)
    url.searchParams.set('classId', classId)
    url.searchParams.set('cpi', cpi)
    url.searchParams.set('ut', firstValue(document, ['#heardUt']) || 's')
    const timestamp = firstValue(document, ['#t']) || current.searchParams.get('t')
    if (timestamp) url.searchParams.set('t', timestamp)
    url.searchParams.set('stuenc', newStudentEnc)
    url.searchParams.set('enc', newWorkEnc)
    return url.href
  }

  // 旧版页面 enc 选择器
  const studentEnc = firstValue(document, ['#enc', 'input[name="enc"]'])
  const workEnc = firstValue(document, ['#workEnc', 'input[name="workEnc"]'])
  if (!studentEnc || !workEnc) return null
  const base = firstValue(document, ['#moocDomainName', 'input[name="moocDomainName"]']) || 'https://mooc1.chaoxing.com'
  const url = new URL('/mooc2/work/list', base)
  const current = location instanceof URL ? location : new URL(location.href)
  url.searchParams.set('courseId', courseId)
  url.searchParams.set('classId', classId)
  url.searchParams.set('cpi', cpi)
  url.searchParams.set('ut', firstValue(document, ['#heardUt']) || 's')
  const timestamp = firstValue(document, ['#t']) || current.searchParams.get('t')
  if (timestamp) url.searchParams.set('t', timestamp)
  url.searchParams.set('stuenc', studentEnc)
  url.searchParams.set('enc', workEnc)
  return url.href
}

export function buildToolboxContext(document: Document, location: Location | URL): ToolboxContext | null {
  const role = extractCourseRole(location)
  const courseId = extractCourseId(document, location)
  const classId = extractClassId(document, location)
  const identity = extractStudentIdentity(document)
  const classIdentity = role === 'student' && identity ? parseStudentNumber(identity.studentId) : null
  if (!courseId || !classId || !identity || (role === 'student' && !classIdentity)) return null

  return {
    role,
    ...identity,
    grade: classIdentity?.grade ?? null,
    classNumber: classIdentity?.classNumber ?? null,
    classId,
    courseId,
    courseName: extractCourseName(document) || `课程 ${courseId}`,
    courseEnded: extractCourseEnded(document) === true,
  }
}

export function extractHomeworkList(document: Document, baseUrl: string): ChaoxingHomeworkListItem[] {
  // 新版页面选择器
  const newItems = [...document.querySelectorAll<HTMLElement>('.fanya-work-item, .work-item, .homework-item')]
  if (newItems.length > 0) {
    return newItems
      .map((node) => {
        const link = node.querySelector<HTMLAnchorElement>('a[href*="/work/task"]')
        const rawUrl = link?.href || node.getAttribute('data-url') || ''
        if (!rawUrl) return null
        const url = new URL(rawUrl, baseUrl)
        const assignmentId = url.searchParams.get('workId')?.trim() || ''
        const assignmentName =
          firstTextFromNode(node, ['.title', '.name', '.work-name']) ||
          node.textContent?.trim() ||
          '未命名作业'
        const status = firstTextFromNode(node, ['.status', '.state']) || ''
        if (!assignmentId) return null
        return {
          assignmentId,
          assignmentName,
          detailUrl: url.href,
          completed: /已完成|已批阅|待批阅/.test(status),
        }
      })
      .filter((item): item is ChaoxingHomeworkListItem => item !== null)
  }

  // 旧版页面选择器
  return [...document.querySelectorAll<HTMLElement>('li[data*="/work/task"], [role="link"][data*="/work/task"]')]
    .map((node) => {
      const rawUrl = node.getAttribute('data')?.trim()
      if (!rawUrl) return null
      const url = new URL(rawUrl, baseUrl)
      const assignmentId = url.searchParams.get('workId')?.trim() || ''
      const label = node.getAttribute('aria-label') || ''
      const assignmentName =
        firstTextFromNode(node, ['.right-content .overHidden2', '.overHidden2']) || label.split(';')[0]?.trim() || '未命名作业'
      const status = firstTextFromNode(node, ['.status']) || label
      if (!assignmentId) return null
      return {
        assignmentId,
        assignmentName,
        detailUrl: url.href,
        completed: /已完成|已批阅|待批阅/.test(status),
      }
    })
    .filter((item): item is ChaoxingHomeworkListItem => item !== null)
}

export function extractHomeworkDetail(
  document: Document,
  fallback: Pick<ChaoxingHomeworkListItem, 'assignmentId' | 'assignmentName'>,
): HomeworkSnapshotInput {
  // 新版页面选择器
  const newFullScoreText = [...document.querySelectorAll<HTMLElement>('.fanya-info-head span, .score-info span')]
    .map((node) => node.textContent || '')
    .find((text) => /满分\s*[:：]/.test(text))
  if (newFullScoreText) {
    return {
      assignmentId: firstValue(document, ['#workId', '.fanya-work-id']) || fallback.assignmentId,
      assignmentName: firstText(document, ['.fanya-mark-title', '.fanya-work-title']) || fallback.assignmentName,
      score: numberOrNull(document.querySelector<HTMLElement>('.fanya-result-num .custom-style, .fanya-result-num i')?.textContent),
      totalScore: numberOrNull(newFullScoreText.replace(/^.*满分\s*[:：]\s*/, '')),
    }
  }

  // 旧版页面选择器
  const fullScoreText = [...document.querySelectorAll<HTMLElement>('.infoHead span')]
    .map((node) => node.textContent || '')
    .find((text) => /满分\s*[:：]/.test(text))
  return {
    assignmentId: firstValue(document, ['#workId']) || fallback.assignmentId,
    assignmentName: firstText(document, ['.mark_title']) || fallback.assignmentName,
    score: numberOrNull(document.querySelector<HTMLElement>('.resultNum .custom-style, .resultNum i')?.textContent),
    totalScore: numberOrNull(fullScoreText?.replace(/^.*满分\s*[:：]\s*/, '')),
  }
}

/** Compatibility hook for explicitly annotated integration fixtures. */
export function extractHomeworkSnapshots(document: Document): HomeworkSnapshotInput[] {
  return [...document.querySelectorAll<HTMLElement>('[data-dbkang-assignment]')]
    .map((node) => ({
      assignmentId: node.dataset.assignmentId?.trim() || '',
      assignmentName: node.dataset.assignmentName?.trim() || '未命名作业',
      score: numberOrNull(node.dataset.score),
      totalScore: numberOrNull(node.dataset.totalScore),
    }))
    .filter((item) => item.assignmentId.length > 0)
}

function firstTextFromNode(node: HTMLElement, selectors: string[]): string | null {
  for (const selector of selectors) {
    const value = node.querySelector<HTMLElement>(selector)?.textContent?.trim()
    if (value) return value
  }
  return null
}

function numberOrNull(value: string | undefined | null): number | null {
  if (value == null || value.trim() === '') return null
  const matched = /-?\d+(?:\.\d+)?/.exec(value.replace(/,/g, ''))
  if (!matched) return null
  const parsed = Number(matched[0])
  return Number.isFinite(parsed) ? parsed : null
}
