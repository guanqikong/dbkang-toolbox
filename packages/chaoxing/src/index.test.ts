import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import {
  buildToolboxContext,
  extractAccountIdentity,
  extractChaoxingCoursePage,
  extractCourseContentFrame,
  extractCourseId,
  extractCourseRole,
  extractHomeworkDetail,
  extractHomeworkList,
  extractHomeworkSnapshots,
  parseStudentNumber,
  resolveCourseContentFrameLayout,
} from './index'

describe('Chaoxing adapter', () => {
  it('parses the fixed school student number format', () => {
    expect(parseStudentNumber('2099000101')).toEqual({ grade: 2099, classNumber: 1 })
    expect(parseStudentNumber('209900010')).toBeNull()
  })

  it('prefers courseId from the current URL', () => {
    const dom = new JSDOM('<html data-course-id="fallback"></html>')
    expect(extractCourseId(dom.window.document, new URL('https://example.com/course?courseId=123456'))).toBe(
      '123456',
    )
  })

  it('builds a complete context only when identity is available', () => {
    const dom = new JSDOM(`
      <main data-course-id="123" data-class-id="class-123" data-course-name="大学计算机">
        <span data-student-id="2099000101" data-real-name="测试学生"></span>
        <span data-course-ended="false"></span>
      </main>
    `)
    expect(buildToolboxContext(dom.window.document, new URL('https://example.com/course'))).toEqual({
      role: 'student',
      studentId: '2099000101',
      realName: '测试学生',
      grade: 2099,
      classNumber: 1,
      classId: 'class-123',
      courseId: '123',
      courseName: '大学计算机',
      courseEnded: false,
    })
  })

  it('extracts only explicit homework bridge nodes', () => {
    const dom = new JSDOM(`
      <div data-dbkang-assignment data-assignment-id="a1" data-assignment-name="实验一" data-score="5" data-total-score="5"></div>
    `)
    expect(extractHomeworkSnapshots(dom.window.document)).toEqual([
      { assignmentId: 'a1', assignmentName: '实验一', score: 5, totalScore: 5 },
    ])
  })

  it('parses the real Chaoxing course page by courseId and constructs its work list URL', () => {
    const dom = new JSDOM(`
      <input id="courseid" value="900000001"><input id="clazzid" value="800000001">
      <input id="cpi" value="700000001"><input id="fid" value="9999">
      <input id="enc" value="student-enc"><input id="workEnc" value="work-enc">
      <input id="moocDomainName" value="https://mooc1.chaoxing.com">
      <dl class="classDl"><dd title="示例课程">示例课程</dd></dl>
      <div class="Header"><div class="name"><p>测试学生</p></div></div>
    `)
    const page = extractChaoxingCoursePage(
      dom.window.document,
      new URL('https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/stu?pageHeader=0'),
    )
    expect(page).toMatchObject({
      role: 'student',
      courseId: '900000001',
      classId: '800000001',
      cpi: '700000001',
      courseName: '示例课程',
      realName: '测试学生',
      courseEnded: false,
    })
    expect(page?.homeworkListUrl).toContain('courseId=900000001')
    expect(page?.homeworkListUrl).toContain('classId=800000001')
  })

  it('recognizes teacher course pages without applying the student number format', () => {
    const location = new URL(
      'https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/tch?courseid=900000002&clazzid=800000002&cpi=700000002',
    )
    const dom = new JSDOM(`
      <main data-course-name="教师看到的课程">
        <span data-student-id="teacher-test-001" data-real-name="测试教师"></span>
      </main>
    `)

    expect(extractCourseRole(location)).toBe('teacher')
    expect(extractChaoxingCoursePage(dom.window.document, location)).toMatchObject({
      role: 'teacher',
      courseId: '900000002',
      classId: '800000002',
      homeworkListUrl: null,
    })
    expect(buildToolboxContext(dom.window.document, location)).toEqual({
      role: 'teacher',
      studentId: 'teacher-test-001',
      realName: '测试教师',
      grade: null,
      classNumber: null,
      classId: '800000002',
      courseId: '900000002',
      courseName: '教师看到的课程',
      courseEnded: false,
    })
  })

  it('reuses the built-in teacher content frame layout to avoid the sidebar', () => {
    const dom = new JSDOM(`
      <iframe
        id="frame_content-gl"
        width="1740"
        height="867"
        style="position:absolute;inset:52px 0 0 180px;border:0;width:1732px;height:567px"
      ></iframe>
    `)
    const reference = extractCourseContentFrame(dom.window.document)

    expect(reference?.id).toBe('frame_content-gl')
    expect(resolveCourseContentFrameLayout(reference, 'teacher')).toEqual({
      position: 'absolute',
      inset: '52px 0 0 180px',
      top: '52px',
      right: '0',
      bottom: '0',
      left: '180px',
      width: '1732px',
      height: '567px',
      minHeight: '0',
    })
  })

  it('parses the signed-in account identity for the matching institution', () => {
    const dom = new JSDOM(`
      <span id="messageName">测试学生</span>
      <ul>
        <li><a onclick="deleteAccount('1000','other')">删除</a><p class="xuehao">学号/工号:0000000000</p></li>
        <li><a onclick="deleteAccount('9999','2099000202')">删除</a><p class="xuehao">学号/工号:2099000202</p></li>
      </ul>
    `)
    expect(extractAccountIdentity(dom.window.document, '9999')).toEqual({
      studentId: '2099000202',
      realName: '测试学生',
    })
  })

  it('parses real work list and score detail DOM', () => {
    const list = new JSDOM(`
      <ul><li data="https://mooc1.chaoxing.com/mooc-ans/mooc2/work/task?workId=60000001&amp;answerId=50000001" aria-label="示例作业 ; 已完成" role="link">
        <div class="right-content"><p class="overHidden2">示例作业</p><p class="status">已完成</p></div>
      </li></ul>
    `)
    const items = extractHomeworkList(list.window.document, 'https://mooc1.chaoxing.com/')
    expect(items).toEqual([
      {
        assignmentId: '60000001',
        assignmentName: '示例作业',
        detailUrl: 'https://mooc1.chaoxing.com/mooc-ans/mooc2/work/task?workId=60000001&answerId=50000001',
        completed: true,
      },
    ])

    const detail = new JSDOM(`
      <input id="workId" value="60000001"><h2 class="mark_title">示例作业</h2>
      <div class="infoHead"><span>题量: 30</span><span>满分: 150</span></div>
      <span class="resultNum"><i class="custom-style">137.5</i>分</span>
    `)
    expect(extractHomeworkDetail(detail.window.document, items[0]!)).toEqual({
      assignmentId: '60000001',
      assignmentName: '示例作业',
      score: 137.5,
      totalScore: 150,
    })
  })

  it('recognizes the real ended-course banner', () => {
    const dom = new JSDOM(`
      <input id="courseid" value="900000003"><input id="clazzid" value="800000003"><input id="cpi" value="700000003">
      <span class="warn-txt">本课程已结课，任务点、作业、章节测验将无法完成</span>
    `)
    expect(extractChaoxingCoursePage(dom.window.document, new URL('https://example.com'))?.courseEnded).toBe(true)
  })
})
