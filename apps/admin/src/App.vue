<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import type { AdminAchievement, AdminAnnouncement, AdminStudent, Course, Dashboard } from './api'
import { request } from './api'

type Page = 'dashboard' | 'courses' | 'achievements' | 'announcements' | 'students'

const token = ref(localStorage.getItem('dbkang-admin-token') || '')
const page = ref<Page>('dashboard')
const loading = ref(false)
const error = ref<string | null>(null)
const loginForm = reactive({ username: 'admin', password: '' })
const dashboard = ref<Dashboard | null>(null)
const courses = ref<Course[]>([])
const selectedCourseId = ref<number | null>(null)
const achievements = ref<AdminAchievement[]>([])
const announcements = ref<AdminAnnouncement[]>([])
const students = ref<AdminStudent[]>([])
const courseForm = reactive({ courseUrlOrId: '', name: '' })
const achievementForm = reactive({
  name: '',
  description: '',
  tier: 'bronze' as AdminAchievement['tier'],
  triggerType: 'automatic' as AdminAchievement['triggerType'],
  ruleExpression: 'state.study.total_focus_minutes >= 60',
  progressKey: 'study.total_focus_minutes',
  progressTarget: 60,
  hidden: false,
  sortOrder: 100,
})
const announcementForm = reactive({ title: '', content: '', order: 100 })
const grantStudentIds = ref('')
const grantScope = ref<'students' | 'class' | 'course'>('students')
const grantClassId = ref('')
const editingAchievementId = ref<number | null>(null)
const editingAnnouncementId = ref<number | null>(null)
const copyTargetCourseId = ref<number | null>(null)
const studentQuery = ref('')
const studentGrade = ref<number | null>(null)
const studentClassNumber = ref<number | null>(null)

const selectedCourse = computed(() => courses.value.find((item) => item.id === selectedCourseId.value) || null)
const navItems: Array<{ id: Page; label: string }> = [
  { id: 'dashboard', label: '概览' },
  { id: 'courses', label: '课程' },
  { id: 'students', label: '学生' },
  { id: 'achievements', label: '成就' },
  { id: 'announcements', label: '公告' },
]

onMounted(() => {
  if (token.value) void loadBaseData()
})

async function login(): Promise<void> {
  await run(async () => {
    const result = await request<{ accessToken: string }>('/api/v1/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify(loginForm),
    })
    token.value = result.accessToken
    localStorage.setItem('dbkang-admin-token', result.accessToken)
    await loadBaseData()
  })
}

function logout(): void {
  localStorage.removeItem('dbkang-admin-token')
  token.value = ''
  dashboard.value = null
}

async function loadBaseData(): Promise<void> {
  await run(async () => {
    const [dashboardData, courseData] = await Promise.all([
      adminRequest<Dashboard>('/api/v1/admin/dashboard'),
      adminRequest<Course[]>('/api/v1/admin/courses'),
    ])
    dashboard.value = dashboardData
    courses.value = courseData
    selectedCourseId.value ||= courseData[0]?.id || null
  }, true)
}

async function navigate(next: Page): Promise<void> {
  page.value = next
  if (next === 'students') await loadStudents()
  if (next === 'achievements') await loadAchievements()
  if (next === 'announcements') await loadAnnouncements()
}

async function createCourse(): Promise<void> {
  await run(async () => {
    await adminRequest('/api/v1/admin/courses', {
      method: 'POST',
      body: JSON.stringify({
        courseUrlOrId: courseForm.courseUrlOrId,
        name: courseForm.name || null,
      }),
    })
    courseForm.courseUrlOrId = ''
    courseForm.name = ''
    await loadBaseData()
  })
}

async function toggleCourse(course: Course): Promise<void> {
  await run(async () => {
    await adminRequest(`/api/v1/admin/courses/${course.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !course.enabled }),
    })
    await loadBaseData()
  })
}

async function deleteCourse(course: Course): Promise<void> {
  const confirmed = window.confirm(
    `确定完整删除课程“${course.name}”（courseId：${course.courseId}）吗？\n\n课程成员关系、成就与解锁、公告、作业记录、专注记录和番茄记录都会永久删除；学生账号不会删除。此操作无法撤销。`,
  )
  if (!confirmed) return
  await run(async () => {
    await adminRequest(`/api/v1/admin/courses/${course.id}`, { method: 'DELETE' })
    if (selectedCourseId.value === course.id) {
      selectedCourseId.value = null
      achievements.value = []
      announcements.value = []
      students.value = []
    }
    await loadBaseData()
  })
}

async function loadAchievements(): Promise<void> {
  if (!selectedCourseId.value) return
  await run(async () => {
    achievements.value = await adminRequest(`/api/v1/admin/courses/${selectedCourseId.value}/achievements`)
  }, true)
}

async function createAchievement(): Promise<void> {
  if (!selectedCourseId.value) return
  await run(async () => {
    const path = editingAchievementId.value
      ? `/api/v1/admin/achievements/${editingAchievementId.value}`
      : `/api/v1/admin/courses/${selectedCourseId.value}/achievements`
    await adminRequest(path, {
      method: editingAchievementId.value ? 'PUT' : 'POST',
      body: JSON.stringify({
        ...achievementForm,
        ruleExpression: achievementForm.triggerType === 'automatic' ? achievementForm.ruleExpression : null,
        progressKey: achievementForm.progressKey || null,
        progressTarget: achievementForm.progressTarget || null,
      }),
    })
    achievementForm.name = ''
    achievementForm.description = ''
    editingAchievementId.value = null
    await loadAchievements()
  })
}

function editAchievement(item: AdminAchievement): void {
  editingAchievementId.value = item.id
  Object.assign(achievementForm, {
    name: item.name,
    description: item.description,
    tier: item.tier,
    triggerType: item.triggerType,
    ruleExpression: item.ruleExpression || '',
    progressKey: item.progressKey || '',
    progressTarget: item.progressTarget || 1,
    hidden: item.hidden,
    sortOrder: item.sortOrder,
  })
}

function cancelAchievementEdit(): void {
  editingAchievementId.value = null
  achievementForm.name = ''
  achievementForm.description = ''
}

async function copyAchievements(): Promise<void> {
  if (!selectedCourseId.value || !copyTargetCourseId.value) return
  await run(async () => {
    await adminRequest(`/api/v1/admin/courses/${selectedCourseId.value}/achievements/copy-to/${copyTargetCourseId.value}`, { method: 'POST' })
  })
}

async function deleteAchievement(item: AdminAchievement): Promise<void> {
  if (!window.confirm(`确定永久删除成就“${item.name}”及其全部解锁记录吗？`)) return
  await run(async () => {
    await adminRequest(`/api/v1/admin/achievements/${item.id}`, { method: 'DELETE' })
    await loadAchievements()
  })
}

async function grantAchievement(item: AdminAchievement, grant: boolean): Promise<void> {
  const studentIds = grantStudentIds.value.split(/[\s,，]+/).filter(Boolean)
  if (grantScope.value === 'students' && !studentIds.length) {
    error.value = '请先输入至少一个学号。'
    return
  }
  if (grantScope.value === 'class' && !grantClassId.value.trim()) {
    error.value = '请填写学习通班级 ID。'
    return
  }
  await run(async () => {
    await adminRequest(`/api/v1/admin/achievements/${item.id}/grant`, {
      method: 'POST',
      body: JSON.stringify({
        studentIds: grantScope.value === 'students' ? studentIds : [],
        classId: grantScope.value === 'class' ? grantClassId.value.trim() : null,
        allCourseMembers: grantScope.value === 'course',
        grant,
      }),
    })
  })
}

async function loadAnnouncements(): Promise<void> {
  if (!selectedCourseId.value) return
  await run(async () => {
    announcements.value = await adminRequest(`/api/v1/admin/courses/${selectedCourseId.value}/announcements`)
  }, true)
}

async function createAnnouncement(): Promise<void> {
  if (!selectedCourseId.value) return
  await run(async () => {
    const path = editingAnnouncementId.value
      ? `/api/v1/admin/announcements/${editingAnnouncementId.value}`
      : `/api/v1/admin/courses/${selectedCourseId.value}/announcements`
    await adminRequest(path, {
      method: editingAnnouncementId.value ? 'PUT' : 'POST',
      body: JSON.stringify(announcementForm),
    })
    announcementForm.title = ''
    announcementForm.content = ''
    editingAnnouncementId.value = null
    await loadAnnouncements()
  })
}

function editAnnouncement(item: AdminAnnouncement): void {
  editingAnnouncementId.value = item.id
  Object.assign(announcementForm, { title: item.title, content: item.content, order: item.order })
}

async function deleteAnnouncement(item: AdminAnnouncement): Promise<void> {
  if (!window.confirm(`确定删除公告“${item.title}”吗？`)) return
  await run(async () => {
    await adminRequest(`/api/v1/admin/announcements/${item.id}`, { method: 'DELETE' })
    await loadAnnouncements()
  })
}

async function loadStudents(): Promise<void> {
  await run(async () => {
    const params = new URLSearchParams()
    if (selectedCourseId.value) params.set('course_id', String(selectedCourseId.value))
    if (studentQuery.value.trim()) params.set('query', studentQuery.value.trim())
    if (studentGrade.value) params.set('grade', String(studentGrade.value))
    if (studentClassNumber.value) params.set('class_number', String(studentClassNumber.value))
    students.value = await adminRequest(`/api/v1/admin/students?${params}`)
  }, true)
}

async function editStudentNickname(student: AdminStudent): Promise<void> {
  const nickname = window.prompt('输入新的昵称（1～20 个字符）', student.nickname)?.trim()
  if (!nickname) return
  await updateStudent(student, { nickname })
}

async function resetStudentProfile(student: AdminStudent): Promise<void> {
  if (!window.confirm(`将 ${student.realName} 的昵称与头像重置为默认值吗？`)) return
  await updateStudent(student, { resetProfile: true })
}

async function toggleStudentStatus(student: AdminStudent): Promise<void> {
  if (student.status === 'disabled') {
    await updateStudent(student, { disabled: false })
    return
  }
  const reason = window.prompt('请输入禁用原因（学生端会显示）')?.trim()
  if (!reason) return
  await updateStudent(student, { disabled: true, disabledReason: reason })
}

async function updateStudent(student: AdminStudent, payload: Record<string, unknown>): Promise<void> {
  await run(async () => {
    await adminRequest(`/api/v1/admin/students/${encodeURIComponent(student.studentId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    await loadStudents()
  })
}

function formatMinutes(seconds: number): string {
  return `${Math.floor(seconds / 60)} 分钟`
}

async function changeSelectedCourse(value: number): Promise<void> {
  selectedCourseId.value = value
  if (page.value === 'achievements') await loadAchievements()
  if (page.value === 'announcements') await loadAnnouncements()
  if (page.value === 'students') await loadStudents()
}

function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init, token.value)
}

async function run(action: () => Promise<void>, silent = false): Promise<void> {
  if (!silent) error.value = null
  loading.value = true
  try {
    await action()
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : '操作失败'
    error.value = message
    if (/登录|会话/.test(message)) logout()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div v-if="!token" class="login-page">
    <form class="login-card dbk-panel" @submit.prevent="login">
      <div class="admin-mark">DB</div>
      <h1>DBKang Toolbox</h1>
      <p>管理员登录</p>
      <label>用户名<input v-model="loginForm.username" class="dbk-input" autocomplete="username" required /></label>
      <label>密码<input v-model="loginForm.password" class="dbk-input" type="password" autocomplete="current-password" required /></label>
      <p v-if="error" class="form-error">{{ error }}</p>
      <button class="dbk-button" type="submit" :disabled="loading">{{ loading ? '正在登录…' : '登录' }}</button>
    </form>
  </div>

  <div v-else class="admin-shell">
    <aside class="sidebar">
      <div class="sidebar-brand"><div class="admin-mark">DB</div><span><strong>DBKang Toolbox</strong><small>管理端</small></span></div>
      <nav>
        <button v-for="item in navItems" :key="item.id" type="button" :class="{ active: page === item.id }" @click="navigate(item.id)">{{ item.label }}</button>
      </nav>
      <button class="logout-button" type="button" @click="logout">退出登录</button>
    </aside>

    <main>
      <header class="admin-header">
        <div><p>DBKang Toolbox 管理端</p><h1>{{ navItems.find((item) => item.id === page)?.label }}</h1></div>
        <label v-if="page !== 'dashboard' && page !== 'courses'">当前课程
          <select class="dbk-input" :value="selectedCourseId || ''" @change="changeSelectedCourse(Number(($event.target as HTMLSelectElement).value))">
            <option v-for="course in courses" :key="course.id" :value="course.id">{{ course.name }}</option>
          </select>
        </label>
      </header>
      <div v-if="error" class="error-banner">{{ error }}<button type="button" @click="error = null">关闭</button></div>

      <section v-if="page === 'dashboard' && dashboard" class="metric-grid">
        <article><span>课程</span><strong>{{ dashboard.courseCount }}</strong></article>
        <article><span>注册学生</span><strong>{{ dashboard.studentCount }}</strong></article>
        <article><span>正在专注</span><strong>{{ dashboard.focusingStudentCount }}</strong></article>
        <article><span>成就</span><strong>{{ dashboard.achievementCount }}</strong></article>
        <article><span>公告</span><strong>{{ dashboard.announcementCount }}</strong></article>
      </section>

      <template v-else-if="page === 'courses'">
        <form class="inline-form dbk-panel" @submit.prevent="createCourse">
          <label>课程链接或 courseId<input v-model="courseForm.courseUrlOrId" class="dbk-input" required /></label>
          <label>后台备注（可选，不覆盖学生课程名）<input v-model="courseForm.name" class="dbk-input" /></label>
          <button class="dbk-button" type="submit">添加课程</button>
        </form>
        <div class="data-panel dbk-panel">
          <table><thead><tr><th>后台备注</th><th>courseId</th><th>成员</th><th>状态</th><th>操作</th></tr></thead>
            <tbody><tr v-for="course in courses" :key="course.id"><td>{{ course.name }}</td><td>{{ course.courseId }}</td><td>{{ course.memberCount }}</td><td><span :class="['status', { disabled: !course.enabled }]">{{ course.enabled ? '已启用' : '已停用' }}</span></td><td><button class="text-button" type="button" @click="toggleCourse(course)">{{ course.enabled ? '停用' : '恢复' }}</button><button class="text-button danger" type="button" @click="deleteCourse(course)">删除</button></td></tr></tbody>
          </table>
        </div>
      </template>

      <template v-else-if="page === 'achievements'">
        <form class="editor-form dbk-panel" @submit.prevent="createAchievement">
          <div class="form-heading"><h2>{{ editingAchievementId ? '编辑成就' : '新建成就' }}</h2><span>保存自动规则后会立即为当前课程已有学生补判定。</span></div>
          <label>名称<input v-model="achievementForm.name" class="dbk-input" required /></label>
          <label>描述<input v-model="achievementForm.description" class="dbk-input" required /></label>
          <label>等级<select v-model="achievementForm.tier" class="dbk-input"><option value="bronze">铜</option><option value="silver">银</option><option value="gold">金</option></select></label>
          <label>触发方式<select v-model="achievementForm.triggerType" class="dbk-input"><option value="automatic">自动</option><option value="manual">手动</option></select></label>
          <label class="wide">规则表达式<input v-model="achievementForm.ruleExpression" class="dbk-input" :disabled="achievementForm.triggerType === 'manual'" /></label>
          <label>进度字段<input v-model="achievementForm.progressKey" class="dbk-input" /></label>
          <label>进度目标<input v-model.number="achievementForm.progressTarget" class="dbk-input" type="number" min="0.01" step="0.01" /></label>
          <label>排序<input v-model.number="achievementForm.sortOrder" class="dbk-input" type="number" /></label>
          <label class="check-label"><input v-model="achievementForm.hidden" type="checkbox" /> 隐藏成就</label>
          <button class="dbk-button" type="submit">{{ editingAchievementId ? '保存修改' : '创建成就' }}</button>
          <button v-if="editingAchievementId" class="dbk-button dbk-button--secondary" type="button" @click="cancelAchievementEdit">取消编辑</button>
        </form>
        <div class="grant-box dbk-panel">
          <label>批量范围<select v-model="grantScope" class="dbk-input"><option value="students">指定学号</option><option value="class">当前课程的指定班级</option><option value="course">当前课程全部成员</option></select></label>
          <label v-if="grantScope === 'students'">批量学号<input v-model="grantStudentIds" class="dbk-input" placeholder="可用空格、逗号或换行分隔" /></label>
          <label v-else-if="grantScope === 'class'">学习通班级 ID（clazzid）<input v-model="grantClassId" class="dbk-input" inputmode="numeric" /></label>
        </div>
        <div class="grant-box dbk-panel"><label>复制整套成就到<select v-model.number="copyTargetCourseId" class="dbk-input"><option :value="null">选择目标课程</option><option v-for="course in courses.filter(item => item.id !== selectedCourseId)" :key="course.id" :value="course.id">{{ course.name }}</option></select></label><button class="dbk-button dbk-button--secondary" type="button" :disabled="!copyTargetCourseId" @click="copyAchievements">复制配置</button></div>
        <div class="data-panel dbk-panel"><table><thead><tr><th>成就</th><th>等级</th><th>触发</th><th>规则</th><th>操作</th></tr></thead><tbody>
          <tr v-for="item in achievements" :key="item.id"><td><strong>{{ item.name }}</strong><small>{{ item.description }}</small></td><td>{{ item.tier }}</td><td>{{ item.triggerType === 'automatic' ? '自动' : '手动' }}</td><td class="rule-cell">{{ item.ruleExpression || '—' }}</td><td><button class="text-button" type="button" @click="editAchievement(item)">编辑</button><button class="text-button" type="button" @click="grantAchievement(item, true)">授予</button><button class="text-button" type="button" @click="grantAchievement(item, false)">撤销</button><button class="text-button danger" type="button" @click="deleteAchievement(item)">删除</button></td></tr>
        </tbody></table></div>
      </template>

      <template v-else-if="page === 'announcements'">
        <form class="editor-form announcement-form dbk-panel" @submit.prevent="createAnnouncement">
          <div class="form-heading"><h2>{{ editingAnnouncementId ? '编辑课程公告' : '发布课程公告' }}</h2><span>{{ selectedCourse?.name }}</span></div>
          <label>标题<input v-model="announcementForm.title" class="dbk-input" required /></label>
          <label>排序<input v-model.number="announcementForm.order" class="dbk-input" type="number" /></label>
          <label class="wide">正文<textarea v-model="announcementForm.content" class="dbk-input" rows="5" required /></label>
          <button class="dbk-button" type="submit">{{ editingAnnouncementId ? '保存修改' : '发布公告' }}</button>
        </form>
        <div class="announcement-list"><article v-for="item in announcements" :key="item.id" class="dbk-panel"><span>排序 {{ item.order }}</span><h2>{{ item.title }}</h2><p>{{ item.content }}</p><div><button class="text-button" type="button" @click="editAnnouncement(item)">编辑</button><button class="text-button danger" type="button" @click="deleteAnnouncement(item)">删除</button></div></article></div>
      </template>

      <template v-else-if="page === 'students'">
        <form class="student-filters dbk-panel" @submit.prevent="loadStudents"><label>搜索<input v-model="studentQuery" class="dbk-input" placeholder="学号、姓名或昵称" /></label><label>年级<input v-model.number="studentGrade" class="dbk-input" type="number" /></label><label>行政班序号<input v-model.number="studentClassNumber" class="dbk-input" type="number" min="1" max="9" /></label><button class="dbk-button" type="submit">筛选</button></form>
        <div class="data-panel dbk-panel"><table><thead><tr><th>学号</th><th>姓名 / 昵称</th><th>学生资料</th><th>教学班 ID</th><th>累计专注</th><th>番茄 / 成就</th><th>状态</th><th>操作</th></tr></thead><tbody>
          <tr v-for="student in students" :key="student.studentId"><td>{{ student.studentId }}</td><td><strong>{{ student.realName }}</strong><small>{{ student.nickname }}</small></td><td>{{ student.grade }} 级 · 行政班 {{ student.classNumber }}</td><td>{{ student.classId || '—' }}</td><td>{{ formatMinutes(student.totalFocusSeconds) }}</td><td>{{ student.totalPomodoros }} / {{ student.achievementCount }}</td><td><span :class="['status', { disabled: student.status === 'disabled' }]">{{ student.status === 'active' ? '正常' : `已停用：${student.disabledReason || '未提供原因'}` }}</span></td><td><button class="text-button" type="button" @click="editStudentNickname(student)">改昵称</button><button class="text-button" type="button" @click="resetStudentProfile(student)">重置资料</button><button :class="['text-button', { danger: student.status === 'active' }]" type="button" @click="toggleStudentStatus(student)">{{ student.status === 'active' ? '禁用' : '恢复' }}</button></td></tr>
        </tbody></table></div>
      </template>

      <div v-if="loading" class="busy-line" />
    </main>
  </div>
</template>
